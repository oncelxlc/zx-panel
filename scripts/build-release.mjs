import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";

/** root 将所有构建输出约束在当前仓库，不使用用户传入的删除路径。 */
const root = resolve(import.meta.dirname, "..");
/** run 使用参数数组启动固定工具，失败立即中断发布。 */
function run(program, args, env = {}) {
  const result = spawnSync(program, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} failed (${result.status})`);
}
/** assertWithin 确保递归清理只能针对此仓库的固定输出子目录。 */
function assertWithin(directory) { const rel = relative(root, directory); if (!rel || rel.startsWith(`..${sep}`) || rel === "..") throw new Error("Output escaped workspace"); }
/** inspect 确认生产产物没有 Mock worker、数据模块或已知秘密配置文件。 */
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected release symlink: ${entry.name}`);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (/mockserviceworker|\.env$|\.key$|fixtures|handlers/i.test(entry.name)) throw new Error(`Forbidden release asset: ${entry.name}`);
    if (entry.name.endsWith(".js")) {
      const body = await readFile(file, "utf8");
      if (body.includes("Mock Service Worker") || body.includes("demo-boot-") || body.includes("msw:worker")) throw new Error("Mock code found in API build");
    }
  }
}
run(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "build"], { VITE_DATA_MODE: "api" });
const output = resolve(root, "internal/web/ui/dist");
assertWithin(output);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "dist"), output, { recursive: true });
await writeFile(resolve(output, "release.json"), JSON.stringify({ dataMode: "api", version: "1.1.0" }) + "\n");
await inspect(output);
console.log("API frontend verified and embedded assets prepared.");
