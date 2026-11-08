import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Layout } from "../schemas/data";
import { inspectSharedSourceNodes, readSharedSourceNodes, verifySharedSourceNode } from "../scripts/shared-source-junctions";

function fixture() {
  const root = "sources/gb-dunsfold-top-gear-06a07bad/",
    layout = JSON.parse(readFileSync("data/united-kingdom/gb-dunsfold-top-gear-06a07bad/layouts/dunsfold-top-gear.geojson", "utf8")) as Layout,
    recipe = JSON.parse(readFileSync(root + "layouts/dunsfold-top-gear.json", "utf8")),
    bytes = readFileSync(root + recipe.snapshotFile);
  return { layout, recipe, bytes };
}
function altered(f: ReturnType<typeof fixture>, mutate: (raw: ReturnType<typeof JSON.parse>) => void) {
  const raw = JSON.parse(f.bytes.toString());
  mutate(raw);
  const bytes = Buffer.from(JSON.stringify(raw));
  return { ...f, recipe: { ...f.recipe, snapshotSha256: createHash("sha256").update(bytes).digest("hex") }, bytes };
}

test("Dunsfold has two ordered visits to one selected source node, excluding the ordinary closure", async () => {
  const { layout, recipe, bytes } = fixture(), before = structuredClone(layout),
    nodes = await readSharedSourceNodes(layout);
  assert.equal(nodes.length, 1);
  const { source, hasGradeSeparationTags } = nodes[0];
  assert.equal(source.nodeId, 820790597);
  assert.deepEqual(source.traceIndices, [0, 205]);
  assert.deepEqual(source.coordinate, [-0.5437808, 51.1169939]);
  assert.deepEqual(source.ways, [{ wayId: 68045735, wayVersion: 7 }, { wayId: 68045744, wayVersion: 6 }]);
  assert.equal(hasGradeSeparationTags, false);
  assert.deepEqual(verifySharedSourceNode(layout, recipe, bytes, source), source);
  assert.deepEqual(layout, before);
});

test("source claims reject altered snapshots, versions, driving order and incorrect visits", () => {
  const { layout, recipe, bytes } = fixture(), claim = inspectSharedSourceNodes(layout, recipe, bytes)[0].source;
  assert.throws(() => verifySharedSourceNode(layout, { ...recipe, snapshotSha256: "0".repeat(64) }, bytes, claim), /hash mismatch/);
  const version = structuredClone(recipe);
  version.segments[0].wayVersion++;
  assert.throws(() => verifySharedSourceNode(layout, version, bytes, claim), /version mismatch/);
  const moved = structuredClone(layout), trace = moved.features[0].geometry;
  if (trace.type !== "LineString") throw new Error("Expected one source trace");
  [trace.coordinates[20], trace.coordinates[21]] = [trace.coordinates[21], trace.coordinates[20]];
  assert.throws(() => verifySharedSourceNode(moved, recipe, bytes, claim), /complete saved driving order/);
  assert.throws(() => verifySharedSourceNode(layout, recipe, bytes, { ...claim, traceIndices: [0, 204] }), /one exact repeated source node/);
});

test("coincident coordinates with distinct source node IDs do not establish a shared junction", () => {
  const f = fixture(), claim = inspectSharedSourceNodes(f.layout, f.recipe, f.bytes)[0].source,
    changed = altered(f, (raw) => {
      const way = raw.elements.find((w: { id: number }) => w.id === 68045744);
      way.nodes[17] = 999999999;
    });
  assert.deepEqual(inspectSharedSourceNodes(changed.layout, changed.recipe, changed.bytes), []);
  assert.throws(() => verifySharedSourceNode(changed.layout, changed.recipe, changed.bytes, claim), /one exact repeated source node/);
});

test("bridge, tunnel and nonzero layer tags prevent a shared-ground source claim", () => {
  for (const tags of [{ bridge: "yes" }, { tunnel: "yes" }, { layer: "1" }]) {
    const f = altered(fixture(), (raw) => Object.assign(raw.elements.find((w: { id: number }) => w.id === 68045744).tags, tags)),
      candidate = inspectSharedSourceNodes(f.layout, f.recipe, f.bytes)[0];
    assert.equal(candidate.hasGradeSeparationTags, true);
    assert.throws(() => verifySharedSourceNode(f.layout, f.recipe, f.bytes, candidate.source), /grade-separated source ways/);
  }
});

test("base OSM recipes use their registered manifest snapshot without a layout-specific filename", async () => {
  const id = "ar-autodromo-asociacion-volantes-mar-y-valle-118131873",
    layout = JSON.parse(readFileSync(`data/argentina/autodromo-asociacion-volantes-mar-y-valle-118131873/layouts/main.geojson`, "utf8")) as Layout,
    recipe = JSON.parse(readFileSync(`sources/${id}/layouts/main.json`, "utf8")),
    bytes = readFileSync(`sources/${id}/osm.json`);
  assert.equal(recipe.snapshotFile, undefined);
  assert.deepEqual(await readSharedSourceNodes(layout), inspectSharedSourceNodes(layout, recipe, bytes));
});

test("an exact source recipe still needs its hash and identity registered by the track manifest", async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), "shared-source-")),
    dir = join(root, f.layout.metadata.trackId),
    manifest = JSON.parse(readFileSync(`sources/${f.layout.metadata.trackId}/import.json`, "utf8"));
  try {
    await mkdir(join(dir, "layouts"), { recursive: true });
    await writeFile(join(dir, "layouts", "dunsfold-top-gear.json"), JSON.stringify(f.recipe));
    await writeFile(join(dir, f.recipe.snapshotFile), f.bytes);
    await writeFile(join(dir, "import.json"), JSON.stringify(manifest));
    assert.equal((await readSharedSourceNodes(f.layout, root)).length, 1);
    manifest.snapshots = manifest.snapshots.filter((s: { file: string }) => s.file !== f.recipe.snapshotFile);
    await writeFile(join(dir, "import.json"), JSON.stringify(manifest));
    await assert.rejects(readSharedSourceNodes(f.layout, root), /not registered/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
