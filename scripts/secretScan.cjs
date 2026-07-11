const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const excluded = /(^|\/)(node_modules|dist|\.git|\.firebase|\.firebase-emulator-data|\.phase5-backups)(\/|$)|package-lock\.json$/;
const patterns = [
  ["OpenAI API key", /\bsk-[A-Za-z0-9_-]{20,}\b/g], ["Bearer token", /Bearer\s+[A-Za-z0-9._~+/-]{20,}/gi],
  ["Private key", /-----BEGIN [A-Z ]+PRIVATE KEY-----/g], ["Authorization header", /authorization\s*[:=]\s*["'][^"']{12,}/gi],
  ["OAuth token", /(?:access|refresh|oauth)[_-]?token\s*[:=]\s*["'][^"']{16,}/gi], ["Firebase private key", /private_key\s*[:=]\s*["'][^"']{20,}/gi],
  ["Client secret", /client[_-]?secret\s*[:=]\s*["'][^"']{12,}/gi],
];
const allowLine = /(example|placeholder|redacted|dummy|mock-|dev-only|local-dev-only|test secret|pattern|regex|SECRET_KEY|SECRET_VALUE|API_KEY=\s*$)/i;

function listFiles() {
  const tracked = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  if (tracked.status === 0) return tracked.stdout.trim().split("\n").filter(Boolean);
  return walk(root).map((file) => path.relative(root, file));
}
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => { const full = path.join(dir, entry.name); const rel = path.relative(root, full); if (excluded.test(rel)) return []; return entry.isDirectory() ? walk(full) : [full]; }); }
function mask(value) { return value.length < 10 ? "[MASKED]" : `${value.slice(0, 3)}...${value.slice(-3)}`; }
function scan() {
  const findings = [];
  for (const relative of listFiles().filter((file) => file && !excluded.test(file))) {
    const full = path.join(root, relative);
    let content; try { content = fs.readFileSync(full, "utf8"); } catch { continue; }
    content.split(/\r?\n/).forEach((line, index) => {
      if (allowLine.test(line)) return;
      for (const [type, pattern] of patterns) { pattern.lastIndex = 0; const match = pattern.exec(line); if (match) findings.push({ file: relative, line: index + 1, type, masked: mask(match[0]) }); }
    });
  }
  const result = { ok: findings.length === 0, scannedFiles: listFiles().length, findings };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
if (require.main === module) { const result = scan(); if (!result.ok) process.exitCode = 1; }
module.exports = { scan };
