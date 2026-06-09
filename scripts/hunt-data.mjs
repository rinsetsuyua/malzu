import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataRoot = path.join(root, "data");
const researchRoot = path.join(dataRoot, "research");

const highRiskEdgeTypes = new Set([
  "derived_from",
  "forked_from",
  "shares_code_with",
  "shares_operator_with",
  "shares_creator_with",
  "variant_of",
]);

const priorityScore = {
  P0: 100,
  P1: 75,
  P2: 50,
  P3: 25,
};

const categoryOrder = [
  "ransomware",
  "banker",
  "loader",
  "botnet",
  "ics_sabotage",
  "wiper",
  "rat",
  "backdoor",
  "rootkit",
  "infostealer",
  "tooling",
  "other",
];

const mitreBundles = [
  {
    name: "enterprise",
    url: "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json",
  },
  {
    name: "ics",
    url: "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/ics-attack/ics-attack.json",
  },
  {
    name: "mobile",
    url: "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/mobile-attack/mobile-attack.json",
  },
];

const args = new Set(process.argv.slice(2));
const limit = Number.parseInt(valueAfter("--limit") ?? "20", 10);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function listJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readJsonRecords(dirName) {
  const dir = path.join(dataRoot, dirName);
  const files = await listJsonFiles(dir);
  return Promise.all(files.map(async (file) => ({ file, record: await readJson(file) })));
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function displayPath(file) {
  return path.relative(root, file);
}

function countBy(records, getKey) {
  const counts = new Map();

  for (const item of records) {
    const key = getKey(item) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

function knownLabels(nodes) {
  const labels = new Map();

  for (const { record } of nodes) {
    const values = [
      record.name,
      record.id?.split(":")[1],
      ...(Array.isArray(record.aliases) ? record.aliases : []),
    ];

    for (const value of values) {
      const key = normalize(value);
      if (!key) continue;

      const ids = labels.get(key) ?? new Set();
      ids.add(record.id);
      labels.set(key, ids);
    }
  }

  return labels;
}

function candidateMatches(candidate, labels) {
  const values = [
    candidate.name,
    ...(Array.isArray(candidate.aliases) ? candidate.aliases : []),
  ];

  for (const value of values) {
    const matches = labels.get(normalize(value));
    if (matches?.size === 1) return [...matches][0];
  }

  return undefined;
}

function candidateSort(a, b) {
  const priorityDelta = (priorityScore[b.priority] ?? 0) - (priorityScore[a.priority] ?? 0);
  if (priorityDelta !== 0) return priorityDelta;

  const categoryDelta = categoryOrder.indexOf(a.category_hint) - categoryOrder.indexOf(b.category_hint);
  if (categoryDelta !== 0) return categoryDelta;

  return a.name.localeCompare(b.name);
}

function hardeningIssues(edge) {
  const issues = [];

  if (edge.status === "tentative") {
    issues.push("tentative");
  }

  if (["draft", "needs_review", "blocked"].includes(edge.review_state)) {
    issues.push(`review_state:${edge.review_state}`);
  }

  if (highRiskEdgeTypes.has(edge.type) && edge.sources.length < 2) {
    issues.push("high-risk edge has fewer than 2 sources");
  }

  if (highRiskEdgeTypes.has(edge.type) && edge.relation_qualifier === "unknown") {
    issues.push("unknown relation qualifier");
  }

  if (edge.status === "accepted" && edge.confidence !== "high" && highRiskEdgeTypes.has(edge.type)) {
    issues.push("accepted high-risk edge is not high confidence");
  }

  return issues;
}

function inferMitreCategory(record) {
  const text = `${record.name ?? ""} ${record.description ?? ""} ${(record.x_mitre_platforms ?? []).join(" ")}`.toLowerCase();

  if (
    text.includes("industrial control system") ||
    text.includes("safety instrumented") ||
    text.includes("substation") ||
    text.includes("triconex") ||
    /\bics\b/.test(text)
  ) return "ics_sabotage";
  if (text.includes("wiper") || text.includes("destructive") || text.includes("wipe")) return "wiper";
  if (text.includes("loader") || text.includes("dropper") || text.includes("downloader")) return "loader";
  if (text.includes("banking trojan") || text.includes("banker") || text.includes("banking malware")) return "banker";
  if (text.includes("botnet") || text.includes("ddos")) return "botnet";
  if (text.includes("rootkit") || text.includes("bootkit")) return "rootkit";
  if (text.includes("remote access trojan") || /\brat\b/.test(text)) return "rat";
  if (text.includes("backdoor")) return "backdoor";
  if (text.includes("stealer") || text.includes("credential theft") || text.includes("information stealing")) return "infostealer";
  if (text.includes("ransomware") || text.includes("ransom")) return "ransomware";

  return "other";
}

function mitreAttackReference(record) {
  return (record.external_references ?? []).find((ref) => ref.source_name === "mitre-attack");
}

async function fetchMitreMissing(labels) {
  const missing = [];
  const seenAttackIds = new Set();
  const seenNames = new Set();

  for (const bundle of mitreBundles) {
    const response = await fetch(bundle.url, {
      headers: { "user-agent": "malzu-hunt-data" },
    });

    if (!response.ok) {
      throw new Error(`MITRE ${bundle.name} fetch failed: ${response.status}`);
    }

    const data = await response.json();
    const malwareObjects = data.objects.filter((record) => {
      return record.type === "malware" && !record.revoked && !record.x_mitre_deprecated;
    });

    for (const record of malwareObjects) {
      const names = [
        record.name,
        ...(Array.isArray(record.x_mitre_aliases) ? record.x_mitre_aliases : []),
      ];
      const isKnown = names.some((name) => {
        const matches = labels.get(normalize(name));
        return matches?.size === 1;
      });
      if (isKnown) continue;

      const attackRef = mitreAttackReference(record);
      const dedupeKey = attackRef?.external_id ?? normalize(record.name);
      const nameKey = normalize(record.name);
      if (seenAttackIds.has(dedupeKey) || seenNames.has(nameKey)) continue;
      seenAttackIds.add(dedupeKey);
      seenNames.add(nameKey);

      missing.push({
        name: record.name,
        aliases: (record.x_mitre_aliases ?? []).filter((alias) => alias !== record.name).slice(0, 6),
        category: inferMitreCategory(record),
        domain: bundle.name,
        attack_id: attackRef?.external_id ?? "unknown",
        url: attackRef?.url ?? "",
      });
    }
  }

  return missing.sort((a, b) => {
    const categoryDelta = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (categoryDelta !== 0) return categoryDelta;
    return a.name.localeCompare(b.name);
  });
}

function printSection(title) {
  console.log(`\n## ${title}`);
}

function printCounts(title, counts) {
  printSection(title);
  for (const [key, value] of counts) {
    console.log(`${key}: ${value}`);
  }
}

const [sources, nodes, edges] = await Promise.all([
  readJsonRecords("sources"),
  readJsonRecords("nodes"),
  readJsonRecords("edges"),
]);

const labels = knownLabels(nodes);
const familyCandidates = await readJson(path.join(researchRoot, "family-candidates.json"));
const relationshipLeads = await readJson(path.join(researchRoot, "relationship-leads.json"));
const sourceRegistry = await readJson(path.join(researchRoot, "source-hunting-registry.json"));

const missingCandidates = familyCandidates.items
  .filter((candidate) => !candidateMatches(candidate, labels))
  .sort(candidateSort);

const representedCandidates = familyCandidates.items
  .map((candidate) => ({ candidate, match: candidateMatches(candidate, labels) }))
  .filter((item) => item.match)
  .sort((a, b) => a.candidate.name.localeCompare(b.candidate.name));

const activeRelationshipLeads = relationshipLeads.items.filter((lead) => lead.status !== "promoted");
const promotedRelationshipLeads = relationshipLeads.items.filter((lead) => lead.status === "promoted");

const edgeHardening = edges
  .map(({ file, record }) => ({ file, edge: record, issues: hardeningIssues(record) }))
  .filter((item) => item.issues.length > 0)
  .sort((a, b) => {
    const issueDelta = b.issues.length - a.issues.length;
    if (issueDelta !== 0) return issueDelta;
    return a.edge.id.localeCompare(b.edge.id);
  });

console.log("Malzu Data Hunt Report");
console.log(`Generated: ${new Date().toISOString()}`);
console.log(`Sources: ${sources.length}`);
console.log(`Nodes: ${nodes.length}`);
console.log(`Edges: ${edges.length}`);
console.log(`Research sources registered: ${sourceRegistry.sources.length}`);
console.log(`Candidate families tracked: ${familyCandidates.items.length}`);
console.log(`Relationship leads tracked: ${relationshipLeads.items.length}`);
console.log(`Active relationship leads: ${activeRelationshipLeads.length}`);
console.log(`Promoted relationship leads: ${promotedRelationshipLeads.length}`);

printCounts("Node Coverage By Category", countBy(nodes, ({ record }) => record.category));
printCounts("Edge Coverage By Type", countBy(edges, ({ record }) => record.type));
printCounts("Edge Coverage By Status", countBy(edges, ({ record }) => record.status));
printCounts("Source Coverage By Type", countBy(sources, ({ record }) => record.source_type));

printSection(`Missing Candidate Queue Top ${Math.min(limit, missingCandidates.length)}`);
for (const candidate of missingCandidates.slice(0, limit)) {
  const targets = candidate.relationship_targets?.length
    ? ` targets=${candidate.relationship_targets.join(", ")}`
    : "";
  console.log(`${candidate.priority} ${candidate.category_hint} ${candidate.name}${targets}`);
}

printSection(`Represented Candidates (${representedCandidates.length})`);
for (const { candidate, match } of representedCandidates.slice(0, limit)) {
  console.log(`${candidate.name} -> ${match}`);
}

printSection(`Edge Hardening Queue Top ${Math.min(limit, edgeHardening.length)}`);
for (const item of edgeHardening.slice(0, limit)) {
  console.log(`${item.edge.id} ${item.edge.type} ${item.edge.from} -> ${item.edge.to}`);
  console.log(`  issues: ${item.issues.join("; ")}`);
  console.log(`  file: ${displayPath(item.file)}`);
}

printSection(`Active Relationship Leads Top ${Math.min(limit, activeRelationshipLeads.length)}`);
for (const lead of activeRelationshipLeads.slice(0, limit)) {
  console.log(`${lead.id} ${lead.from_hint} -> ${lead.to_hint} [${lead.candidate_types.join(", ")}]`);
}

printSection(`Promoted Relationship Leads (${promotedRelationshipLeads.length})`);
for (const lead of promotedRelationshipLeads.slice(0, limit)) {
  console.log(`${lead.id} -> ${lead.promoted_edge}`);
}

if (args.has("--mitre-live")) {
  const missingMitre = await fetchMitreMissing(labels);
  printSection(`Live MITRE Missing Malware Top ${Math.min(limit, missingMitre.length)}`);
  console.log(`Live MITRE missing total: ${missingMitre.length}`);

  for (const item of missingMitre.slice(0, limit)) {
    const aliases = item.aliases.length ? ` aliases=${item.aliases.join(", ")}` : "";
    console.log(`${item.category} ${item.domain} ${item.attack_id} ${item.name}${aliases}`);
    if (item.url) console.log(`  ${item.url}`);
  }
}
