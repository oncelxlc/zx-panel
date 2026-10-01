import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";

/** scan 只扫描 Git 将要交付的文本，不读取被忽略的真实 .env、密钥或数据目录。 */
const files = spawnSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8", shell: false },
);
if (files.status !== 0) throw new Error("Cannot enumerate deliverable files");
/** signatures 覆盖常见凭据格式；结果只报告位置，绝不打印匹配的秘密。 */
const signatures = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
];
const findings = [];
let checked = 0;
for (const file of new Set(files.stdout.split("\0").filter(Boolean))) {
  if (
    file.startsWith(".agents/") ||
    file.startsWith(".codex/") ||
    file === "scripts/security/secret-scan.mjs"
  )
    continue;
  if (
    !/\.(?:go|tsx?|m?[jc]s|py|sh|json|ya?ml|md|sql|conf|service|html|css|scss|example)$/.test(
      file,
    ) &&
    !file.endsWith(".env.mock")
  )
    continue;
  // Git 仍可能列出本轮目录整理中已移动的旧路径。
  const info = await stat(file).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info || info.size > 2 * 1024 * 1024) continue;
  checked++;
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (signatures.some((pattern) => pattern.test(line)))
      findings.push(`${file}:${index + 1}`);
  });
}
if (findings.length) {
  console.error("Potential credentials at:\n" + findings.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `No matching secret signatures in ${checked} deliverable text files. Ignored local secrets were not read.`,
  );
