import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock3,
  Crosshair,
  ExternalLink,
  GitBranch,
  Info,
  LayoutGrid,
  Minus,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  ShieldCheck,
  Spline,
  Tags,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { atlas } from "./data/atlas";
import type { AtlasEdge, AtlasSource, MalwareNode } from "./data/types";
import {
  buildLayout,
  type GraphBounds,
  type LayoutMode,
  type PositionedEdge,
  type PositionedNode,
} from "./lib/graphLayout";
import { NAME_GAP, NAME_HEIGHT, compactName, dotRadius, relationLabelWidth } from "./lib/nodeLabel";

type ViewMode = "graph" | "timeline" | "sources" | "curation" | "about";
type DockMode = "timeline" | "matrix" | "coverage" | "lens";
type Selection = { type: "edge"; id: string } | { type: "node"; id: string };

const views: Array<{ id: ViewMode; label: string; icon: typeof Network }> = [
  { id: "graph", label: "Graph", icon: Network },
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "sources", label: "Sources", icon: BookOpen },
  { id: "curation", label: "Curation", icon: ShieldCheck },
  { id: "about", label: "About", icon: Info },
];

const dockModes: Array<{ id: DockMode; label: string; icon: typeof Network }> = [
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "matrix", label: "Matrix", icon: LayoutGrid },
  { id: "coverage", label: "Coverage", icon: BarChart3 },
  { id: "lens", label: "Lens", icon: Crosshair },
];

const confidenceScore = {
  low: 1,
  medium: 3,
  high: 5,
};

const confidenceTone = {
  low: "tone-low",
  medium: "tone-medium",
  high: "tone-high",
};

const statusTone = {
  accepted: "status-accepted",
  tentative: "status-tentative",
  disputed: "status-disputed",
  deprecated: "status-deprecated",
};

const relationLabels: Record<string, string> = {
  derived_from: "derived from",
  distributed_with: "distributed with",
  forked_from: "forked from",
  inspired_by: "inspired by",
  loaded_by: "loaded by",
  reported_as_related_to: "reported related",
  shares_behavior_with: "shares behavior",
  shares_code_with: "shares code",
  shares_creator_with: "shares creator",
  shares_operator_with: "shares operator",
  uses_loader: "uses loader",
  targets_same_ecosystem_as: "targets same ecosystem",
  variant_of: "variant of",
};

const relationAbbrev: Record<string, string> = {
  derived_from: "DRV",
  distributed_with: "DIST",
  forked_from: "FRK",
  inspired_by: "INS",
  loaded_by: "LOAD",
  reported_as_related_to: "REL",
  shares_behavior_with: "BEH",
  shares_code_with: "CODE",
  shares_creator_with: "OPER",
  shares_operator_with: "OPR",
  targets_same_ecosystem_as: "TGT",
  uses_loader: "LDR",
  variant_of: "VAR",
};

const edgeLabel = (edge: AtlasEdge) => relationLabels[edge.type] ?? edge.type.replaceAll("_", " ");

const readableToken = (value?: string) => value?.replaceAll("_", " ") ?? "unknown";

const sourceHost = (source?: AtlasSource) => {
  if (!source?.url) return "";

  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
};

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("graph");
  const [dockMode, setDockMode] = useState<DockMode>("lens");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [relationshipFilter, setRelationshipFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("web");
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const isCompact = useCompactViewport();
  // graph-first on small screens: panels start collapsed so the canvas is visible
  const [inspectorOpen, setInspectorOpen] = useState(!isCompact);
  const [dockOpen, setDockOpen] = useState(!isCompact);
  const [selection, setSelection] = useState<Selection>({ type: "edge", id: "edge_stealc_vidar_001" });

  const visibleEdges = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return atlas.edges.filter((edge) => {
      const from = atlas.nodeById.get(edge.from);
      const to = atlas.nodeById.get(edge.to);
      const haystack = [
        edge.type,
        edge.relation_scope,
        edge.status,
        edge.confidence,
        from?.name,
        from?.aliases?.join(" "),
        from?.identity_basis,
        from?.summary,
        from?.tags?.join(" "),
        to?.name,
        to?.aliases?.join(" "),
        to?.identity_basis,
        to?.summary,
        to?.tags?.join(" "),
        edge.sources.map((source) => source.claim).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const categoryOk =
        categoryFilter === "all" ||
        from?.category === categoryFilter ||
        to?.category === categoryFilter;

      return (
        categoryOk &&
        (statusFilter === "all" || edge.status === statusFilter) &&
        (relationshipFilter === "all" || edge.type === relationshipFilter) &&
        (!normalizedQuery || haystack.includes(normalizedQuery))
      );
    });
  }, [categoryFilter, query, relationshipFilter, statusFilter]);

  const visibleNodes = useMemo(() => {
    const visibleNodeIds = new Set(visibleEdges.flatMap((edge) => [edge.from, edge.to]));
    return atlas.nodes.filter((node) => visibleNodeIds.has(node.id));
  }, [visibleEdges]);
  // Positions are computed once per layout mode over the whole atlas, so filters
  // and search never move a family: what doesn't match fades in place.
  const layout = useMemo(() => buildLayout(layoutMode, atlas.nodes, atlas.edges), [layoutMode]);
  const filtering =
    categoryFilter !== "all" || statusFilter !== "all" || relationshipFilter !== "all" || query.trim() !== "";
  const matchEdgeIds = useMemo(() => new Set(visibleEdges.map((edge) => edge.id)), [visibleEdges]);
  const matchNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const maxEvidence = useMemo(() => Math.max(1, ...layout.nodes.map((node) => node.evidence)), [layout]);

  const selectedEdge =
    selection.type === "edge"
      ? atlas.edges.find((edge) => edge.id === selection.id) ?? visibleEdges[0] ?? atlas.edges[0]
      : visibleEdges[0] ?? atlas.edges[0];

  const selectedNode = selection.type === "node" ? atlas.nodeById.get(selection.id) : undefined;

  const activatedEdgeIds = new Set<string>();
  const activatedNodeIds = new Set<string>();

  if (selection.type === "edge") {
    const edge = atlas.edges.find((candidate) => candidate.id === selection.id);

    if (edge) {
      activatedEdgeIds.add(edge.id);
      activatedNodeIds.add(edge.from);
      activatedNodeIds.add(edge.to);
    }
  } else {
    activatedNodeIds.add(selection.id);

    for (const edge of layout.edges) {
      if (edge.from === selection.id || edge.to === selection.id) {
        activatedEdgeIds.add(edge.id);
        activatedNodeIds.add(edge.from);
        activatedNodeIds.add(edge.to);
      }
    }
  }

  const relationshipTypes = [...new Set(atlas.edges.map((edge) => edge.type))].sort();
  const categories = [...new Set(atlas.nodes.flatMap((node) => (node.category ? [node.category] : [])))].sort();

  return (
    <main className="app-shell">
      <Rail activeView={viewMode} onChange={setViewMode} />

      <section className="workspace">
        <TopBar query={query} onQueryChange={setQuery} />

        {/* Graph-first: the canvas fills the workspace; the inspector and the
            analytical dock float on top as collapsible glass overlays. */}
        <div className="work-surface">
          <section className="canvas-region" aria-label="Atlas graph workspace">
            <GraphControls
              categories={categories}
              categoryFilter={categoryFilter}
              layoutMode={layoutMode}
              maxEvidence={maxEvidence}
              relationshipFilter={relationshipFilter}
              relationshipTypes={relationshipTypes}
              showEdgeLabels={showEdgeLabels}
              statusFilter={statusFilter}
              onCategoryChange={setCategoryFilter}
              onLayoutModeChange={setLayoutMode}
              onRelationshipChange={setRelationshipFilter}
              onStatusChange={setStatusFilter}
              onToggleLabels={() => setShowEdgeLabels((value) => !value)}
            />
            <GraphCanvas
              activatedEdgeIds={activatedEdgeIds}
              activatedNodeIds={activatedNodeIds}
              bounds={layout.bounds}
              edges={layout.edges}
              filtering={filtering}
              matchEdgeIds={matchEdgeIds}
              matchNodeIds={matchNodeIds}
              nodes={layout.nodes}
              selectedEdgeId={selection.type === "edge" ? selection.id : undefined}
              selectedNodeId={selection.type === "node" ? selection.id : undefined}
              showEdgeLabels={showEdgeLabels}
              onSelectEdge={(id) => setSelection({ type: "edge", id })}
              onSelectNode={(id) => setSelection({ type: "node", id })}
            />

            <OverlayPanel
              className="dock-overlay"
              edge="bottom"
              label="Analysis"
              open={dockOpen}
              onToggle={() => setDockOpen((value) => !value)}
            >
              <AnalyticalDock
                dockMode={dockMode}
                edge={selectedEdge}
                node={selectedNode}
                relationshipTypes={relationshipTypes}
                selection={selection}
                visibleEdges={visibleEdges}
                visibleNodes={visibleNodes}
                onDockModeChange={setDockMode}
              />
            </OverlayPanel>

            <OverlayPanel
              className="inspector-overlay"
              edge="right"
              label="Details"
              open={inspectorOpen}
              onToggle={() => setInspectorOpen((value) => !value)}
            >
              <Inspector edge={selectedEdge} mode={viewMode} node={selectedNode} selection={selection} />
            </OverlayPanel>
          </section>
        </div>
      </section>
    </main>
  );
}

/** A collapsible glass panel that floats over the graph from one edge. */
function OverlayPanel({
  children,
  className,
  edge,
  label,
  open,
  onToggle,
}: {
  children: ReactNode;
  className: string;
  edge: "right" | "bottom";
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`overlay-panel ${className} ${edge} ${open ? "open" : "collapsed"}`}>
      <button
        aria-expanded={open}
        className="overlay-handle"
        onClick={onToggle}
        title={open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        type="button"
      >
        {edge === "right" ? (
          open ? <PanelRightClose size={16} strokeWidth={1.8} /> : <PanelRightOpen size={16} strokeWidth={1.8} />
        ) : open ? (
          <ChevronDown size={16} strokeWidth={1.8} />
        ) : (
          <ChevronUp size={16} strokeWidth={1.8} />
        )}
        <span>{label}</span>
      </button>
      <div className="overlay-body">{children}</div>
    </div>
  );
}

function useCompactViewport() {
  // initialize synchronously so the first render already knows the viewport
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 680px)");
    const update = () => setIsCompact(media.matches);

    update();
    media.addEventListener("change", update);

    return () => media.removeEventListener("change", update);
  }, []);

  return isCompact;
}

function Rail({
  activeView,
  onChange,
}: {
  activeView: ViewMode;
  onChange: (view: ViewMode) => void;
}) {
  return (
    <nav className="rail" aria-label="Primary">
      <div className="mark" aria-label="Malzu mark">
        <span />
      </div>

      <div className="rail-actions">
        {views.map(({ id, label, icon: Icon }) => (
          <button
            className={activeView === id ? "rail-button active" : "rail-button"}
            key={id}
            onClick={() => onChange(id)}
            title={label}
            type="button"
          >
            <Icon aria-hidden="true" size={20} strokeWidth={1.7} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function TopBar({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <header className="topbar">
      <div className="identity">
        <h1>Malzu</h1>
        <span className="public-dot">public</span>
      </div>

      <dl className="metrics" aria-label="Atlas totals">
        <div>
          <dt>{atlas.sources.length}</dt>
          <dd>sources</dd>
        </div>
        <div>
          <dt>{atlas.nodes.length}</dt>
          <dd>nodes</dd>
        </div>
        <div>
          <dt>{atlas.edges.length}</dt>
          <dd>edges</dd>
        </div>
      </dl>

      <label className="search" aria-label="Search atlas records">
        <Search size={16} strokeWidth={1.8} />
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search"
          value={query}
        />
      </label>
    </header>
  );
}

function GraphControls({
  categories,
  categoryFilter,
  layoutMode,
  maxEvidence,
  relationshipFilter,
  relationshipTypes,
  showEdgeLabels,
  statusFilter,
  onCategoryChange,
  onLayoutModeChange,
  onRelationshipChange,
  onStatusChange,
  onToggleLabels,
}: {
  categories: string[];
  categoryFilter: string;
  layoutMode: LayoutMode;
  maxEvidence: number;
  relationshipFilter: string;
  relationshipTypes: string[];
  showEdgeLabels: boolean;
  statusFilter: string;
  onCategoryChange: (value: string) => void;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onRelationshipChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onToggleLabels: () => void;
}) {
  return (
    <div className="graph-controls" aria-label="Graph controls">
      <div className="graph-toolset">
        <div className="layout-toggle" role="group" aria-label="Graph layout">
          <button
            aria-pressed={layoutMode === "web"}
            className={layoutMode === "web" ? "tool-button active" : "tool-button"}
            onClick={() => onLayoutModeChange("web")}
            title="Web view — organic, force-directed"
            type="button"
          >
            <Spline size={17} strokeWidth={1.7} />
          </button>
          <button
            aria-pressed={layoutMode === "lineage"}
            className={layoutMode === "lineage" ? "tool-button active" : "tool-button"}
            onClick={() => onLayoutModeChange("lineage")}
            title="Lineage view — ancestry trees, ancestors on the left"
            type="button"
          >
            <GitBranch size={17} strokeWidth={1.7} />
          </button>
        </div>
        <span className="toolset-divider" aria-hidden="true" />
        <button
          aria-pressed={showEdgeLabels}
          className={showEdgeLabels ? "tool-button active" : "tool-button"}
          onClick={onToggleLabels}
          title="Toggle relationship labels"
          type="button"
        >
          <Tags size={17} strokeWidth={1.7} />
        </button>
      </div>

      <div className="graph-filterset">
        <label htmlFor="category-filter">
          <span>type</span>
          <select
            id="category-filter"
            onChange={(event) => onCategoryChange(event.target.value)}
            value={categoryFilter}
          >
            <option value="all">all malware</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="relationship-filter">
          <span>relationship</span>
          <select
            id="relationship-filter"
            onChange={(event) => onRelationshipChange(event.target.value)}
            value={relationshipFilter}
          >
            <option value="all">all types</option>
            {relationshipTypes.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="status-filter">
          <span>status</span>
          <select id="status-filter" onChange={(event) => onStatusChange(event.target.value)} value={statusFilter}>
            <option value="all">all statuses</option>
            <option value="accepted">accepted</option>
            <option value="tentative">tentative</option>
            <option value="disputed">disputed</option>
            <option value="deprecated">deprecated</option>
          </select>
        </label>
      </div>

      <GraphLegend maxEvidence={maxEvidence} />
    </div>
  );
}

type View = { x: number; y: number; w: number; h: number };

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
// 100% zoom = one layout px per screen px, on every screen size
// below this zoom only the selection, its neighbours, and filter matches keep
// names — and those hold a readable on-screen size instead of shrinking
const NAME_ZOOM_FLOOR = 0.7;
const READABLE_ZOOM = 0.85;

/** How a relation type is drawn: four families of line style, no hue. */
type EdgeFamily = "lineage" | "shared" | "delivery" | "reported";

const edgeFamilies: Record<string, EdgeFamily> = {
  derived_from: "lineage",
  forked_from: "lineage",
  inspired_by: "lineage",
  variant_of: "lineage",
  shares_behavior_with: "shared",
  shares_code_with: "shared",
  shares_creator_with: "shared",
  shares_operator_with: "shared",
  distributed_with: "delivery",
  loaded_by: "delivery",
  uses_loader: "delivery",
  reported_as_related_to: "reported",
  targets_same_ecosystem_as: "reported",
};

const edgeFamily = (type: string): EdgeFamily => edgeFamilies[type] ?? "reported";

const legendRows: Array<{ family: EdgeFamily; label: string; arrow: boolean }> = [
  { family: "lineage", label: "lineage", arrow: true },
  { family: "shared", label: "shared", arrow: false },
  { family: "delivery", label: "delivery", arrow: true },
  { family: "reported", label: "reported", arrow: false },
];

type Point = { x: number; y: number };

/** The selected node, or the midpoint of the selected edge. */
function selectionAnchor(
  nodes: PositionedNode[],
  edges: PositionedEdge[],
  selectedNodeId?: string,
  selectedEdgeId?: string,
): Point | undefined {
  const node = selectedNodeId ? nodes.find((candidate) => candidate.id === selectedNodeId) : undefined;
  if (node) return { x: node.x, y: node.y };

  const edge = selectedEdgeId ? edges.find((candidate) => candidate.id === selectedEdgeId) : undefined;
  if (edge) return { x: (edge.fromNode.x + edge.toNode.x) / 2, y: (edge.fromNode.y + edge.toNode.y) / 2 };

  return undefined;
}

/** Bounding box of some nodes, names included. */
function nodesBox(nodes: PositionedNode[]): GraphBounds | undefined {
  if (!nodes.length) return undefined;
  return {
    minX: Math.min(...nodes.map((node) => node.x - Math.max(node.radius, node.labelHalfWidth))),
    maxX: Math.max(...nodes.map((node) => node.x + Math.max(node.radius, node.labelHalfWidth))),
    minY: Math.min(...nodes.map((node) => node.y - node.radius)),
    maxY: Math.max(...nodes.map((node) => node.y + node.radius + NAME_GAP + NAME_HEIGHT)),
  };
}

/**
 * The part of the canvas the floating controls and open panels leave visible,
 * in client pixels. A panel in the right half docks right; one in the lower
 * half docks bottom (this also covers the phone bottom sheets).
 */
function uncoveredRect(svg: SVGSVGElement, rect: DOMRect) {
  const region = svg.closest(".canvas-region");
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;
  let { left, right, top, bottom } = rect;

  const controls = region?.querySelector(".graph-controls")?.getBoundingClientRect();
  if (controls) top = Math.max(top, controls.bottom);

  region?.querySelectorAll(".overlay-panel.open").forEach((panel) => {
    const panelRect = panel.getBoundingClientRect();
    if (panelRect.left > midX) right = Math.min(right, panelRect.left);
    else if (panelRect.top > midY) bottom = Math.min(bottom, panelRect.top);
  });

  // if the overlays leave almost nothing, frame against the whole canvas instead
  if (right - left < rect.width * 0.3 || bottom - top < rect.height * 0.3) return rect;
  return { left, right, top, bottom };
}

/** An edge's visible run: rim to rim, leaving room for the arrowhead. */
type Segment = { x1: number; y1: number; x2: number; y2: number; visible: boolean; head?: string };

const RIM_GAP = 3; // air between a dot's rim and the line (or arrow tip)
const HEAD_LENGTH = 8;
const HEAD_HALF_WIDTH = 3.4;

function edgeSegment(edge: PositionedEdge): Segment {
  const { x: x1, y: y1 } = edge.fromNode;
  const { x: x2, y: y2 } = edge.toNode;
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  const directed = edge.direction === "directed";
  const start = edge.fromNode.radius + RIM_GAP;
  const tip = edge.toNode.radius + RIM_GAP;
  const end = tip + (directed ? HEAD_LENGTH : 0);

  // only directed claims (descendant -> ancestor, loaded -> loader) get a head;
  // drawn as geometry so it takes the line's colour and stays one size
  let head: string | undefined;
  if (directed) {
    const tipX = x2 - ux * tip;
    const tipY = y2 - uy * tip;
    const baseX = tipX - ux * HEAD_LENGTH;
    const baseY = tipY - uy * HEAD_LENGTH;
    head = [
      [tipX, tipY],
      [baseX - uy * HEAD_HALF_WIDTH, baseY + ux * HEAD_HALF_WIDTH],
      [baseX + uy * HEAD_HALF_WIDTH, baseY - ux * HEAD_HALF_WIDTH],
    ]
      .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
      .join(" ");
  }

  return {
    x1: x1 + ux * start,
    y1: y1 + uy * start,
    x2: x2 - ux * end,
    y2: y2 - uy * end,
    visible: length > start + end,
    head,
  };
}

type Box = { left: number; right: number; top: number; bottom: number };

// candidate label centres: along the run (t), then either side of the line
// at growing distances (d, px along the line's normal)
const LABEL_SPOTS = [0.5, 0.35, 0.65, 0.2, 0.8].flatMap((t) =>
  [-9, 9, -18, 18, -28, 28].map((d) => ({ t, d })),
);
const RELATION_HALF_HEIGHT = 7; // 11px text

const boxesOverlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Gap between a label box and a dot's rim (negative = the box cuts into it). */
function rimClearance(box: Box, node: PositionedNode) {
  const dx = Math.max(box.left - node.x, 0, node.x - box.right);
  const dy = Math.max(box.top - node.y, 0, node.y - box.bottom);
  return Math.hypot(dx, dy) - node.radius;
}

const nameBox = (node: PositionedNode): Box => ({
  left: node.x - node.labelHalfWidth,
  right: node.x + node.labelHalfWidth,
  top: node.y + node.radius + NAME_GAP - 1,
  bottom: node.y + node.radius + NAME_GAP + NAME_HEIGHT,
});

/**
 * Relation label positions, placed greedily in edge order (stable across
 * selections). Each takes the spot near its line that avoids, in order of
 * cost: labels already placed, family names, then dots. The label layer
 * renders above the nodes, so a crowded label can overlap but is never hidden.
 */
function placeEdgeLabels(
  edges: PositionedEdge[],
  segments: Map<string, Segment>,
  nodes: PositionedNode[],
): Map<string, Point> {
  const names = nodes.map(nameBox);
  const placed: Box[] = [];
  const points = new Map<string, Point>();

  for (const edge of edges) {
    const segment = segments.get(edge.id)!;
    const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) || 1;
    const nx = -(segment.y2 - segment.y1) / length;
    const ny = (segment.x2 - segment.x1) / length;
    const halfWidth = relationLabelWidth(edgeLabel(edge)) / 2 + 3;
    let best: { point: Point; box: Box; score: number } | undefined;

    for (const { t, d } of LABEL_SPOTS) {
      const cx = segment.x1 + (segment.x2 - segment.x1) * t + nx * d;
      const cy = segment.y1 + (segment.y2 - segment.y1) * t + ny * d;
      const box = {
        left: cx - halfWidth,
        right: cx + halfWidth,
        top: cy - RELATION_HALF_HEIGHT,
        bottom: cy + RELATION_HALF_HEIGHT,
      };
      const clearance = Math.min(...nodes.map((node) => rimClearance(box, node)));
      const score =
        (placed.some((other) => boxesOverlap(other, box)) ? -1000 : 0) -
        names.filter((name) => boxesOverlap(name, box)).length * 400 +
        Math.min(clearance, 6) * 5 -
        Math.abs(t - 0.5) * 20 -
        Math.abs(d) * 0.4;
      // text-anchor middle; the alphabetic baseline sits ~4px below the centre
      if (!best || score > best.score) best = { point: { x: cx, y: cy + 4 }, box, score };
    }

    placed.push(best!.box);
    points.set(edge.id, best!.point);
  }

  return points;
}

function GraphCanvas({
  nodes,
  edges,
  activatedEdgeIds,
  activatedNodeIds,
  bounds,
  filtering,
  matchEdgeIds,
  matchNodeIds,
  selectedEdgeId,
  selectedNodeId,
  showEdgeLabels,
  onSelectEdge,
  onSelectNode,
}: {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  activatedEdgeIds: Set<string>;
  activatedNodeIds: Set<string>;
  bounds: GraphBounds;
  filtering: boolean;
  matchEdgeIds: Set<string>;
  matchNodeIds: Set<string>;
  selectedEdgeId?: string;
  selectedNodeId?: string;
  showEdgeLabels: boolean;
  onSelectEdge: (edgeId: string) => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // the canvas's size in client px; `measured` flips once the element has laid out
  const [size, setSize] = useState({ w: 1000, h: 700, measured: false });
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setSize((current) =>
        current.measured && Math.abs(current.w - rect.width) < 1 && Math.abs(current.h - rect.height) < 1
          ? current
          : { w: rect.width, h: rect.height, measured: true },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const home = useMemo<View>(
    () => ({
      x: (bounds.minX + bounds.maxX) / 2 - size.w / 2,
      y: (bounds.minY + bounds.maxY) / 2 - size.h / 2,
      w: size.w,
      h: size.h,
    }),
    [bounds, size],
  );
  const segments = useMemo(() => new Map(edges.map((edge) => [edge.id, edgeSegment(edge)])), [edges]);
  const labelPoints = useMemo(() => placeEdgeLabels(edges, segments, nodes), [edges, nodes, segments]);
  // positions never move with filters; the camera goes to the matches instead
  const matchBox = useMemo(
    () => (filtering ? nodesBox(nodes.filter((node) => matchNodeIds.has(node.id))) : undefined),
    [filtering, matchNodeIds, nodes],
  );
  // selected and activated labels paint last, so they win any overlap
  const labelOrder = [...edges].sort(
    (a, b) =>
      Number(a.id === selectedEdgeId || activatedEdgeIds.has(a.id)) -
      Number(b.id === selectedEdgeId || activatedEdgeIds.has(b.id)),
  );
  const [view, setView] = useState<View>(home);
  const [isPanning, setIsPanning] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; origin: View; moved: boolean } | null>(null);

  /**
   * A view that shows `target` (fitted, never past 100%) or, without one, the
   * selection at 100% — centred in the canvas area the panels leave uncovered.
   */
  const frame = (target?: GraphBounds): View => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!svg || !rect || rect.width === 0) return home;

    const free = uncoveredRect(svg, rect);
    // the viewBox is fitted with "meet": at 100% one unit is `atHome` px (≈1)
    const atHome = Math.min(rect.width / home.w, rect.height / home.h);
    let scale = atHome;
    let centre: Point;
    if (target) {
      const pad = 48;
      scale = Math.min(
        atHome,
        (free.right - free.left - pad * 2) / Math.max(target.maxX - target.minX, 1),
        (free.bottom - free.top - pad * 2) / Math.max(target.maxY - target.minY, 1),
      );
      scale = Math.max(scale, atHome * MIN_ZOOM);
      centre = { x: (target.minX + target.maxX) / 2, y: (target.minY + target.maxY) / 2 };
    } else {
      centre = selectionAnchor(nodes, edges, selectedNodeId, selectedEdgeId) ?? {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      };
    }
    const w = home.w * (atHome / scale);
    const h = home.h * (atHome / scale);
    const dx = ((free.left + free.right) / 2 - (rect.left + rect.width / 2)) / scale;
    const dy = ((free.top + free.bottom) / 2 - (rect.top + rect.height / 2)) / scale;
    return { x: centre.x - dx - w / 2, y: centre.y - dy - h / 2, w, h };
  };

  // Frame once the canvas is measured, and again when the layout changes (data
  // or layout mode). Selection is deliberately not a dependency: clicking a
  // family keeps the reader's pan and zoom. Layout effect, so the first paint
  // is already framed.
  useLayoutEffect(() => {
    if (size.measured) setView(frame(matchBox));
  }, [bounds, size.measured]);

  // On resize, keep the centre and the zoom; only the window's extent changes.
  const lastSize = useRef(size);
  useLayoutEffect(() => {
    const previous = lastSize.current;
    lastSize.current = size;
    if (!previous.measured || !size.measured || previous === size) return;
    setView((current) => {
      const w = current.w * (size.w / previous.w);
      const h = current.h * (size.h / previous.h);
      return { x: current.x + (current.w - w) / 2, y: current.y + (current.h - h) / 2, w, h };
    });
  }, [size]);

  // When filters change, glide to what matches (debounced while typing).
  const filtersSettled = useRef(false);
  useEffect(() => {
    if (!filtersSettled.current) {
      filtersSettled.current = true;
      return;
    }
    if (!matchBox) return;
    const timer = window.setTimeout(() => setView(frame(matchBox)), 240);
    return () => window.clearTimeout(timer);
  }, [matchBox]);

  // one svg unit in client px (uniform: "meet" keeps the aspect)
  const unitPx = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 1;
    return Math.min(rect.width / view.w, rect.height / view.h);
  };

  const zoomAround = (factor: number, anchor?: { fx: number; fy: number }) => {
    setView((current) => {
      const currentZoom = home.w / current.w;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * factor));
      const w = home.w / nextZoom;
      const h = home.h / nextZoom;
      // keep the anchor point (fraction of viewport, default centre) fixed
      const fx = anchor?.fx ?? 0.5;
      const fy = anchor?.fy ?? 0.5;
      const anchorX = current.x + current.w * fx;
      const anchorY = current.y + current.h * fy;
      return { x: anchorX - w * fx, y: anchorY - h * fy, w, h };
    });
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    // only start a pan from empty canvas, never from a node/edge target
    if ((event.target as Element).closest(".graph-node, .graph-edge")) return;
    (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: view, moved: false };
    setIsPanning(true);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const px = unitPx();
    const dx = (event.clientX - state.startX) / px;
    const dy = (event.clientY - state.startY) / px;
    if (Math.abs(event.clientX - state.startX) + Math.abs(event.clientY - state.startY) > 3) state.moved = true;
    setView({ ...state.origin, x: state.origin.x - dx, y: state.origin.y - dy });
  };

  const endPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
    setIsPanning(false);
  };

  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    zoomAround(event.deltaY < 0 ? 1.12 : 1 / 1.12, { fx, fy });
  };

  const zoom = home.w / view.w;
  const allNames = zoom >= NAME_ZOOM_FLOOR;
  // counter-scales emphasised text when zoomed out, so it stays ~10px on screen
  const textScale = allNames ? 1 : READABLE_ZOOM / zoom;
  const hasSelection = Boolean(selectedEdgeId || selectedNodeId);

  return (
    <div className="canvas-viewport">
      <svg
        className={isPanning ? "graph-canvas panning" : "graph-canvas"}
        ref={svgRef}
        role="group"
        aria-label="Malware relationship graph"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={onWheel}
      >
        <defs>
          {/* the sky-blue cloud-wash that marks the selection */}
          <radialGradient id="selection-wash">
            <stop offset="0%" style={{ stopColor: "var(--cloud-core)" }} />
            <stop offset="100%" style={{ stopColor: "var(--cloud-edge)" }} />
          </radialGradient>
        </defs>

        <g className="edge-layer">
          {edges.map((edge) => (
            <GraphEdge
              edge={edge}
              isActivated={activatedEdgeIds.has(edge.id)}
              isFaded={filtering && !matchEdgeIds.has(edge.id)}
              isReceded={hasSelection && !activatedEdgeIds.has(edge.id)}
              isSelected={edge.id === selectedEdgeId}
              key={edge.id}
              segment={segments.get(edge.id)!}
              onSelect={onSelectEdge}
            />
          ))}
        </g>

        <g className="node-layer">
          {nodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const isActivated = activatedNodeIds.has(node.id);
            const isFaded = filtering && !matchNodeIds.has(node.id);
            const isEmphasised = isSelected || isActivated || (filtering && !isFaded);
            return (
              <GraphNode
                isActivated={isActivated}
                isFaded={isFaded}
                isReceded={hasSelection && !isActivated}
                isSelected={isSelected}
                key={node.id}
                node={node}
                nameScale={isEmphasised ? textScale : 1}
                showName={!isFaded && (allNames || isEmphasised)}
                onSelect={onSelectNode}
              />
            );
          })}
        </g>

        {/* relation labels ride above the nodes, so a dot or name never covers them */}
        <g className="edge-label-layer" aria-hidden="true">
          {labelOrder.map((edge) => {
            const point = labelPoints.get(edge.id)!;
            const className = [
              "graph-edge-label",
              edge.id === selectedEdgeId ? "selected" : "",
              activatedEdgeIds.has(edge.id) ? "activated" : "",
              showEdgeLabels ? "force-label" : "",
              filtering && !matchEdgeIds.has(edge.id) ? "faded" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <text
                className={className}
                key={edge.id}
                style={textScale > 1 ? { fontSize: 11 * textScale, strokeWidth: 4 * textScale } : undefined}
                x={point.x}
                y={point.y}
              >
                {edgeLabel(edge)}
              </text>
            );
          })}
        </g>
      </svg>

      {filtering && matchEdgeIds.size === 0 && (
        <p className="canvas-empty" role="status">
          No relationships match these filters.
        </p>
      )}

      <div className="zoom-controls" aria-label="Zoom and pan">
        <button onClick={() => zoomAround(1.25)} title="Zoom in" type="button">
          <Plus size={16} strokeWidth={2} />
        </button>
        <span aria-label="Current zoom">{Math.round(zoom * 100)}%</span>
        <button onClick={() => zoomAround(1 / 1.25)} title="Zoom out" type="button">
          <Minus size={16} strokeWidth={2} />
        </button>
        <button onClick={() => setView(frame(matchBox))} title="Reset view" type="button">
          <Crosshair size={15} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

/** Line families and dot sizes, read once in the corner of the canvas. */
function GraphLegend({ maxEvidence }: { maxEvidence: number }) {
  return (
    <div className="graph-legend" aria-label="How to read the graph">
      {legendRows.map((row) => (
        <span className="legend-item" key={row.family}>
          <svg aria-hidden="true" height="10" viewBox="0 0 28 10" width="28">
            <line className={`legend-line fam-${row.family}`} x1="1" x2={row.arrow ? 20 : 27} y1="5" y2="5" />
            {row.arrow && <polygon className="legend-head" points="27,5 20,1.8 20,8.2" />}
          </svg>
          {row.label}
        </span>
      ))}
      <span className="legend-item">
        <svg aria-hidden="true" height="22" viewBox="0 0 34 22" width="34">
          <circle className="legend-dot" cx="5" cy="11" r={dotRadius(1)} />
          <circle className="legend-dot" cx="22" cy="11" r={dotRadius(maxEvidence)} />
        </svg>
        area = sources, 1–{maxEvidence}
      </span>
    </div>
  );
}

function GraphEdge({
  edge,
  isActivated,
  isFaded,
  isReceded,
  isSelected,
  segment,
  onSelect,
}: {
  edge: PositionedEdge;
  isActivated: boolean;
  isFaded: boolean;
  isReceded: boolean;
  isSelected: boolean;
  segment: Segment;
  onSelect: (edgeId: string) => void;
}) {
  if (!segment.visible) return null;

  const { x1, y1, x2, y2 } = segment;
  const className = [
    "graph-edge",
    `fam-${edgeFamily(edge.type)}`,
    edge.status,
    isSelected ? "selected" : "",
    isActivated ? "activated" : "",
    isFaded ? "faded" : isReceded ? "receded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <g
      className={className}
      onClick={() => onSelect(edge.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(edge.id);
        }
      }}
      role="button"
      tabIndex={isFaded ? -1 : 0}
    >
      <title>
        {`${compactName(edge.fromNode)} ${edgeLabel(edge)} ${compactName(edge.toNode)} · ${edge.status}`}
      </title>
      <line className="edge-line" x1={x1} x2={x2} y1={y1} y2={y2} />
      {segment.head && <polygon className="edge-head" points={segment.head} />}
      <line className="edge-hitbox" x1={x1} x2={x2} y1={y1} y2={y2} />
    </g>
  );
}

function GraphNode({
  node,
  isActivated,
  isFaded,
  isReceded,
  isSelected,
  nameScale,
  showName,
  onSelect,
}: {
  node: PositionedNode;
  isActivated: boolean;
  isFaded: boolean;
  isReceded: boolean;
  isSelected: boolean;
  nameScale: number;
  showName: boolean;
  onSelect: (nodeId: string) => void;
}) {
  const className = [
    "graph-node",
    isSelected ? "selected" : "",
    isActivated ? "activated" : "",
    isFaded ? "faded" : isReceded ? "receded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <g
      aria-label={`${node.name}, ${node.evidence} source${node.evidence === 1 ? "" : "s"}`}
      className={className}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
      role="button"
      tabIndex={isFaded ? -1 : 0}
      transform={`translate(${node.x} ${node.y})`}
    >
      <title>
        {`${node.name} · ${node.evidence} source${node.evidence === 1 ? "" : "s"} · ${node.degree} relationship${
          node.degree === 1 ? "" : "s"
        }`}
      </title>
      {isSelected && <circle className="selection-wash" r={Math.max(node.radius * 4.2, 34)} />}
      <circle className="dot" r={node.radius} />
      {/* a hit target larger than the mark */}
      <circle className="dot-hit" r={Math.max(node.radius + 8, 14)} />
      {showName && (
        <text
          className="name"
          style={nameScale > 1 ? { fontSize: 12 * nameScale, strokeWidth: 3.5 * nameScale } : undefined}
          y={node.radius + (NAME_GAP + 10) * nameScale}
        >
          {compactName(node)}
        </text>
      )}
    </g>
  );
}

function Inspector({
  edge,
  mode,
  node,
  selection,
}: {
  edge: AtlasEdge;
  mode: ViewMode;
  node?: MalwareNode;
  selection: Selection;
}) {
  if (mode === "sources") return <SourceInspector edge={edge} node={node} selection={selection} />;
  if (mode === "curation") return <CurationInspector edge={edge} node={node} selection={selection} />;
  if (mode === "timeline") return <TimelineInspector />;
  if (mode === "about") return <AboutInspector />;
  if (selection.type === "node" && node) return <NodeInspector node={node} />;

  return <EdgeInspector edge={edge} />;
}

function EdgeInspector({ edge }: { edge: AtlasEdge }) {
  const fromNode = atlas.nodeById.get(edge.from);
  const toNode = atlas.nodeById.get(edge.to);

  return (
    <aside className="inspector" aria-label="Selected relationship">
      <div className="inspector-kicker">edge selected</div>
      <div className="edge-type-row">
        <span className={`edge-dot ${confidenceTone[edge.confidence]}`} />
        <span>{edge.type}</span>
        <small>{edge.status}</small>
      </div>

      <h2>
        {compactName(fromNode)}
        <span aria-hidden="true">→</span>
        {compactName(toNode)}
      </h2>

      <CollapsibleSection title="Evidence">
        <ConfidenceMeter confidence={edge.confidence} />
        <p>{edge.confidence_reason ?? edge.curator_note}</p>
      </CollapsibleSection>

      <CollapsibleSection title="Citations">
        <SourceList citations={edge.sources} recordKey={edge.id} />
      </CollapsibleSection>

      <CollapsibleSection title="Curation">
        <Metadata label="Status" value={edge.status} tone={statusTone[edge.status]} />
        <Metadata label="Review" value={edge.review_state ?? "draft"} />
        <Metadata label="Scope" value={readableToken(edge.relation_scope)} />
        <Metadata label="Evidence" value={readableToken(edge.evidence_type)} />
        <Metadata label="Updated" value={edge.updated_at} />
      </CollapsibleSection>
    </aside>
  );
}

function NodeInspector({ node }: { node: MalwareNode }) {
  const connectedEdges = connectedEdgesForNode(node.id);
  const nodeSources = dedupeEvidence([...(node.sources ?? []), ...(node.first_seen?.sources ?? [])]);

  return (
    <aside className="inspector" aria-label="Selected family">
      <div className="inspector-kicker">family selected</div>
      <div className="edge-type-row">
        <span className="edge-dot lens-dot" />
        <span>{node.type.replaceAll("_", " ")}</span>
        <small>{node.status ?? "tracked"}</small>
      </div>

      <h2 className="entity-title">{node.name}</h2>

      <CollapsibleSection title="Profile">
        <p>{node.summary}</p>
        <div className="tag-row">
          {(node.aliases ?? []).map((alias) => (
            <span key={alias}>{alias}</span>
          ))}
          {(node.tags ?? []).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Known Data">
        <Metadata label="First seen" value={node.first_seen?.value ?? "unknown"} />
        <Metadata label="Scope" value={node.first_seen?.scope ?? "unknown"} />
        <Metadata label="Identity" value={readableToken(node.identity_basis)} />
        <Metadata label="Relationships" value={String(connectedEdges.length)} />
        <Metadata label="Family sources" value={String(nodeSources.length)} />
        <Metadata label="With relationships" value={String(evidenceFor(node.id))} />
      </CollapsibleSection>

      <CollapsibleSection title="Connected Relationships">
        <RelationshipList edges={connectedEdges} nodeId={node.id} />
      </CollapsibleSection>

      <CollapsibleSection title="Cited Claims">
        <SourceList citations={nodeSources} recordKey={node.id} />
      </CollapsibleSection>
    </aside>
  );
}

function SourceInspector({ edge, node, selection }: { edge: AtlasEdge; node?: MalwareNode; selection: Selection }) {
  const citations =
    selection.type === "node" && node
      ? dedupeEvidence([...(node.sources ?? []), ...(node.first_seen?.sources ?? [])])
      : edge.sources;

  return (
    <aside className="inspector" aria-label="Source catalog">
      <div className="inspector-kicker">source catalog</div>
      <h2 className="entity-title">{citations.length} cited records</h2>
      <CollapsibleSection title="Selected entity sources">
        <SourceList citations={citations} recordKey={selection.id} />
      </CollapsibleSection>
      <CollapsibleSection title="Coverage">
        <Metadata label="Public sources" value={String(atlas.sources.length)} />
        <Metadata
          label="High citability"
          value={String(atlas.sources.filter((source) => source.public_citability === "high").length)}
        />
        <Metadata
          label="Vendor reports"
          value={String(atlas.sources.filter((source) => source.source_type === "vendor_blog").length)}
        />
      </CollapsibleSection>
    </aside>
  );
}

function CurationInspector({
  edge,
  node,
  selection,
}: {
  edge: AtlasEdge;
  node?: MalwareNode;
  selection: Selection;
}) {
  const connectedEdges = selection.type === "node" && node ? connectedEdgesForNode(node.id) : [edge];
  const tentativeCount = connectedEdges.filter((candidate) => candidate.status === "tentative").length;

  return (
    <aside className="inspector" aria-label="Curation status">
      <div className="inspector-kicker">curation state</div>
      <h2 className="entity-title">Evidence before lineage</h2>
      <CollapsibleSection title="Edge status">
        <Metadata
          label="Accepted"
          value={String(atlas.edges.filter((candidate) => candidate.status === "accepted").length)}
          tone="status-accepted"
        />
        <Metadata
          label="Tentative"
          value={String(atlas.edges.filter((candidate) => candidate.status === "tentative").length)}
          tone="status-tentative"
        />
        <Metadata
          label="Reviewed"
          value={String(atlas.edges.filter((candidate) => candidate.review_state === "reviewed").length)}
        />
        <Metadata label="Selected tentative" value={String(tentativeCount)} tone="status-tentative" />
      </CollapsibleSection>
      <CollapsibleSection title="Selected guardrail">
        <p>
          {selection.type === "node"
            ? "Family context can activate nearby records, but the ontology only changes through reviewed edge records."
            : edge.curator_note ?? edge.confidence_reason}
        </p>
      </CollapsibleSection>
    </aside>
  );
}

function TimelineInspector() {
  const datedNodes = atlas.nodes
    .filter((node) => node.first_seen?.value)
    .sort((a, b) => a.first_seen!.value.localeCompare(b.first_seen!.value));

  return (
    <aside className="inspector" aria-label="Family timeline">
      <div className="inspector-kicker">timeline</div>
      <h2 className="entity-title">First-seen records</h2>
      <CollapsibleSection title="Timeline records">
        {datedNodes.slice(0, 8).map((node) => (
          <div className="timeline-row" key={node.id}>
            <span>{node.first_seen?.value}</span>
            <strong>{node.name}</strong>
          </div>
        ))}
      </CollapsibleSection>
    </aside>
  );
}

function AboutInspector() {
  const accepted = atlas.edges.filter((edge) => edge.status === "accepted").length;
  const tentative = atlas.edges.filter((edge) => edge.status === "tentative").length;

  return (
    <aside className="inspector" aria-label="About the atlas">
      <div className="inspector-kicker">about</div>
      <h2 className="entity-title">Malzu</h2>

      <CollapsibleSection title="What this is">
        <p>
          A citation-first map of malware lineage, code sharing, operator continuity, and adjacent
          ecosystem relationships. Every promoted relationship is backed by a public source.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="How to read it">
        <p>
          Each dot is a malware family; its area is proportional to the distinct public sources citing the
          family or its relationships. Solid arrows are lineage and point to the ancestor; dashed lines are
          shared code, operators, or behaviour; dotted arrows are delivery and point to the loader; thin
          lines are reported links. Tentative claims draw lighter. Select a family or a line to open its
          sources here.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="At a glance">
        <Metadata label="Families" value={String(atlas.nodes.length)} />
        <Metadata label="Relationships" value={String(atlas.edges.length)} />
        <Metadata label="Accepted" value={String(accepted)} tone="status-accepted" />
        <Metadata label="Tentative" value={String(tentative)} tone="status-tentative" />
        <Metadata label="Public sources" value={String(atlas.sources.length)} />
      </CollapsibleSection>

      <CollapsibleSection title="Confidence & status">
        <p>
          Every relationship cites public sources. <strong>Accepted</strong> edges are well-corroborated;{" "}
          <strong>tentative</strong> ones rest on a single or weaker claim and are marked so you can judge
          them yourself. Scope separates code, operator, brand, distribution, behavior, and reporting
          claims so relatedness is not silently upgraded into lineage.
        </p>
      </CollapsibleSection>
    </aside>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="collapsible-section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}

/** Distinct sources citing a family or its relationships: what its dot's area shows. */
function evidenceFor(nodeId: string) {
  const node = atlas.nodeById.get(nodeId);
  const cited = new Set([...(node?.sources ?? []), ...(node?.first_seen?.sources ?? [])].map((c) => c.source));
  for (const edge of connectedEdgesForNode(nodeId)) for (const c of edge.sources) cited.add(c.source);
  return cited.size;
}

function connectedEdgesForNode(nodeId: string) {
  return atlas.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}

function dedupeEvidence(citations: Array<{ source: string; claim: string; claim_scope?: string; locator?: string }>) {
  const seen = new Set<string>();

  return citations.filter((citation) => {
    const key = `${citation.source}:${citation.claim}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function RelationshipList({ edges, nodeId }: { edges: AtlasEdge[]; nodeId: string }) {
  if (!edges.length) {
    return <p>No curated relationships yet.</p>;
  }

  return (
    <div className="relationship-list">
      {edges.map((edge) => {
        const otherNode = atlas.nodeById.get(edge.from === nodeId ? edge.to : edge.from);

        return (
          <div className="relationship-row" key={edge.id}>
            <span>{edgeLabel(edge)}</span>
            <strong>{compactName(otherNode)}</strong>
            <small className={statusTone[edge.status]}>{edge.status}</small>
          </div>
        );
      })}
    </div>
  );
}

function ConfidenceMeter({ confidence }: { confidence: "low" | "medium" | "high" }) {
  const score = confidenceScore[confidence];

  return (
    <div className="confidence-meter">
      <span className={confidenceTone[confidence]}>{confidence}</span>
      <div aria-label={`${score} of 5 confidence`} className="confidence-dots">
        {Array.from({ length: 5 }).map((_, index) => (
          <i className={index < score ? confidenceTone[confidence] : ""} key={index} />
        ))}
      </div>
      <small>{score} / 5</small>
    </div>
  );
}

function SourceList({
  citations,
  recordKey,
}: {
  citations: Array<{ source: string; claim: string; claim_scope?: string; locator?: string }>;
  recordKey: string;
}) {
  return (
    <div className="source-list">
      {citations.map((citation) => {
        const source = atlas.sourceById.get(citation.source);

        return (
          <a href={source?.url} key={`${recordKey}:${citation.source}:${citation.claim}`} rel="noreferrer" target="_blank">
            <span>{source?.publisher ?? citation.source.replace("source:", "")}</span>
            <strong>{source?.title ?? citation.source}</strong>
            <small>{sourceHost(source)}</small>
            <ExternalLink size={14} strokeWidth={1.8} />
          </a>
        );
      })}
    </div>
  );
}

function Metadata({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="metadata-row">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function AnalyticalDock({
  dockMode,
  edge,
  node,
  relationshipTypes,
  selection,
  visibleEdges,
  visibleNodes,
  onDockModeChange,
}: {
  dockMode: DockMode;
  edge: AtlasEdge;
  node?: MalwareNode;
  relationshipTypes: string[];
  selection: Selection;
  visibleEdges: AtlasEdge[];
  visibleNodes: MalwareNode[];
  onDockModeChange: (mode: DockMode) => void;
}) {
  return (
    <section className="analysis-dock" aria-label="Atlas analysis">
      <div className="dock-tabs" role="tablist" aria-label="Analysis views">
        {dockModes.map(({ id, label, icon: Icon }) => (
          <button
            aria-selected={dockMode === id}
            className={dockMode === id ? "dock-tab active" : "dock-tab"}
            key={id}
            onClick={() => onDockModeChange(id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" size={14} strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>

      <div className="dock-content">
        {dockMode === "timeline" && <TimelineDock nodes={visibleNodes} edges={visibleEdges} />}
        {dockMode === "matrix" && (
          <MatrixDock nodes={visibleNodes} edges={visibleEdges} relationshipTypes={relationshipTypes} />
        )}
        {dockMode === "coverage" && <CoverageDock nodes={visibleNodes} edges={visibleEdges} />}
        {dockMode === "lens" && (
          <LensDock edge={edge} node={node} selection={selection} visibleEdges={visibleEdges} />
        )}
      </div>
    </section>
  );
}

function TimelineDock({ nodes, edges }: { nodes: MalwareNode[]; edges: AtlasEdge[] }) {
  const datedNodes = nodes
    .filter((node) => node.first_seen?.value)
    .sort((a, b) => a.first_seen!.value.localeCompare(b.first_seen!.value));

  const span = datedNodes.length
    ? {
        start: Number(datedNodes[0].first_seen!.value.slice(0, 4)),
        end: Number(datedNodes[datedNodes.length - 1].first_seen!.value.slice(0, 4)),
      }
    : { start: 0, end: 1 };

  const edgeEvents = edges
    .map((edge) => ({
      id: edge.id,
      date: edge.updated_at,
      label: `${compactName(atlas.nodeById.get(edge.from))} ${edgeLabel(edge)} ${compactName(
        atlas.nodeById.get(edge.to),
      )}`,
      status: edge.status,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="timeline-dock">
      <div className="dock-column wide">
        <span className="dock-kicker">family emergence · {span.start}–{span.end}</span>
        <div className="timeline-track">
          {datedNodes.map((node) => (
            <div className="timeline-mark" key={node.id}>
              <span className="timeline-year">{node.first_seen!.value.slice(0, 4)}</span>
              <i />
              <strong>{compactName(node)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="dock-column">
        <span className="dock-kicker">recent reviewed relationships</span>
        <div className="event-ribbon">
          {edgeEvents.slice(0, 4).map((event) => (
            <div className="event-pill" key={event.id}>
              <span className={statusTone[event.status]}>{event.status}</span>
              <strong>{event.label}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatrixDock({
  nodes,
  edges,
  relationshipTypes,
}: {
  nodes: MalwareNode[];
  edges: AtlasEdge[];
  relationshipTypes: string[];
}) {
  const matrixNodes = nodes
    .filter((node) => edges.some((edge) => edge.from === node.id || edge.to === node.id))
    .sort((a, b) => {
      const aDeg = edges.filter((e) => e.from === a.id || e.to === a.id).length;
      const bDeg = edges.filter((e) => e.from === b.id || e.to === b.id).length;
      return bDeg - aDeg || compactName(a).localeCompare(compactName(b));
    })
    .slice(0, 9);

  const matrixTypes = relationshipTypes;

  return (
    <div
      className="matrix-dock"
      style={{ ["--matrix-cols" as string]: `minmax(72px, 1.4fr) repeat(${matrixTypes.length}, minmax(34px, 1fr))` }}
    >
      <div className="matrix-head">
        <span />
        {matrixTypes.map((type) => (
          <strong key={type} title={type.replaceAll("_", " ")}>
            {relationAbbrev[type] ?? type.slice(0, 3).toUpperCase()}
          </strong>
        ))}
      </div>

      {matrixNodes.map((node) => (
        <div className="matrix-row" key={node.id}>
          <strong title={node.name}>{compactName(node)}</strong>
          {matrixTypes.map((type) => {
            const cellEdges = edges.filter(
              (edge) => edge.type === type && (edge.from === node.id || edge.to === node.id),
            );
            const accepted = cellEdges.some((edge) => edge.status === "accepted");
            const tentative = cellEdges.some((edge) => edge.status === "tentative");
            const cls = accepted ? "matrix-cell accepted" : tentative ? "matrix-cell tentative" : "matrix-cell";

            return (
              <span
                className={cls}
                key={`${node.id}:${type}`}
                title={`${node.name}: ${cellEdges.length} ${type.replaceAll("_", " ")} edge(s)`}
              >
                {cellEdges.length || ""}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CoverageDock({ nodes, edges }: { nodes: MalwareNode[]; edges: AtlasEdge[] }) {
  const coverageRows = nodes
    .map((node) => {
      const connectedEdges = edges.filter((edge) => edge.from === node.id || edge.to === node.id);
      const nodeSourceCount = dedupeEvidence([...(node.sources ?? []), ...(node.first_seen?.sources ?? [])]).length;
      const edgeCitationCount = connectedEdges.reduce((total, edge) => total + edge.sources.length, 0);

      return {
        id: node.id,
        name: compactName(node),
        connectedEdges: connectedEdges.length,
        sourceCount: nodeSourceCount + edgeCitationCount,
      };
    })
    .sort((a, b) => b.sourceCount - a.sourceCount)
    .slice(0, 8);

  const maxSourceCount = Math.max(...coverageRows.map((row) => row.sourceCount), 1);

  return (
    <div className="coverage-dock">
      {coverageRows.map((row) => (
        <div className="coverage-row" key={row.id}>
          <strong title={row.name}>{row.name}</strong>
          <span className="coverage-bar">
            <i style={{ width: `${Math.max(8, (row.sourceCount / maxSourceCount) * 100)}%` }} />
          </span>
          <small>
            {row.sourceCount} cites · {row.connectedEdges} edges
          </small>
        </div>
      ))}
    </div>
  );
}

function LensDock({
  edge,
  node,
  selection,
  visibleEdges,
}: {
  edge: AtlasEdge;
  node?: MalwareNode;
  selection: Selection;
  visibleEdges: AtlasEdge[];
}) {
  const activatedEdges =
    selection.type === "node" && node
      ? visibleEdges.filter((candidate) => candidate.from === node.id || candidate.to === node.id)
      : [edge];

  const selectedLabel =
    selection.type === "node" && node
      ? node.name
      : `${compactName(atlas.nodeById.get(edge.from))} ${edgeLabel(edge)} ${compactName(atlas.nodeById.get(edge.to))}`;

  return (
    <div className="lens-dock">
      <div className="lens-copy">
        <span className="dock-kicker">selected</span>
        <strong>{selectedLabel}</strong>
        <p>
          {activatedEdges.length === 1
            ? "Showing this relationship and its cited evidence."
            : `Showing ${activatedEdges.length} relationships connected to this family and their cited evidence.`}
        </p>
      </div>
      <div className="activation-list">
        {activatedEdges.slice(0, 5).map((candidate) => (
          <div className="activation-row" key={candidate.id}>
            <svg aria-hidden="true" className="rel-glyph" height="10" viewBox="0 0 22 10" width="22">
              <line className={`legend-line fam-${edgeFamily(candidate.type)}`} x1="1" x2="21" y1="5" y2="5" />
            </svg>
            <span>{edgeLabel(candidate)}</span>
            <strong>
              {compactName(atlas.nodeById.get(candidate.from))} / {compactName(atlas.nodeById.get(candidate.to))}
            </strong>
            <small>{candidate.sources.length} cited</small>
          </div>
        ))}
      </div>
    </div>
  );
}
