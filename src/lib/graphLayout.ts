import type { AtlasEdge, MalwareNode } from "../data/types";

export type PositionedNode = MalwareNode & {
  x: number;
  y: number;
  degree: number;
  layer: "focus" | "near" | "far" | "outer";
};

export type PositionedEdge = AtlasEdge & {
  fromNode: PositionedNode;
  toNode: PositionedNode;
};

export type GraphBounds = { minX: number; minY: number; maxX: number; maxY: number };

export type GraphLayout = {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  focusId: string;
  bounds: GraphBounds;
};

export type LayoutMode = "web" | "lineage";

// directed ancestry edges point child -> parent (descendant -> ancestor)
const ANCESTRY_TYPES = new Set(["derived_from", "forked_from", "inspired_by", "variant_of"]);

/**
 * Force-directed layout — positions are derived from the edges, not pinned to
 * any specific node id. Adding, removing, or re-wiring families re-arranges the
 * graph automatically. The simulation is seeded deterministically from node ids,
 * so the result is stable across renders (no jitter) while still being dynamic.
 */

// stable pseudo-random in [0, 1) from a string — deterministic seeding
function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // map to [0, 1)
  return ((h >>> 0) % 100000) / 100000;
}

type Vec = { x: number; y: number };

/**
 * Separation relaxation — pushes apart any pair of nodes that would visually
 * overlap. Distances are measured in render pixels (accounting for the
 * asymmetric x*10 / y*7 scaling) so the guarantee matches what's actually drawn.
 * Deterministic: same input positions always yield the same result.
 */
function separate(nodes: { id: string }[], pos: Map<string, Vec>): void {
  const minGapPx = NODE_PX_RADIUS * 2 + 14; // diameter + breathing room
  const passes = 60;

  for (let pass = 0; pass < passes; pass += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        // delta in pixel space
        let dxPx = (a.x - b.x) * X_UNIT_PX;
        let dyPx = (a.y - b.y) * Y_UNIT_PX;
        let distPx = Math.hypot(dxPx, dyPx);
        if (distPx >= minGapPx) continue;
        if (distPx < 0.01) {
          // coincident — separate deterministically by id hash
          const ang = hashUnit(`${nodes[i].id}|${nodes[j].id}`) * Math.PI * 2;
          dxPx = Math.cos(ang);
          dyPx = Math.sin(ang);
          distPx = 1;
        }
        // push each node half the overlap apart, back in layout units
        const overlapPx = (minGapPx - distPx) / 2;
        const nxPx = dxPx / distPx;
        const nyPx = dyPx / distPx;
        a.x += (nxPx * overlapPx) / X_UNIT_PX;
        a.y += (nyPx * overlapPx) / Y_UNIT_PX;
        b.x -= (nxPx * overlapPx) / X_UNIT_PX;
        b.y -= (nyPx * overlapPx) / Y_UNIT_PX;
        moved = true;
      }
    }
    if (!moved) break; // converged — no overlaps left
  }
}

const AREA = 100; // logical layout space, ~0..100 on both axes

// The canvas renders layout units as x*10, y*7 inside a 1000x700 viewBox, with
// node circles ~34-38px. So one layout unit is wider on x than on y; overlap
// checks below correct for that. Node count drives how much room/iteration we need.
const NODE_PX_RADIUS = 36;
const X_UNIT_PX = 10;
const Y_UNIT_PX = 7;

export function buildGraphLayout(nodes: MalwareNode[], edges: AtlasEdge[]): GraphLayout {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  // the most-connected node is the conceptual hub (used only for layer banding)
  const focusId =
    [...degree.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? nodes[0]?.id;

  if (nodes.length === 0) {
    return { nodes: [], edges: [], focusId, bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } };
  }

  // only lay out edges whose endpoints are present
  const presentIds = new Set(nodes.map((node) => node.id));
  const activeEdges = edges.filter((edge) => presentIds.has(edge.from) && presentIds.has(edge.to));

  // --- seed positions deterministically on a circle, jittered by id hash ---
  const pos = new Map<string, Vec>();
  const disp = new Map<string, Vec>();
  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 + hashUnit(node.id) * 0.6;
    const radius = 18 + hashUnit(`${node.id}:r`) * 14;
    pos.set(node.id, {
      x: AREA / 2 + Math.cos(angle) * radius,
      y: AREA / 2 + Math.sin(angle) * radius,
    });
    disp.set(node.id, { x: 0, y: 0 });
  });

  // Fruchterman–Reingold style forces. Ideal edge length grows a little with
  // node count so larger graphs spread out instead of cramming into the box.
  const k = (AREA / Math.sqrt(nodes.length)) * 1.1;
  let temperature = AREA / 6; // max displacement per step, cooled over time
  // more nodes need more passes to untangle; clamp to a sane range
  const iterations = Math.min(700, Math.max(320, nodes.length * 12));
  // cool so temperature reaches ~the 0.6 floor by the final iteration
  const coolRate = Math.pow(0.6 / temperature, 1 / iterations);

  for (let iter = 0; iter < iterations; iter += 1) {
    for (const node of nodes) disp.set(node.id, { x: 0, y: 0 });

    // repulsion between every pair of nodes
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          // identical points — nudge apart deterministically
          dx = hashUnit(`${nodes[i].id}${nodes[j].id}`) - 0.5;
          dy = hashUnit(`${nodes[j].id}${nodes[i].id}`) - 0.5;
          dist = Math.hypot(dx, dy) || 0.01;
        }
        const force = (k * k) / dist;
        const ux = (dx / dist) * force;
        const uy = (dy / dist) * force;
        const da = disp.get(nodes[i].id)!;
        const db = disp.get(nodes[j].id)!;
        da.x += ux;
        da.y += uy;
        db.x -= ux;
        db.y -= uy;
      }
    }

    // attraction along edges (springs)
    for (const edge of activeEdges) {
      const a = pos.get(edge.from)!;
      const b = pos.get(edge.to)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist * dist) / k;
      const ux = (dx / dist) * force;
      const uy = (dy / dist) * force;
      const da = disp.get(edge.from)!;
      const db = disp.get(edge.to)!;
      da.x -= ux;
      da.y -= uy;
      db.x += ux;
      db.y += uy;
    }

    // gentle pull toward center so disconnected nodes don't drift away
    for (const node of nodes) {
      const p = pos.get(node.id)!;
      const d = disp.get(node.id)!;
      d.x += (AREA / 2 - p.x) * 0.012;
      d.y += (AREA / 2 - p.y) * 0.012;
    }

    // apply displacement, capped by temperature
    for (const node of nodes) {
      const p = pos.get(node.id)!;
      const d = disp.get(node.id)!;
      const len = Math.hypot(d.x, d.y) || 0.01;
      p.x += (d.x / len) * Math.min(len, temperature);
      p.y += (d.y / len) * Math.min(len, temperature);
    }

    temperature = Math.max(0.6, temperature * coolRate); // cool
  }

  // --- normalize the force result into a working box, then guarantee no overlap.
  // The box grows with node count: 13 nodes fit ~80 units, but 49 nodes need more
  // room, so we scale the canvas instead of squashing everything together (the
  // viewport pans/zooms to fit). Separation then runs in these final coordinates.
  const rawXs = nodes.map((node) => pos.get(node.id)!.x);
  const rawYs = nodes.map((node) => pos.get(node.id)!.y);
  const rawMinX = Math.min(...rawXs);
  const rawMaxX = Math.max(...rawXs);
  const rawMinY = Math.min(...rawYs);
  const rawMaxY = Math.max(...rawYs);
  const rawSpanX = rawMaxX - rawMinX || 1;
  const rawSpanY = rawMaxY - rawMinY || 1;

  // target extent scales with sqrt(node count): ~80 units for ~13, larger beyond
  const extent = Math.max(80, 22 * Math.sqrt(nodes.length));
  const PAD = 8;
  for (const node of nodes) {
    const p = pos.get(node.id)!;
    p.x = PAD + ((p.x - rawMinX) / rawSpanX) * extent;
    p.y = PAD + ((p.y - rawMinY) / rawSpanY) * extent;
  }

  // now enforce non-overlap in the final coordinate space
  separate(nodes, pos);

  // recompute bounds (separation may have nudged the extremes outward)
  const xs = nodes.map((node) => pos.get(node.id)!.x);
  const ys = nodes.map((node) => pos.get(node.id)!.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  // --- layer banding from graph distance (BFS) to the hub, for visual depth ---
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node.id, new Set());
  for (const edge of activeEdges) {
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }
  const distance = new Map<string, number>();
  const queue: string[] = [focusId];
  distance.set(focusId, 0);
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!distance.has(next)) {
        distance.set(next, distance.get(current)! + 1);
        queue.push(next);
      }
    }
  }

  const layerFor = (id: string): PositionedNode["layer"] => {
    const d = distance.get(id);
    if (d === 0) return "focus";
    if (d === 1) return "near";
    if (d === 2) return "far";
    return "outer";
  };

  // positions already live in the final, separated coordinate space; emit as-is
  const positioned = new Map<string, PositionedNode>(
    nodes.map((node) => {
      const p = pos.get(node.id)!;
      return [
        node.id,
        {
          ...node,
          x: p.x,
          y: p.y,
          degree: degree.get(node.id) ?? 0,
          layer: layerFor(node.id),
        },
      ];
    }),
  );

  const layoutEdges = activeEdges
    .map((edge) => {
      const fromNode = positioned.get(edge.from);
      const toNode = positioned.get(edge.to);
      if (!fromNode || !toNode) return undefined;
      return { ...edge, fromNode, toNode };
    })
    .filter((edge): edge is PositionedEdge => Boolean(edge));

  return {
    nodes: [...positioned.values()],
    edges: layoutEdges,
    focusId,
    bounds: { minX, minY, maxX, maxY },
  };
}

/**
 * Lineage layout — a genealogical reading. Ancestry edges (forked_from /
 * inspired_by / variant_of) point descendant -> ancestor, so we place ancestors
 * on the left and descendants on the right by *generation* (longest ancestry
 * depth). This is robust when first_seen dates are missing; where dates exist
 * they break ties for vertical ordering. Undirected edges (shares_*) are still
 * drawn but don't define generation.
 */
export function buildLineageLayout(nodes: MalwareNode[], edges: AtlasEdge[]): GraphLayout {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const focusId =
    [...degree.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? nodes[0]?.id;

  if (nodes.length === 0) {
    return { nodes: [], edges: [], focusId, bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } };
  }

  const presentIds = new Set(nodes.map((node) => node.id));
  const activeEdges = edges.filter((edge) => presentIds.has(edge.from) && presentIds.has(edge.to));
  const ancestryEdges = activeEdges.filter((edge) => ANCESTRY_TYPES.has(edge.type));

  // parents[child] = set of ancestors it descends from
  const parents = new Map<string, Set<string>>();
  for (const node of nodes) parents.set(node.id, new Set());
  for (const edge of ancestryEdges) parents.get(edge.from)!.add(edge.to);

  // generation = longest ancestry chain to a root; memoized with cycle guard
  const generation = new Map<string, number>();
  const resolveGeneration = (id: string, stack: Set<string>): number => {
    if (generation.has(id)) return generation.get(id)!;
    if (stack.has(id)) return 0; // cycle — treat as root
    stack.add(id);
    let best = 0;
    for (const parent of parents.get(id) ?? []) {
      best = Math.max(best, resolveGeneration(parent, stack) + 1);
    }
    stack.delete(id);
    generation.set(id, best);
    return best;
  };
  for (const node of nodes) resolveGeneration(node.id, new Set());

  // group nodes by generation column
  const columns = new Map<number, MalwareNode[]>();
  for (const node of nodes) {
    const g = generation.get(node.id)!;
    if (!columns.has(g)) columns.set(g, []);
    columns.get(g)!.push(node);
  }
  const maxGen = Math.max(...generation.values(), 0);

  const dateKey = (node: MalwareNode) => node.first_seen?.value ?? "9999"; // undated sinks to the bottom

  // The canvas grows with the data: columns are spaced by a fixed per-generation
  // gap, and each column's height is driven by how many nodes it holds. The tallest
  // column sets the vertical extent. This keeps cells readable instead of squashing
  // many nodes into a fixed 0..100 box. The viewport pans/zooms to fit.
  const COL_GAP = 30; // horizontal units between generations
  const ROW_GAP = 14; // vertical units between nodes in a column
  const PAD_X = 12;
  const PAD_TOP = 20;
  const tallest = Math.max(...[...columns.values()].map((m) => m.length), 1);
  const colHeight = (tallest - 1) * ROW_GAP;

  const pos = new Map<string, Vec>();
  const layerById = new Map<string, PositionedNode["layer"]>();
  for (const [gen, members] of columns) {
    members.sort((a, b) => dateKey(a).localeCompare(dateKey(b)) || a.name.localeCompare(b.name));
    const x = PAD_X + gen * COL_GAP;
    const count = members.length;
    const thisHeight = (count - 1) * ROW_GAP;
    // center each column vertically within the tallest column's band
    const top = PAD_TOP + (colHeight - thisHeight) / 2;
    members.forEach((node, index) => {
      const stagger = gen % 2 === 1 && count > 1 ? ROW_GAP / 2 : 0;
      pos.set(node.id, { x, y: top + index * ROW_GAP + stagger });
      const g = generation.get(node.id)!;
      layerById.set(node.id, g === 0 ? "focus" : g === 1 ? "near" : g === 2 ? "far" : "outer");
    });
  }

  // guarantee non-overlap (handles the stagger pushing a node into a neighbour)
  separate(nodes, pos);

  const xs = nodes.map((node) => pos.get(node.id)!.x);
  const ys = nodes.map((node) => pos.get(node.id)!.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const positioned = new Map<string, PositionedNode>(
    nodes.map((node) => {
      const p = pos.get(node.id)!;
      return [
        node.id,
        {
          ...node,
          x: p.x,
          y: p.y,
          degree: degree.get(node.id) ?? 0,
          layer: layerById.get(node.id) ?? "outer",
        },
      ];
    }),
  );

  const layoutEdges = activeEdges
    .map((edge) => {
      const fromNode = positioned.get(edge.from);
      const toNode = positioned.get(edge.to);
      if (!fromNode || !toNode) return undefined;
      return { ...edge, fromNode, toNode };
    })
    .filter((edge): edge is PositionedEdge => Boolean(edge));

  return {
    nodes: [...positioned.values()],
    edges: layoutEdges,
    focusId,
    bounds: { minX, minY, maxX, maxY },
  };
}

export function buildLayout(mode: LayoutMode, nodes: MalwareNode[], edges: AtlasEdge[]): GraphLayout {
  return mode === "lineage" ? buildLineageLayout(nodes, edges) : buildGraphLayout(nodes, edges);
}
