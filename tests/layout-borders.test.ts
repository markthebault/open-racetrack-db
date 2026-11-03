import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existingBorders } from "../scripts/layout-borders";

test("new layout generation permits an absent output while validation still rejects it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "layout-borders-"));
  try {
    const file = join(dir, "new-layout.geojson");
    assert.deepEqual(await existingBorders(file, true), []);
    await assert.rejects(existingBorders(file), { code: "ENOENT" });
    await writeFile(file, '{"features": "invalid"}');
    await assert.rejects(existingBorders(file, true));
    await writeFile(file, 'invalid JSON');
    await assert.rejects(existingBorders(file, true));
  } finally { await rm(dir, { recursive: true }); }
});
