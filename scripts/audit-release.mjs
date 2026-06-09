import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ignoredDirs = new Set([".git", "dist", "internal", "node_modules"]);
const ignoredRelativePrefixes = ["data/research/restricted/"];
const maxFileBytes = 2 * 1024 * 1024;

const riskyExtensions = new Set([
  ".7z",
  ".bin",
  ".dll",
  ".dylib",
  ".elf",
  ".exe",
  ".gz",
  ".pcap",
  ".pcapng",
  ".rar",
  ".scr",
  ".sig",
  ".so",
  ".tgz",
  ".yar",
  ".yara",
  ".zip",
]);

const secretPatterns = [
  {
    label: "private key",
    pattern: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE KEY-----/i,
  },
  {
    label: "bearer token",
    pattern: /authorization:\s*bearer\s+[A-Za-z0-9._-]{16,}/i,
  },
  {
    label: "assigned secret",
    pattern: /\b(?:api[_-]?key|auth[_-]?key|access[_-]?token|secret|password)\b\s*[:=]\s*["'][A-Za-z0-9._~+/-]{16,}["']/i,
  },
];

const findings = [];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath).replaceAll(path.sep, "/");

    if (ignoredRelativePrefixes.some((prefix) => relativePath.startsWith(prefix))) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

for (const file of await listFiles(root)) {
  const relativeFile = path.relative(root, file).replaceAll(path.sep, "/");
  const extension = path.extname(file).toLowerCase();
  const stats = await stat(file);

  if (riskyExtensions.has(extension)) {
    findings.push(`${relativeFile}: risky release file extension "${extension}"`);
  }

  if (stats.size > maxFileBytes) {
    findings.push(`${relativeFile}: file is larger than ${maxFileBytes} bytes`);
  }

  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    findings.push(`${relativeFile}: non-text file in publishable tree`);
    continue;
  }

  for (const { label, pattern } of secretPatterns) {
    if (pattern.test(content)) {
      findings.push(`${relativeFile}: possible ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Release audit failed.");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("Release audit passed: no risky files or obvious secrets in publishable tree.");
