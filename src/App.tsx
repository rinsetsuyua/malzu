import {
  BarChart3,
  BookOpen,
  CheckCircle2,
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { atlas } from "./data/atlas";
import type { AtlasEdge, AtlasSource, MalwareNode } from "./data/types";
import {
  buildLayout,
  type GraphBounds,
  type LayoutMode,
  type PositionedEdge,
  type PositionedNode,
} from "./lib/graphLayout";

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
  forked_from: "forked from",
  inspired_by: "inspired by",
  loaded_by: "loaded by",
  reported_as_related_to: "reported related",
  shares_behavior_with: "shares behavior",
  shares_code_with: "shares code",
  shares_creator_with: "shares creator",
  uses_loader: "uses loader",
  variant_of: "variant of",
};

const relationAbbrev: Record<string, string> = {
  derived_from: "DRV",
  forked_from: "FRK",
  inspired_by: "INS",
  loaded_by: "LOAD",
  reported_as_related_to: "REL",
  shares_behavior_with: "BEH",
  shares_code_with: "CODE",
  shares_creator_with: "OPER",
  uses_loader: "LDR",
  variant_of: "VAR",
};

const compactName = (node?: MalwareNode) => node?.name.replace(" Stealer", "") ?? "Unknown";

const edgeLabel = (edge: AtlasEdge) => relationLabels[edge.type] ?? edge.type.replaceAll("_", " ");

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
        edge.status,
        edge.confidence,
        from?.name,
        from?.aliases?.join(" "),
        from?.summary,
        from?.tags?.join(" "),
        to?.name,
        to?.aliases?.join(" "),
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

  const visibleNodeIds = new Set(visibleEdges.flatMap((edge) => [edge.from, edge.to]));
  const visibleNodes = atlas.nodes.filter((node) => visibleNodeIds.has(node.id));
  const layout = useMemo(
    () => buildLayout(layoutMode, visibleNodes, visibleEdges),
    [layoutMode, visibleEdges, visibleNodes],
  );

  const selectedEdge =
    selection.type === "edge"
      ? visibleEdges.find((edge) => edge.id === selection.id) ?? visibleEdges[0] ?? atlas.edges[0]
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

    for (const edge of visibleEdges) {
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
              isCompact={isCompact}
              layoutMode={layoutMode}
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
        <div className="validated">
          <dt>
            <CheckCircle2 size={15} strokeWidth={1.8} />
            validated
          </dt>
          <dd>local</dd>
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
            title="Lineage view — ancestors flow to descendants"
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
    </div>
  );
}

type View = { x: number; y: number; w: number; h: number };

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
// layout units render as x*X_SCALE / y*Y_SCALE (matches graphLayout geometry)
const X_SCALE = 10;
const Y_SCALE = 7;

// Initial view, centered on the content at a *readable* zoom. We deliberately
// don't fit-everything for large graphs — that shrinks nodes to dots. Instead we
// cap the viewport to a comfortable window (~the size that showed ~13 nodes well)
// and center it on the content; the user pans/zooms out to explore the rest.
const READABLE_W = 1000;
const READABLE_H = 700;
const targetAspect = READABLE_W / READABLE_H;

function fitView(bounds: GraphBounds): View {
  const cx = ((bounds.minX + bounds.maxX) / 2) * X_SCALE;
  const cy = ((bounds.minY + bounds.maxY) / 2) * Y_SCALE;
  const contentW = (bounds.maxX - bounds.minX) * X_SCALE;
  const contentH = (bounds.maxY - bounds.minY) * Y_SCALE;

  // 100% = a readable window where nodes are full size. Small graphs that fit
  // inside it are shown whole (centered); larger graphs open at this readable
  // zoom centered on their middle, and the user pans/zooms out to see the rest.
  const w = Math.max(READABLE_W, contentW <= READABLE_W ? contentW * 1.15 : READABLE_W);
  const h = w / targetAspect;
  void contentH;
  // bias the content downward a little so top-row nodes clear the floating
  // controls (which overlay the top ~70px of the canvas)
  const topBias = h * 0.06;
  return { x: cx - w / 2, y: cy - h / 2 - topBias, w, h };
}

function GraphCanvas({
  nodes,
  edges,
  activatedEdgeIds,
  activatedNodeIds,
  bounds,
  isCompact,
  layoutMode,
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
  isCompact: boolean;
  layoutMode: LayoutMode;
  selectedEdgeId?: string;
  selectedNodeId?: string;
  showEdgeLabels: boolean;
  onSelectEdge: (edgeId: string) => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const home = useMemo(() => fitView(bounds), [bounds]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>(home);
  const [isPanning, setIsPanning] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; origin: View; moved: boolean } | null>(null);

  // re-fit when the content changes shape (data, filters, or layout mode)
  useEffect(() => {
    setView(home);
  }, [home, layoutMode]);

  const pxToSvg = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { sx: view.w / 1000, sy: view.h / 700 };
    return { sx: view.w / rect.width, sy: view.h / rect.height };
  };

  const zoomAround = (factor: number, anchor?: { fx: number; fy: number }) => {
    setView((current) => {
      const baseW = home.w;
      const currentZoom = baseW / current.w;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * factor));
      const w = baseW / nextZoom;
      const h = home.h / nextZoom;
      // keep the anchor point (fraction of viewport, default center) fixed
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
    const { sx, sy } = pxToSvg();
    const dx = (event.clientX - state.startX) * sx;
    const dy = (event.clientY - state.startY) * sy;
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

  const zoomPct = Math.round((home.w / view.w) * 100);

  return (
    <div className="canvas-viewport">
      <svg
        className={isPanning ? "graph-canvas panning" : "graph-canvas"}
        ref={svgRef}
        role="img"
        aria-label="Malware relationship graph"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={onWheel}
      >
        <defs>
          <marker
            id="arrow"
            markerHeight="7"
            markerWidth="7"
            orient="auto"
            refX="6"
            refY="3.5"
            viewBox="0 0 7 7"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" />
          </marker>
        </defs>

        <g className="edge-layer">
          {edges.map((edge) => (
            <GraphEdge
              edge={edge}
              isActivated={activatedEdgeIds.has(edge.id)}
              isSelected={edge.id === selectedEdgeId}
              key={edge.id}
              showLabel={showEdgeLabels}
              onSelect={onSelectEdge}
            />
          ))}
        </g>

        <g className="node-layer">
          {nodes.map((node) => (
            <GraphNode
              isActivated={activatedNodeIds.has(node.id)}
              isSelected={node.id === selectedNodeId}
              key={node.id}
              node={node}
              onSelect={onSelectNode}
            />
          ))}
        </g>
      </svg>

      <div className="zoom-controls" aria-label="Zoom and pan">
        <button onClick={() => zoomAround(1.25)} title="Zoom in" type="button">
          <Plus size={16} strokeWidth={2} />
        </button>
        <span aria-label="Current zoom">{zoomPct}%</span>
        <button onClick={() => zoomAround(1 / 1.25)} title="Zoom out" type="button">
          <Minus size={16} strokeWidth={2} />
        </button>
        <button onClick={() => setView(home)} title="Reset view" type="button">
          <Crosshair size={15} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function GraphEdge({
  edge,
  isActivated,
  isSelected,
  showLabel,
  onSelect,
}: {
  edge: PositionedEdge;
  isActivated: boolean;
  isSelected: boolean;
  showLabel: boolean;
  onSelect: (edgeId: string) => void;
}) {
  const x1 = edge.fromNode.x * 10;
  const y1 = edge.fromNode.y * 7;
  const x2 = edge.toNode.x * 10;
  const y2 = edge.toNode.y * 7;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dashed = edge.type.startsWith("shares_");

  return (
    <g
      className={`graph-edge rel-${edge.type} ${isSelected ? "selected" : ""} ${
        isActivated ? "activated" : ""
      } ${dashed ? "dashed" : ""} ${showLabel ? "force-label" : ""}`}
      onClick={() => onSelect(edge.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(edge.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <line markerEnd="url(#arrow)" x1={x1} x2={x2} y1={y1} y2={y2} />
      <text x={midX} y={midY - 8}>
        {edgeLabel(edge)}
      </text>
      <line className="edge-hitbox" x1={x1} x2={x2} y1={y1} y2={y2} />
    </g>
  );
}

function GraphNode({
  node,
  isActivated,
  isSelected,
  onSelect,
}: {
  node: PositionedNode;
  isActivated: boolean;
  isSelected: boolean;
  onSelect: (nodeId: string) => void;
}) {
  const className = [
    "graph-node",
    node.layer,
    isActivated ? "activated" : "",
    isSelected ? "selected" : "",
    node.tags?.includes("maas") ? "tag-maas" : "",
    node.status === "active" ? "status-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <g
      aria-label={`${node.name} family`}
      className={className}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
      role="button"
      tabIndex={0}
      transform={`translate(${node.x * 10} ${node.y * 7})`}
    >
      <circle r={node.layer === "focus" ? 38 : 34} />
      <text>
        {compactName(node)
          .split(" ")
          .map((word, index) => (
            <tspan dy={index === 0 ? 0 : 14} key={word} x="0">
              {word}
            </tspan>
          ))}
      </text>
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
        <Metadata label="Evidence" value={edge.evidence_type.replaceAll("_", " ")} />
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
        <Metadata label="Relationships" value={String(connectedEdges.length)} />
        <Metadata label="Sources" value={String(nodeSources.length)} />
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
          Each node is a malware family or variant; each edge is a typed claim. Select any node or edge
          to focus the graph and open its sources in this panel.
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
          them yourself.
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
            <span className={`rel-tick rel-${candidate.type}`} aria-hidden="true" />
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
