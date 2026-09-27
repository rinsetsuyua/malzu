import type { AtlasEdge, MalwareNode } from "../data/types";
import { NAME_GAP, NAME_HEIGHT, compactName, nodeMark } from "./nodeLabel";

/**
 * Layout — positions are derived from the edges, never pinned to node ids.
 *
 * The web view works cluster by cluster: each connected cluster is laid out on
 * its own, then the clusters are shelf-packed largest first, so the page reads
 * as "one large web, a few mid-sized clusters, then small lineages" instead of
 * sixteen clusters scattered around a shared centre. The lineage view puts
 * ancestry trees on a first-seen timeline. Everything is seeded from
 * node ids, so the result is stable across renders and filters (no jitter), and
 * adding or re-wiring families re-arranges the graph on its own.
 *
 * Coordinates are render px in both axes.
 */

export type PositionedNode = MalwareNode & {
  x: number;
  y: number;
  degree: number;
  /** distinct public sources citing the family or any relationship touching it */
  evidence: number;
  /** dot radius; area is proportional to evidence */
  radius: number;
  /** half the width of the name set below the dot */
  labelHalfWidth: number;
};

export type PositionedEdge = AtlasEdge & {
  fromNode: PositionedNode;
  toNode: PositionedNode;
};

export type GraphBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** The lineage view's year axis: gridlines at year starts, labels mid-year. */
export type TimeAxis = {
  years: Array<{ year: number; start: number; middle: number }>;
  top: number;
  bottom: number;
  /** x of the column for families without a first-seen date, if any */
  undatedX?: number;
};

export type GraphLayout = {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  bounds: GraphBounds;
  axis?: TimeAxis;
};

export type LayoutMode = "web" | "lineage";

// directed ancestry edges point child -> parent (descendant -> ancestor)
export const ANCESTRY_TYPES = new Set(["derived_from", "forked_from", "inspired_by", "variant_of"]);

type Vec = { x: number; y: number };
/** a node's footprint around its dot centre: the dot plus the name below it */
type Box = { halfWidth: number; top: number; bottom: number };

const IDEAL_EDGE = 92; // Fruchterman–Reingold ideal edge length, px
const FORCE_ITERATIONS = 500;
const CLEARANCE = 10; // px between footprints after separation
const CLUSTER_SPACING = 64; // px between packed clusters
const PACK_ASPECT = 1.7; // target width:height of the packed page
const YEAR_WIDTH = 120; // px per year on the lineage timeline
const LANE_ROW = 50; // px between rows inside one lineage band
const BAND_GAP = 30; // px between lineage bands
const AXIS_ROOM = 44; // px above the first band for the year labels

// stable pseudo-random in [0, 1) from a string — deterministic seeding
function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function evidenceCounts(nodes: MalwareNode[], edges: AtlasEdge[]): Map<string, number> {
  const cited = new Map(
    nodes.map((node) => [
      node.id,
      new Set([...(node.sources ?? []), ...(node.first_seen?.sources ?? [])].map((evidence) => evidence.source)),
    ]),
  );
  for (const edge of edges) {
    for (const id of [edge.from, edge.to]) for (const evidence of edge.sources) cited.get(id)?.add(evidence.source);
  }
  return new Map([...cited].map(([id, sources]) => [id, sources.size]));
}

/** Connected clusters, largest first (ties by the name of their busiest family). */
function clusters(ids: string[], edges: AtlasEdge[], names: Map<string, string>): string[][] {
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id];
    const members: string[] = [];
    seen.add(id);
    while (stack.length) {
      const current = stack.pop()!;
      members.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    groups.push(members.sort());
  }
  const hub = (members: string[]) =>
    [...members].sort((a, b) => adjacency.get(b)!.length - adjacency.get(a)!.length || a.localeCompare(b))[0];
  return groups.sort((a, b) => b.length - a.length || names.get(hub(a))!.localeCompare(names.get(hub(b))!));
}

/**
 * Removes footprint overlap. Each overlapping pair is pushed apart along the
 * axis that needs the smaller move, so names never collide and clusters keep
 * the shape the forces gave them. Deterministic.
 */
function separate(ids: string[], pos: Map<string, Vec>, boxes: Map<string, Box>): void {
  for (let pass = 0; pass < 160; pass += 1) {
    let moved = false;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = pos.get(ids[i])!;
        const b = pos.get(ids[j])!;
        const boxA = boxes.get(ids[i])!;
        const boxB = boxes.get(ids[j])!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = boxA.halfWidth + boxB.halfWidth + CLEARANCE - Math.abs(dx);
        const overlapY = (dy >= 0 ? boxA.bottom + boxB.top : boxB.bottom + boxA.top) + CLEARANCE - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const tieBreak = hashUnit(`${ids[i]}|${ids[j]}`) < 0.5 ? -1 : 1;
        if (overlapX < overlapY) {
          const sign = dx === 0 ? tieBreak : Math.sign(dx);
          a.x -= (sign * overlapX) / 2;
          b.x += (sign * overlapX) / 2;
        } else {
          const sign = dy === 0 ? tieBreak : Math.sign(dy);
          a.y -= (sign * overlapY) / 2;
          b.y += (sign * overlapY) / 2;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** Fruchterman–Reingold on one cluster, then rotated so its long axis runs flat. */
function forceCluster(ids: string[], edges: AtlasEdge[]): Map<string, Vec> {
  const pos = new Map<string, Vec>();
  ids.forEach((id, index) => {
    const angle = (index / ids.length) * Math.PI * 2 + hashUnit(id) * 0.6;
    const radius = ((IDEAL_EDGE * Math.sqrt(ids.length)) / 2) * (0.7 + 0.6 * hashUnit(`${id}:r`));
    pos.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });
  if (ids.length < 2) return pos;

  const k = IDEAL_EDGE;
  let temperature = k;
  const cool = Math.pow(1 / temperature, 1 / FORCE_ITERATIONS);
  const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));

  for (let iteration = 0; iteration < FORCE_ITERATIONS; iteration += 1) {
    for (const d of disp.values()) {
      d.x = 0;
      d.y = 0;
    }
    // repulsion between every pair (k² / d)
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = pos.get(ids[i])!;
        const b = pos.get(ids[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = hashUnit(`${ids[i]}${ids[j]}`) - 0.5;
          dy = hashUnit(`${ids[j]}${ids[i]}`) - 0.5;
          dist = Math.hypot(dx, dy) || 0.01;
        }
        const force = (k * k) / dist;
        const da = disp.get(ids[i])!;
        const db = disp.get(ids[j])!;
        da.x += (dx / dist) * force;
        da.y += (dy / dist) * force;
        db.x -= (dx / dist) * force;
        db.y -= (dy / dist) * force;
      }
    }
    // attraction along edges (d² / k)
    for (const edge of edges) {
      const a = pos.get(edge.from)!;
      const b = pos.get(edge.to)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist * dist) / k;
      const da = disp.get(edge.from)!;
      const db = disp.get(edge.to)!;
      da.x -= (dx / dist) * force;
      da.y -= (dy / dist) * force;
      db.x += (dx / dist) * force;
      db.y += (dy / dist) * force;
    }
    // gentle pull to the cluster's own centre, then move capped by temperature
    for (const id of ids) {
      const p = pos.get(id)!;
      const d = disp.get(id)!;
      d.x -= p.x * 0.03;
      d.y -= p.y * 0.03;
      const len = Math.hypot(d.x, d.y) || 0.01;
      p.x += (d.x / len) * Math.min(len, temperature);
      p.y += (d.y / len) * Math.min(len, temperature);
    }
    temperature = Math.max(1, temperature * cool);
  }

  // principal-axis rotation: a stable orientation that also packs tidily
  const cx = ids.reduce((sum, id) => sum + pos.get(id)!.x, 0) / ids.length;
  const cy = ids.reduce((sum, id) => sum + pos.get(id)!.y, 0) / ids.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const id of ids) {
    const p = pos.get(id)!;
    sxx += (p.x - cx) ** 2;
    syy += (p.y - cy) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
  }
  const angle = -0.5 * Math.atan2(2 * sxy, sxx - syy);
  for (const id of ids) {
    const p = pos.get(id)!;
    const x = p.x - cx;
    const y = p.y - cy;
    p.x = x * Math.cos(angle) - y * Math.sin(angle);
    p.y = x * Math.sin(angle) + y * Math.cos(angle);
  }
  return pos;
}

/** A family's place in time: mid-month when the month is known, else mid-year. */
function firstSeenYear(node?: MalwareNode): number | undefined {
  const value = node?.first_seen?.value;
  if (!value) return undefined;
  const [year, month] = value.split("-").map(Number);
  return month ? year + (month - 0.5) / 12 : year + 0.5;
}

/**
 * Lineage on a first-seen timeline: x is the year a family was first seen, so
 * ancestors sit left of their descendants by date rather than by rank. Each
 * ancestry tree gets its own band, bands ordered by their earliest family.
 * Inside a band, each family takes the row nearest its already-placed
 * relatives that its name doesn't collide on. Families without a date wait in
 * an "undated" column after the last year.
 */
function timeline(
  groups: string[][],
  edges: AtlasEdge[],
  nodeById: Map<string, MalwareNode>,
  boxes: Map<string, Box>,
): { pos: Map<string, Vec>; axis: TimeAxis } {
  const when = new Map(groups.flat().map((id) => [id, firstSeenYear(nodeById.get(id))]));
  const dated = [...when.values()].filter((value): value is number => value !== undefined);
  const first = dated.length ? Math.floor(Math.min(...dated)) : 2000;
  const last = dated.length ? Math.floor(Math.max(...dated)) : 2000;
  const xOf = (year: number) => (year - first) * YEAR_WIDTH;
  const hasUndated = dated.length < when.size;
  const undatedX = xOf(last + 1) + YEAR_WIDTH * 0.6;

  const earliest = (members: string[]) => Math.min(...members.map((id) => when.get(id) ?? Infinity));
  const bands = [...groups].sort((a, b) => earliest(a) - earliest(b) || a[0].localeCompare(b[0]));

  const pos = new Map<string, Vec>();
  let bandTop = 0;
  for (const members of bands) {
    const memberSet = new Set(members);
    const bandEdges = edges.filter((edge) => memberSet.has(edge.from) && memberSet.has(edge.to));
    const order = [...members].sort((a, b) => (when.get(a) ?? Infinity) - (when.get(b) ?? Infinity) || a.localeCompare(b));
    const rows = new Map<string, number>();
    const x = (id: string) => (when.get(id) !== undefined ? xOf(when.get(id)!) : undatedX);

    for (const id of order) {
      const relatives = bandEdges
        .filter((edge) => edge.from === id || edge.to === id)
        .map((edge) => (edge.from === id ? edge.to : edge.from))
        .filter((other) => rows.has(other));
      // a new root starts its own row; a descendant sits near its relatives
      const preferred = relatives.length
        ? Math.round(relatives.reduce((sum, other) => sum + rows.get(other)!, 0) / relatives.length)
        : rows.size
          ? Math.max(...rows.values()) + 1
          : 0;
      const between = (value: number, a: number, b: number) =>
        value > Math.min(a, b) + 1 && value < Math.max(a, b) - 1;
      const fits = (row: number) =>
        [...rows].every(
          ([other, otherRow]) =>
            otherRow !== row ||
            Math.abs(x(other) - x(id)) >= boxes.get(other)!.halfWidth + boxes.get(id)!.halfWidth + CLEARANCE,
        ) &&
        // a line to a relative on the same row must not run through another family
        relatives.every(
          (relative) =>
            rows.get(relative) !== row ||
            [...rows].every(
              ([other, otherRow]) => other === relative || otherRow !== row || !between(x(other), x(relative), x(id)),
            ),
        );
      let row = preferred;
      for (let step = 1; !fits(row); step += 1) row = preferred + (step % 2 ? Math.ceil(step / 2) : -step / 2);
      rows.set(id, row);
    }

    const minRow = Math.min(...rows.values());
    const maxRow = Math.max(...rows.values());
    for (const id of members) pos.set(id, { x: x(id), y: bandTop + (rows.get(id)! - minRow) * LANE_ROW });
    bandTop += (maxRow - minRow + 1) * LANE_ROW + BAND_GAP;
  }

  const years = [];
  for (let year = first; year <= last; year += 1) years.push({ year, start: xOf(year), middle: xOf(year + 0.5) });
  return {
    pos,
    axis: { years, top: -AXIS_ROOM, bottom: bandTop - BAND_GAP, undatedX: hasUndated ? undatedX : undefined },
  };
}

/** Shelf-packs laid-out clusters: left to right, wrapping rows, largest first. */
function pack(groups: Array<{ ids: string[]; pos: Map<string, Vec> }>, boxes: Map<string, Box>): Map<string, Vec> {
  const extents = groups.map(({ ids, pos }) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const p = pos.get(id)!;
      const box = boxes.get(id)!;
      minX = Math.min(minX, p.x - box.halfWidth);
      maxX = Math.max(maxX, p.x + box.halfWidth);
      minY = Math.min(minY, p.y - box.top);
      maxY = Math.max(maxY, p.y + box.bottom);
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  });

  const area = extents.reduce((sum, e) => sum + (e.width + CLUSTER_SPACING) * (e.height + CLUSTER_SPACING), 0);
  const rowWidth = Math.max(...extents.map((e) => e.width), Math.sqrt(area * PACK_ASPECT));

  const out = new Map<string, Vec>();
  const offsets = new Map<number, number>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let row: number[] = [];
  const flush = () => {
    for (const index of row) {
      const extent = extents[index];
      const dy = (rowHeight - extent.height) / 2; // centre each cluster in its row
      for (const id of groups[index].ids) {
        const p = groups[index].pos.get(id)!;
        out.set(id, { x: offsets.get(index)! + (p.x - extent.minX), y: y + dy + (p.y - extent.minY) });
      }
    }
    y += rowHeight + CLUSTER_SPACING;
    x = 0;
    rowHeight = 0;
    row = [];
  };
  extents.forEach((extent, index) => {
    if (row.length && x + extent.width > rowWidth) flush();
    offsets.set(index, x);
    row.push(index);
    x += extent.width + CLUSTER_SPACING;
    rowHeight = Math.max(rowHeight, extent.height);
  });
  if (row.length) flush();
  return out;
}

export function buildLayout(mode: LayoutMode, nodes: MalwareNode[], edges: AtlasEdge[]): GraphLayout {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const presentEdges = edges.filter((edge) => nodeById.has(edge.from) && nodeById.has(edge.to));
  // lineage reads ancestry only; families without an ancestry claim sit that view out
  const layoutEdges = mode === "lineage" ? presentEdges.filter((edge) => ANCESTRY_TYPES.has(edge.type)) : presentEdges;
  const ids =
    mode === "lineage"
      ? [...new Set(layoutEdges.flatMap((edge) => [edge.from, edge.to]))].sort()
      : nodes.map((node) => node.id);

  const evidence = evidenceCounts(nodes, presentEdges);
  const degree = new Map(ids.map((id) => [id, 0]));
  for (const edge of presentEdges) {
    if (degree.has(edge.from)) degree.set(edge.from, degree.get(edge.from)! + 1);
    if (degree.has(edge.to)) degree.set(edge.to, degree.get(edge.to)! + 1);
  }
  const marks = new Map(ids.map((id) => [id, nodeMark(nodeById.get(id)!, evidence.get(id) ?? 1)]));
  const boxes = new Map<string, Box>(
    ids.map((id) => {
      const { radius, labelHalfWidth } = marks.get(id)!;
      return [
        id,
        { halfWidth: Math.max(radius, labelHalfWidth) + 4, top: radius + 4, bottom: radius + NAME_GAP + NAME_HEIGHT + 2 },
      ];
    }),
  );
  const names = new Map(ids.map((id) => [id, compactName(nodeById.get(id))]));

  const groups = clusters(ids, layoutEdges, names);
  let pos: Map<string, Vec>;
  let axis: TimeAxis | undefined;
  if (mode === "lineage") {
    ({ pos, axis } = timeline(groups, layoutEdges, nodeById, boxes));
  } else {
    const laidOut = groups.map((members) => {
      const memberSet = new Set(members);
      const cluster = forceCluster(members, layoutEdges.filter((edge) => memberSet.has(edge.from)));
      separate(members, cluster, boxes);
      return { ids: members, pos: cluster };
    });
    pos = pack(laidOut, boxes);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const positioned = new Map<string, PositionedNode>(
    ids.map((id) => {
      const p = pos.get(id)!;
      const box = boxes.get(id)!;
      minX = Math.min(minX, p.x - box.halfWidth);
      maxX = Math.max(maxX, p.x + box.halfWidth);
      minY = Math.min(minY, p.y - box.top);
      maxY = Math.max(maxY, p.y + box.bottom);
      return [
        id,
        {
          ...nodeById.get(id)!,
          x: p.x,
          y: p.y,
          degree: degree.get(id) ?? 0,
          evidence: evidence.get(id) ?? 1,
          ...marks.get(id)!,
        },
      ];
    }),
  );

  const positionedEdges = layoutEdges.map((edge) => ({
    ...edge,
    fromNode: positioned.get(edge.from)!,
    toNode: positioned.get(edge.to)!,
  }));

  if (axis) minY = Math.min(minY, axis.top);

  return {
    nodes: [...positioned.values()],
    edges: positionedEdges,
    bounds: ids.length ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 1000, maxY: 700 },
    axis,
  };
}
