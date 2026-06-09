import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataRoot = path.join(root, "data");

const nodeTypes = new Set([
  "malware_family",
  "variant",
  "alias",
  "actor",
  "seller",
  "operator",
  "loader",
  "campaign",
  "infrastructure",
  "source",
  "report",
  "tooling",
]);

const edgeTypes = new Set([
  "derived_from",
  "forked_from",
  "variant_of",
  "inspired_by",
  "shares_code_with",
  "shares_behavior_with",
  "shares_creator_with",
  "shares_operator_with",
  "shares_seller_with",
  "uses_loader",
  "loaded_by",
  "distributed_with",
  "uses_infrastructure",
  "shares_infrastructure_with",
  "targets_same_ecosystem_as",
  "alias_of",
  "reported_as_related_to",
  "disputed_relationship",
]);

const evidenceTypes = new Set([
  "primary_research",
  "vendor_report",
  "malware_repository",
  "code_similarity",
  "behavior_similarity",
  "infrastructure_overlap",
  "operator_claim",
  "marketplace_claim",
  "community_report",
  "uncorroborated",
]);

const sourceTypes = new Set([
  "misp_galaxy",
  "vendor_blog",
  "academic_paper",
  "repository",
  "sandbox_report",
  "news_article",
  "community_post",
  "threat_intel_report",
  "government_advisory",
  "sample_repository",
  "marketplace_claim",
  "cti_knowledge_base",
  "standard",
  "infrastructure_feed",
]);

const licensePostures = new Set([
  "attribution_required",
  "permissive_cc0_or_bsd_2_clause",
  "standard_citation_notice",
  "terms_limited_metadata_only",
  "us_government_public_domain_low_friction",
  "open_government_attribution_required",
  "reuse_with_source_acknowledgement",
  "mixed_academic_citation_only",
  "copyrighted_citation_only",
]);

const redistributionPolicies = new Set([
  "allowed_with_mitre_notice_no_endorsement",
  "allowed_with_misp_license_notice",
  "cite_standard_do_not_represent_standard_as_evidence",
  "metadata_only_no_samples_no_bulk_mirror",
  "infrastructure_metadata_only_no_bulk_mirror",
  "cite_and_summarize_no_marks_no_endorsement",
  "cite_and_summarize_with_attribution",
  "cite_and_summarize_with_source_acknowledgement",
  "metadata_and_short_curator_summary_only",
  "cite_link_and_original_curator_summary_only",
]);

const confidenceValues = new Set(["low", "medium", "high"]);
const edgeStatuses = new Set(["accepted", "tentative", "disputed", "deprecated"]);
const nodeStatuses = new Set(["active", "historical", "unknown", "tentative", "disputed", "deprecated"]);

const nodeIdPattern = /^[a-z][a-z0-9_]*:[a-z0-9][a-z0-9_.-]*$/;
const sourceIdPattern = /^source:[a-z0-9][a-z0-9_.-]*$/;
const edgeIdPattern = /^edge_[a-z0-9][a-z0-9_]*$/;
const dayPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const errors = [];

function fail(file, message) {
  errors.push(`${path.relative(root, file)}: ${message}`);
}

async function readJsonRecords(dirName) {
  const dir = path.join(dataRoot, dirName);
  const files = await listJsonFiles(dir);
  const records = [];

  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      records.push({ file, record: parsed });
    } catch (error) {
      fail(file, `invalid JSON: ${error.message}`);
    }
  }

  return records;
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

function requireString(file, record, key) {
  if (typeof record[key] !== "string" || record[key].trim() === "") {
    fail(file, `missing string field "${key}"`);
    return undefined;
  }

  return record[key];
}

function requireArray(file, record, key) {
  if (!Array.isArray(record[key])) {
    fail(file, `missing array field "${key}"`);
    return [];
  }

  return record[key];
}

function requireStringArray(file, record, key) {
  const values = requireArray(file, record, key);

  if (values.length === 0) {
    fail(file, `${key} must include at least one value`);
  }

  values.forEach((value, index) => {
    if (typeof value !== "string" || value.trim() === "") {
      fail(file, `${key}[${index}] must be a non-empty string`);
    }
  });

  return values;
}

function validateSources(records) {
  const sourceIds = new Map();

  for (const { file, record } of records) {
    const id = requireString(file, record, "id");
    requireString(file, record, "title");
    requireString(file, record, "publisher");
    requireString(file, record, "url");

    if (id && !sourceIdPattern.test(id)) {
      fail(file, `source id must match ${sourceIdPattern}`);
    }

    if (id && sourceIds.has(id)) {
      fail(file, `duplicate source id also used in ${path.relative(root, sourceIds.get(id))}`);
    }

    if (id) {
      sourceIds.set(id, file);
    }

    if (!sourceTypes.has(record.source_type)) {
      fail(file, `invalid source_type "${record.source_type}"`);
    }

    if (!licensePostures.has(record.license_posture)) {
      fail(file, `invalid license_posture "${record.license_posture}"`);
    }

    if (!redistributionPolicies.has(record.redistribution_policy)) {
      fail(file, `invalid redistribution_policy "${record.redistribution_policy}"`);
    }

    requireStringArray(file, record, "allowed_uses");
    requireStringArray(file, record, "blocked_uses");

    if (typeof record.notice_required !== "boolean") {
      fail(file, "notice_required must be a boolean");
    }

    if (!dayPattern.test(record.retrieved_at ?? "")) {
      fail(file, "retrieved_at must be YYYY-MM-DD");
    }
  }

  return sourceIds;
}

function validateNodeSourceRefs(file, refs, sourceIds) {
  refs.forEach((ref, index) => {
    if (!ref || typeof ref !== "object") {
      fail(file, `sources[${index}] must be an object`);
      return;
    }

    if (!sourceIdPattern.test(ref.source ?? "")) {
      fail(file, `sources[${index}].source must be a source id`);
      return;
    }

    if (!sourceIds.has(ref.source)) {
      fail(file, `unknown source reference "${ref.source}"`);
    }
  });
}

function validateNodes(records, sourceIds) {
  const nodeIds = new Map();

  for (const { file, record } of records) {
    const id = requireString(file, record, "id");
    requireString(file, record, "name");

    if (id && !nodeIdPattern.test(id)) {
      fail(file, `node id must match ${nodeIdPattern}`);
    }

    if (id && nodeIds.has(id)) {
      fail(file, `duplicate node id also used in ${path.relative(root, nodeIds.get(id))}`);
    }

    if (id) {
      nodeIds.set(id, file);
    }

    if (!nodeTypes.has(record.type)) {
      fail(file, `invalid node type "${record.type}"`);
    }

    if (!nodeStatuses.has(record.status)) {
      fail(file, `invalid node status "${record.status}"`);
    }

    const refs = requireArray(file, record, "sources");
    if (refs.length === 0) {
      fail(file, "nodes must cite at least one source");
    }

    validateNodeSourceRefs(file, refs, sourceIds);
  }

  return nodeIds;
}

function validateEdges(records, nodeIds, sourceIds) {
  const edgeIds = new Map();

  for (const { file, record } of records) {
    const id = requireString(file, record, "id");
    const from = requireString(file, record, "from");
    const to = requireString(file, record, "to");

    if (id && !edgeIdPattern.test(id)) {
      fail(file, `edge id must match ${edgeIdPattern}`);
    }

    if (id && edgeIds.has(id)) {
      fail(file, `duplicate edge id also used in ${path.relative(root, edgeIds.get(id))}`);
    }

    if (id) {
      edgeIds.set(id, file);
    }

    if (from && !nodeIds.has(from)) {
      fail(file, `unknown from node "${from}"`);
    }

    if (to && !nodeIds.has(to)) {
      fail(file, `unknown to node "${to}"`);
    }

    if (!edgeTypes.has(record.type)) {
      fail(file, `invalid edge type "${record.type}"`);
    }

    if (!["directed", "undirected"].includes(record.direction)) {
      fail(file, `invalid direction "${record.direction}"`);
    }

    if (!confidenceValues.has(record.confidence)) {
      fail(file, `invalid confidence "${record.confidence}"`);
    }

    if (!evidenceTypes.has(record.evidence_type)) {
      fail(file, `invalid evidence_type "${record.evidence_type}"`);
    }

    if (!edgeStatuses.has(record.status)) {
      fail(file, `invalid edge status "${record.status}"`);
    }

    if (record.status === "accepted" && record.evidence_type === "uncorroborated") {
      fail(file, "accepted edges cannot use uncorroborated evidence");
    }

    if (record.status === "accepted" && record.review_state !== "reviewed") {
      fail(file, "accepted edges must set review_state to reviewed");
    }

    if (record.status === "accepted" && typeof record.confidence_reason !== "string") {
      fail(file, "accepted edges must include confidence_reason");
    }

    if (!dayPattern.test(record.created_at ?? "")) {
      fail(file, "created_at must be YYYY-MM-DD");
    }

    if (!dayPattern.test(record.updated_at ?? "")) {
      fail(file, "updated_at must be YYYY-MM-DD");
    }

    const refs = requireArray(file, record, "sources");
    if (refs.length === 0) {
      fail(file, "edges must cite at least one source");
    }

    refs.forEach((ref, index) => {
      if (!ref || typeof ref !== "object") {
        fail(file, `sources[${index}] must be an object`);
        return;
      }

      if (!sourceIdPattern.test(ref.source ?? "")) {
        fail(file, `sources[${index}].source must be a source id`);
      } else if (!sourceIds.has(ref.source)) {
        fail(file, `unknown source reference "${ref.source}"`);
      }

      if (typeof ref.claim !== "string" || ref.claim.trim() === "") {
        fail(file, `sources[${index}].claim must explain the evidence`);
      }
    });
  }

  return edgeIds;
}

const sourceRecords = await readJsonRecords("sources");
const nodeRecords = await readJsonRecords("nodes");
const edgeRecords = await readJsonRecords("edges");

const sourceIds = validateSources(sourceRecords);
const nodeIds = validateNodes(nodeRecords, sourceIds);
validateEdges(edgeRecords, nodeIds, sourceIds);

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${sourceRecords.length} source(s), ${nodeRecords.length} node(s), ${edgeRecords.length} edge(s).`);
