import { execFileSync } from "node:child_process";
import { chmod, cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const buildDir = path.join(root, ".build");
const distDir = path.join(root, "dist");
const releaseVersion = (await readFile(path.join(root, "VERSION"), "utf8")).trim();
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== releaseVersion) throw new Error(`VERSION (${releaseVersion}) and package.json (${packageJson.version}) differ`);

await rm(buildDir, { recursive: true, force: true });
await rm(distDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
for (const script of ["tools/build-sr2-api.mjs", "tools/build-ui.mjs", "tools/build-flows.mjs"]) execFileSync(process.execPath, [script], { stdio: "inherit" });

await mkdir(path.join(distDir, "ui"), { recursive: true });
await cp(path.join(buildDir, "fap-pci-flow.json"), path.join(distDir, "fap-pci-flow.json"));
await cp(path.join(root, "automation", "stage1", "ground-zero.sh"), path.join(distDir, "ground-zero.sh"));
await chmod(path.join(distDir, "ground-zero.sh"), 0o755);
await cp(path.join(buildDir, "ui"), path.join(distDir, "ui"), { recursive: true });
await rm(buildDir, { recursive: true, force: true });

const releaseEntries = (await readdir(distDir)).sort();
if (JSON.stringify(releaseEntries) !== JSON.stringify(["fap-pci-flow.json", "ground-zero.sh", "ui"])) {
  throw new Error(`unexpected dist surface: ${releaseEntries.join(", ")}`);
}
console.log(`[release] ${releaseVersion}: dist/fap-pci-flow.json + dist/ground-zero.sh + dist/ui/`);
