import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateLayout, type Layout, type Track } from "../schemas/data";
import { networkRouteLayout } from "../src/network-routes";
import { buildRoad, simulateLap } from "../src/lap-simulation";
import { borderFootprint } from "../src/border-surface";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
function networks() {
  const result: { track: Track; network: Layout; directory: string }[] = [];
  for (const e of read("data/index.json").tracks) {
    const track: Track = read(`data/${e.file}`),
      directory = `data/${dirname(e.file)}`;
    for (const l of track.layouts)
      if (l.file) {
        const network: Layout = read(`${directory}/${l.file}`);
        if (network.metadata.borderComposition)
          result.push({ track, network, directory });
      }
  }
  return result;
}
test("every composed network recreates each exact source route from a standalone GeoJSON with one shared terrain raster", () => {
  const rows = networks();
  assert.ok(rows.length > 0);
  for (const { track, network, directory } of rows) {
    validateLayout(network, track, network.metadata.layoutId);
    const recipe = read(
      `sources/${track.id}/layouts/${network.metadata.layoutId}.json`,
    );
    if (recipe.components)
      assert.deepEqual(
        network.metadata.borderComposition!.map((c) => c.sourceLayoutId),
        recipe.components.map((c: { layoutId: string }) => c.layoutId),
      );
    assert.ok(borderFootprint(network).triangles.length > 0);
    const standalone = JSON.parse(JSON.stringify(network));
    for (const [i, c] of network.metadata.borderComposition!.entries()) {
      assert.ok(!("terrain" in c.recipe));
      const route = networkRouteLayout(standalone, i),
        source: Layout = read(
          `${directory}/layouts/${c.sourceLayoutId}.geojson`,
        );
      assert.deepEqual(route.features.filter(f=>f.properties.role!=="ideal"), source.features.filter(f=>f.properties.role!=="ideal"), c.name);
      assert.deepEqual(route.metadata, source.metadata, c.name);
      if (c.recipe.kind === "surface") {
        assert.equal(route.metadata.model3d?.kind, "surface");
        assert.throws(() => buildRoad(route), /no playable/);
        continue;
      }
      const road = buildRoad(route),
        lap = simulateLap(road);
      assert.ok(lap.duration > 0 && Number.isFinite(lap.duration));
      assert.ok(lap.speed.every(Number.isFinite));
      if (!route.metadata.closed) {
        assert.notDeepEqual(road.points[0], road.points.at(-1));
        assert.equal(road.points.at(-1)!.ds, 0);
      }
    }
  }
});
test("incomplete compositions, swapped path identities and inconsistent component rights are rejected", () => {
  const { track, network } = networks()[0];
  const missing = structuredClone(network);
  missing.metadata.borderComposition!.pop();
  assert.throws(() =>
    validateLayout(missing, track, missing.metadata.layoutId),
  );
  const wrong = structuredClone(network);
  wrong.metadata.borderComposition![0].tracePathIndex = 1;
  assert.throws(
    () => validateLayout(wrong, track, wrong.metadata.layoutId),
    /ordering/,
  );
  const rights = structuredClone(network);
  rights.metadata.borderComposition![0].borderProperties[0] = {
    role: "inner",
    sourceIds: [],
    license: "LicenseRef-Component-Borders",
  };
  assert.throws(() => validateLayout(rights, track, rights.metadata.layoutId));
});

test("first-time network composition writes canonical GeoJSON without a regeneration step", async () => {
  const { mkdtemp, mkdir, cp, writeFile, readFile, rm } =
      await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { fileURLToPath } = await import("node:url"),
    { spawnSync } = await import("node:child_process"),
    { serializeLayout } = await import("../scripts/layout-borders"),
    { bounds } = await import("../src/geo"),
    { geometryPaths } = await import("../schemas/data");
  const id = "gb-snetterton-motor-racing-circuit-145755937",
    item = read("data/index.json").tracks.find(
      (t: { id: string }) => t.id === id,
    ),
    track: Track = read(`data/${item.file}`),
    folder = dirname(item.file),
    root = await mkdtemp(join(tmpdir(), "compose-track-")),
    networkFile = `data/${folder}/layouts/snetterton-combo.geojson`;
  try {
    await mkdir(join(root, "data", folder, "layouts"), { recursive: true });
    await mkdir(join(root, "data/elevation"), { recursive: true });
    await mkdir(join(root, "sources", id, "layouts"), { recursive: true });
    await cp(`data/${item.file}`, join(root, "data", item.file));
    for (const l of track.layouts)
      if (l.file)
        await cp(
          `data/${folder}/${l.file}`,
          join(root, "data", folder, l.file),
        );
    await writeFile(
      join(root, "data/elevation", `${id}.json`),
      JSON.stringify(read(networkFile).metadata.model3d.terrain),
    );
    await cp(
      `sources/${id}/layouts/snetterton-combo.json`,
      join(root, "sources", id, "layouts/snetterton-combo.json"),
    );
    await writeFile(
      join(root, "data/index.json"),
      JSON.stringify({ schemaVersion: 1, tracks: [item] }),
    );
    await writeFile(
      join(root, "data/border-inference-coverage.json"),
      JSON.stringify({ schemaVersion: 1, records: [] }),
    );
    const draft: Layout = read(networkFile);
    draft.features = draft.features.filter(
      (f) => f.properties.role !== "inner" && f.properties.role !== "outer" && f.properties.role !== "ideal",
    );
    delete draft.metadata.model3d;
    delete draft.metadata.borderComposition;
    delete draft.metadata.licenseScope;
    draft.bbox = bounds(
      draft.features.flatMap((f) => geometryPaths(f.geometry).flat()),
    );
    await writeFile(join(root, networkFile), serializeLayout(draft));
    const run = spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(
          new URL("../scripts/compose-networks.ts", import.meta.url),
        ),
        "--track",
        id,
        "--write",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);
    const bytes = await readFile(join(root, networkFile), "utf8"),
      saved = validateLayout(JSON.parse(bytes), track, "snetterton-combo");
    assert.equal(saved.metadata.borderComposition?.length, 3);
    assert.equal(bytes, serializeLayout(saved));
    assert.deepEqual(
      saved.features.filter((f) => f.properties.role === "trace"),
      draft.features.filter((f) => f.properties.role === "trace"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Buenos Aires preserves the held component while exposing its thirteen supported routes", () => {
  const { track, network } = networks().find(({ network }) => network.metadata.layoutId === "buenos-aires-combo")!;
  const components = network.metadata.borderComposition!;
  assert.equal(components.filter((c) => c.recipe.kind !== "surface").length, 13);
  assert.deepEqual(components.filter((c) => c.recipe.kind === "surface").map((c) => c.sourceLayoutId), ["buenos-aires-h"]);
  const unavailable = structuredClone(network);
  for (const c of unavailable.metadata.borderComposition!) c.recipe = structuredClone(components[1].recipe);
  assert.throws(() => validateLayout(unavailable, track, unavailable.metadata.layoutId), /at least one playable/);
});
