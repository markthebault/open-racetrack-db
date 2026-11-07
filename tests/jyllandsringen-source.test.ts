import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assemble, type Way } from "../scripts/route";
import { layoutSchema } from "../schemas/data";
const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

test("Jyllandsringen fallback follows exact racing-course source nodes while preserving named variants", async () => {
  const s = "sources/dk-jyllandsringen-102145328", directory = "data/denmark/jyllandsringen-102145328/layouts";
  const proof = await json("sources/research/jyllandsringen-route-correction.json"), recipe = await json(s + "/layouts/main.json");
  const loadWays = async (file: string) => (await json(s + "/" + file)).elements.filter((e: Way & { type: string }) => e.type === "way");
  const oldWays = await loadWays(proof.previousRecipe.snapshotFile ?? "osm.json"), ways = await loadWays(recipe.snapshotFile);
  const old = { type: "LineString", coordinates: assemble(oldWays, proof.previousRecipe.segments, true) };
  const current = { type: "LineString", coordinates: assemble(ways, recipe.segments, true) };
  assert.equal(hash(old), proof.previousTraceSha256);
  assert.notEqual(hash(old), hash(current));
  assert.equal(hash(current), proof.replacement.traceSha256);
  assert.equal(createHash("sha256").update(await readFile(s + "/" + recipe.snapshotFile)).digest("hex"), recipe.snapshotSha256);
  const a = ways.find((w: Way) => w.id === 102145330)!, b = ways.find((w: Way) => w.id === 338068128)!;
  assert.equal(a.nodes[0], b.nodes[0]);
  assert.equal(a.nodes.at(-1), b.nodes.at(-1));
  assert.deepEqual([a.nodes[0], a.nodes.at(-1)], proof.replacement.sharedEndpointNodeIds);
  const main = layoutSchema.parse(await json(directory + "/main.geojson"));
  assert.deepEqual(main.features.find((f) => f.properties.role === "trace")!.geometry, current);
  assert.equal(main.metadata.timingStatus, "missing");
  assert.equal(main.metadata.timing, undefined);
  assert.equal(main.metadata.borderInference, undefined);
  assert.equal(main.metadata.model3d, undefined);
  assert.equal(main.features.some((f) => ["inner", "outer"].includes(f.properties.role)), false);
  assert.ok(proof.excludedWayIds.includes(102146041));
  for (const id of proof.excludedWayIds) assert.equal(recipe.segments.some((p: { wayId: number }) => p.wayId === id), false);
  for (const saved of proof.preservedLayouts) {
    const d = layoutSchema.parse(await json(directory + "/" + saved.layoutId + ".geojson"));
    assert.equal(hash(d.features.find((f) => f.properties.role === "trace")!.geometry), saved.traceSha256);
    assert.equal(hash(d.features.filter((f) => ["inner", "outer"].includes(f.properties.role))), saved.borderFeaturesSha256);
    assert.deepEqual(d.metadata.timing, saved.timing ?? undefined);
    assert.equal(d.metadata.timingStatus, saved.timingStatus);
  }
});
