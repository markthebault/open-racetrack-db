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
      assert.deepEqual(route.features, source.features, c.name);
      assert.deepEqual(route.metadata, source.metadata, c.name);
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
