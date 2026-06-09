import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDataRoots = ["data/nodes", "data/edges", "data/sources"];
const restrictedTextPatterns = [
  {
    label: "Malpedia material",
    pattern: /malpedia|source:malpedia|caad\.fkie\.fraunhofer\.de/i,
  },
  {
    label: "ransom note or leak-site mirror",
    pattern: /ransom\s*note|data\s*leak\s*site|\bDLS\b|victim\s+(?:dataset|list|dump)|recentvictims/i,
  },
  {
    label: "copied detection rule",
    pattern: /yara[_\s-]?rule|sigma[_\s-]?rule|rule\s+[A-Za-z0-9_]+\s*\{/i,
  },
  {
    label: "copied visual asset",
    pattern: /screenshot|logo|seal image|brand asset/i,
  },
  {
    label: "malware sample handling",
    pattern: /malware\s+sample\s+(?:download|upload)|download\s+malware\s+sample|upload\s+malware\s+sample|payload\s+download/i,
  },
  {
    label: "inline secret",
    pattern: /(?:api[_-]?key|auth[_-]?key|authorization:\s*bearer)\s*[:=]\s*["']?[A-Za-z0-9._-]{16,}/i,
  },
  {
    label: "private key",
    pattern: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE KEY-----/i,
  },
];

const sourcePolicyRequirements = [
  {
    match: (record) => record.source_type === "sample_repository",
    blockedUses: ["malware_sample_downloads", "sample_uploads", "bulk_dataset_mirroring"],
  },
  {
    match: (record) => record.source_type === "infrastructure_feed",
    blockedUses: ["payload_downloads", "bulk_feed_mirroring"],
  },
  {
    match: (record) => ["vendor_blog", "threat_intel_report", "academic_paper"].includes(record.source_type),
    blockedUses: ["copied_prose"],
  },
  {
    match: (record) => record.publisher === "MITRE",
    blockedUses: ["implied MITRE endorsement"],
    noticeRequired: true,
  },
  {
    match: (record) => record.publisher === "MISP Project",
    blockedUses: ["accepted lineage from taxonomy membership alone"],
    noticeRequired: true,
  },
];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

const findings = [];

for (const relativeRoot of publicDataRoots) {
  const files = await listFiles(path.join(root, relativeRoot));

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const relativeFile = path.relative(root, file);
    let record;
    let restrictedScanContent = content;

    if (file.endsWith(".json")) {
      try {
        record = JSON.parse(content);
        restrictedScanContent = JSON.stringify(stripPolicyVocabulary(record));
      } catch {
        // JSON syntax is covered by the structural validator.
      }
    }

    for (const { label, pattern } of restrictedTextPatterns) {
      if (pattern.test(restrictedScanContent)) {
        findings.push(`${relativeFile}: restricted ${label} matched ${pattern}`);
      }
    }

    if (record) {
      if (record?.source_type === "malpedia") {
        findings.push(`${relativeFile}: restricted source_type "malpedia"`);
      }

      if (relativeFile.startsWith("data/sources/")) {
        auditSourcePolicy(relativeFile, record);
      }
    }
  }
}

function stripPolicyVocabulary(value) {
  if (Array.isArray(value)) {
    return value.map(stripPolicyVocabulary);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const omittedPolicyKeys = new Set([
    "license_posture",
    "redistribution_policy",
    "allowed_uses",
    "blocked_uses",
    "notice_required",
  ]);

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !omittedPolicyKeys.has(key))
      .map(([key, nestedValue]) => [key, stripPolicyVocabulary(nestedValue)])
  );
}

function auditSourcePolicy(relativeFile, record) {
  if (record.license_posture === "unknown" || record.redistribution_policy === "unknown") {
    findings.push(`${relativeFile}: source policy cannot be unknown`);
  }

  for (const requirement of sourcePolicyRequirements) {
    if (!requirement.match(record)) {
      continue;
    }

    for (const blockedUse of requirement.blockedUses ?? []) {
      if (!record.blocked_uses?.includes(blockedUse)) {
        findings.push(`${relativeFile}: blocked_uses must include "${blockedUse}"`);
      }
    }

    if (requirement.noticeRequired === true && record.notice_required !== true) {
      findings.push(`${relativeFile}: notice_required must be true`);
    }
  }
}

if (findings.length > 0) {
  console.error("Licensing audit failed.");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("Licensing audit passed: public core contains no restricted source material.");
