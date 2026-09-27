import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

test("flow installer preserves unrelated ORCE tabs and replaces prior PCI tabs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fap-pci-flows-"));
  const existing = [
    { id: "other-tab", type: "tab", label: "OCM Deployer" },
    { id: "other-node", type: "inject", z: "other-tab", name: "keep" },
    { id: "old-pci", type: "tab", label: "M2_PCI-Old" },
    { id: "old-node", type: "inject", z: "old-pci", name: "remove" },
  ];
  const existingPath = path.join(dir, "existing.json");
  const outputPath = path.join(dir, "merged.json");
  await writeFile(existingPath, JSON.stringify(existing));
  await run(process.execPath, ["automation/stage1/merge-flows.mjs", "--existing", existingPath, "--incoming", "dist/fap-pci-flow.json", "--output", outputPath]);
  const merged = JSON.parse(await readFile(outputPath, "utf8"));
  assert.ok(merged.some((node) => node.id === "other-node"));
  assert.equal(merged.some((node) => node.id === "old-node"), false);
  assert.ok(merged.some((node) => node.type === "uibuilder"));
});
