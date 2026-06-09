/**
 * Build the public atlas projection.
 *
 * The data/ source files are intentionally rich — they carry licensing posture,
 * redistribution policy, trust notes, retrieval dates, and other curation
 * metadata. The web UI never renders most of that. This script projects the
 * source records down to only the fields the UI actually consumes and writes a
 * single `public/atlas.json`, which the app fetches at runtime.
 *
 * Result: the JS bundle stays small and constant no matter how much the atlas
 * grows, and internal/curation-only fields never reach the shipped payload.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataRoot = path.join(root, "data");
const outFile = path.join(root, "public", "atlas.json");

async function listJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(full)));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(full);
  }
  return files.sort();
}

async function readRecords(subdir) {
  const files = await listJsonFiles(path.join(dataRoot, subdir));
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(f, "utf8"))));
}

// drop undefined keys so the projection stays compact
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const projectEvidence = (e) =>
  compact({ source: e.source, claim: e.claim, claim_scope: e.claim_scope, locator: e.locator });

const projectNode = (n) =>
  compact({
    id: n.id,
    type: n.type,
    name: n.name,
    category: n.category,
    aliases: n.aliases,
    summary: n.summary,
    first_seen: n.first_seen
      ? compact({
          value: n.first_seen.value,
          precision: n.first_seen.precision,
          scope: n.first_seen.scope,
          sources: (n.first_seen.sources ?? []).map(projectEvidence),
        })
      : undefined,
    tags: n.tags,
    status: n.status,
    sources: (n.sources ?? []).map(projectEvidence),
  });

const projectEdge = (e) =>
  compact({
    id: e.id,
    from: e.from,
    to: e.to,
    type: e.type,
    direction: e.direction,
    confidence: e.confidence,
    evidence_type: e.evidence_type,
    status: e.status,
    sources: (e.sources ?? []).map(projectEvidence),
    curator_note: e.curator_note,
    confidence_reason: e.confidence_reason,
    review_state: e.review_state,
    relation_qualifier: e.relation_qualifier,
    shared_artifact_type: e.shared_artifact_type,
    created_at: e.created_at,
    updated_at: e.updated_at,
  });

// only the source fields the UI renders — licensing/redistribution/trust notes
// stay in the source files but never ship to the browser
const projectSource = (s) =>
  compact({
    id: s.id,
    title: s.title,
    publisher: s.publisher,
    url: s.url,
    source_type: s.source_type,
    public_citability: s.public_citability,
  });

async function main() {
  const [nodes, edges, sources] = await Promise.all([
    readRecords("nodes"),
    readRecords("edges"),
    readRecords("sources"),
  ]);

  const byName = (a, b) => (a.name ?? a.title ?? a.id).localeCompare(b.name ?? b.title ?? b.id);
  const byStatusThenType = (a, b) =>
    `${a.status}:${a.type}:${a.id}`.localeCompare(`${b.status}:${b.type}:${b.id}`);

  const atlas = {
    generated_at: new Date().toISOString().slice(0, 10),
    nodes: nodes.map(projectNode).sort(byName),
    edges: edges.map(projectEdge).sort(byStatusThenType),
    sources: sources.map(projectSource).sort(byName),
  };

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(atlas));

  const bytes = Buffer.byteLength(JSON.stringify(atlas));
  console.log(
    `Wrote public/atlas.json — ${atlas.nodes.length} nodes, ${atlas.edges.length} edges, ` +
      `${atlas.sources.length} sources (${(bytes / 1024).toFixed(0)} kB).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
