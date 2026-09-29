import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

/** run 通过固定参数数组构建，不启动 shell 或修改 Git 历史。 */
function run(command, args, env = {}) { const result = spawnSync(command, args, { cwd: resolve(import.meta.dirname, ".."), env: { ...process.env, ...env }, stdio: "inherit", shell: false }); if (result.error) throw result.error; if (result.status !== 0) throw new Error(`${command} failed`); }
run(process.execPath, [resolve(import.meta.dirname, "build-release.mjs")]);
const git = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8", shell: false });
const status = spawnSync("git",["status","--porcelain"],{encoding:"utf8",shell:false});
const commit = (git.status === 0 && /^[a-f0-9]{7,40}$/.test(git.stdout.trim()) ? git.stdout.trim() : "unknown")+(status.stdout?.trim()?"-dirty":"");
const time = new Date().toISOString();
const flags = `-s -w -X zx-panel/internal/server.Version=1.1.0 -X zx-panel/internal/server.Commit=${commit} -X zx-panel/internal/server.BuildTime=${time}`;
const checksums = [];
for (const arch of ["amd64", "arm64"]) {
  const directory = resolve("release", `linux-${arch}`);
  await mkdir(directory, { recursive: true });
  for (const [name, source] of [["zx-panel", "./cmd/server"], ["zx-panel-helper", "./cmd/helper"]]) {
    const output = resolve(directory, name);
    run("go", ["build", "-mod=readonly", "-trimpath", "-ldflags", flags, "-o", output, source], { GOOS: "linux", GOARCH: arch, CGO_ENABLED: "0" });
    checksums.push(`${createHash("sha256").update(await readFile(output)).digest("hex")}  linux-${arch}/${name}`);
  }
}
await writeFile(resolve("release/SHA256SUMS"), checksums.join("\n") + "\n");
await writeFile(resolve("release/build-info.json"),JSON.stringify({version:"1.1.0",commit,builtAt:time,targets:["linux-amd64","linux-arm64"],dataMode:"api",linuxAcceptance:"pending"},null,2)+"\n");
console.log("Linux amd64/arm64 server and helper binaries built. Runtime acceptance is still required.");
