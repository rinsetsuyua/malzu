import type { Atlas, AtlasEdge, AtlasSource, MalwareNode } from "./types";

/**
 * The atlas data is fetched at runtime from `public/atlas.json`, a slim
 * projection generated at build time by scripts/build-atlas.mjs. This keeps the
 * JS bundle small and constant regardless of how large the dataset grows, and
 * keeps curation-only fields (licensing, trust notes, etc.) out of the payload.
 *
 * `loadAtlas()` is awaited once in main.tsx before the app renders, so the rest
 * of the app can treat `atlas` as a ready, synchronous singleton.
 */

type AtlasPayload = {
  nodes: MalwareNode[];
  edges: AtlasEdge[];
  sources: AtlasSource[];
};

export const atlas: Atlas = {
  nodes: [],
  edges: [],
  sources: [],
  sourceById: new Map(),
  nodeById: new Map(),
};

let loaded: Promise<Atlas> | undefined;

export function loadAtlas(): Promise<Atlas> {
  if (loaded) return loaded;

  loaded = fetch(`${import.meta.env.BASE_URL}atlas.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load atlas.json (${response.status})`);
      return response.json() as Promise<AtlasPayload>;
    })
    .then((payload) => {
      atlas.nodes = payload.nodes ?? [];
      atlas.edges = payload.edges ?? [];
      atlas.sources = payload.sources ?? [];
      atlas.sourceById = new Map(atlas.sources.map((source) => [source.id, source]));
      atlas.nodeById = new Map(atlas.nodes.map((node) => [node.id, node]));
      return atlas;
    });

  return loaded;
}
