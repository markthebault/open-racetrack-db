import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutSchema, geometryPaths, type Layout } from "../schemas/data";
import { bounds } from "../src/geo";
import { borderPairHash } from "../scripts/refine-image-borders";
import { layoutContentHash, reviewedNetworkBorders } from "../scripts/reviewed-network-borders";

function fixture() {
  const source = layoutSchema.parse(JSON.parse(readFileSync("data/united-states/pittsburgh-international-race-complex-225264359/layouts/pittsburgh-int-race-complex-south.geojson", "utf8")));
  source.features = source.features.filter(f => f.properties.role !== "ideal");
  const old = structuredClone(source);
  delete old.metadata.borderInference;
  const roles = ["trace", "inner", "outer"];
  old.features = [...roles.flatMap(role => old.features.filter(f => f.properties.role === role)), ...old.features.filter(f => !roles.includes(f.properties.role))];
  const outer = old.features.find(f => f.properties.role === "outer")!;
  if (outer.geometry.type === "LineString") outer.geometry.coordinates[0][0] += 0.000001;
  old.bbox = bounds(old.features.flatMap(f => geometryPaths(f.geometry).flat()));
  const pair = Object.fromEntries(["inner", "outer"].map(role => [role, geometryPaths(old.features.find(f => f.properties.role === role)!.geometry)[0]])) as Parameters<typeof borderPairHash>[0];
  source.metadata.borderInference!.supersedes!.borderSha256 = borderPairHash(pair);
  const { terrain, ...recipe } = old.metadata.model3d!;
  const metadata = Object.fromEntries(Object.entries(old.metadata).filter(([key]) => key !== "model3d")) as Omit<Layout["metadata"], "model3d">;
  const borderProperties = ["inner", "outer"].map(role => old.features.find(f => f.properties.role === role)!.properties);
  const network = structuredClone(old);
  network.metadata = { ...network.metadata, layoutId: "combo", geometryKind: "network", closed: false, borderComposition: [{ tracePathIndex: 0, sourceLayoutId: old.metadata.layoutId, sourceSha256: layoutContentHash(old), name: "Fixture", traceSourceIds: old.features[0].properties.sourceIds, metadata, borderProperties, timingFeatures: old.features.filter(f => !roles.includes(f.properties.role)), recipe }] } as Layout["metadata"];
  network.metadata.model3d!.terrain = terrain;
  for (const f of network.features) if (roles.includes(f.properties.role)) f.geometry = { type: "MultiLineString", coordinates: geometryPaths(f.geometry) };
  return { source, old, network, hash: layoutContentHash(network) };
}

test("reviewed network propagation accepts an exact pinned component correction without mutating inputs", () => {
  const f = fixture(), before = structuredClone(f);
  const result = reviewedNetworkBorders(f.network, f.hash, [f.source]);
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].oldBorderSha256, f.source.metadata.borderInference!.supersedes!.borderSha256);
  assert.deepEqual(f, before);
});

test("reviewed network propagation refuses changed network bytes and embedded old components", () => {
  const f = fixture();
  assert.throws(() => reviewedNetworkBorders(f.network, "0".repeat(64), [f.source]), /hash does not match/);
  f.network.metadata.borderComposition![0].sourceSha256 = "0".repeat(64);
  assert.throws(() => reviewedNetworkBorders(f.network, layoutContentHash(f.network), [f.source]), /embedded source hash changed/);
});

test("reviewed network propagation refuses unmeasured or differently pinned source corrections", () => {
  const f = fixture();
  f.source.metadata.borderInference!.supersedes!.borderSha256 = "0".repeat(64);
  assert.throws(() => reviewedNetworkBorders(f.network, f.hash, [f.source]), /exact old borders/);
  const g = fixture();
  g.source.metadata.borderInference!.measurement!.resultSha256 = "0".repeat(64);
  assert.throws(() => reviewedNetworkBorders(g.network, g.hash, [g.source]), /exact old borders/);
  delete g.source.metadata.borderInference;
  assert.throws(() => reviewedNetworkBorders(g.network, g.hash, [g.source]));
});

test("reviewed network propagation preserves source features, metadata, terrain and component identity", () => {
  for (const mutate of [
    (d: Layout) => { d.features[0].properties.sourceIds = ["changed"]; },
    (d: Layout) => { d.metadata.notes.push("changed identity"); },
    (d: Layout) => { d.metadata.model3d!.terrain.heights[0] = (d.metadata.model3d!.terrain.heights[0] ?? 0) + 1; },
    (d: Layout) => { d.metadata.layoutId = "other"; },
  ]) {
    const f = fixture(); mutate(f.source);
    assert.throws(() => reviewedNetworkBorders(f.network, f.hash, [f.source]), /preserve|identity/);
  }
  const f = fixture();
  assert.throws(() => reviewedNetworkBorders(f.network, f.hash, []), /every existing/);
  assert.throws(() => reviewedNetworkBorders(f.network, f.hash, [f.old]), /No reviewed/);
});
