import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { type Layout, geometryPaths } from "../schemas/data";
import { composeIdealLine } from "../scripts/compose-ideal-lines";
const directory = "data/cyprus/cy-achna-speedway-ab0bcabd/layouts/";
const load = (id: string) => JSON.parse(readFileSync(`${directory}${id}.geojson`, "utf8")) as Layout;
const network = load("achna-speedway-full-runway"),
  sources = network.metadata.borderComposition!.map((c) => load(c.sourceLayoutId));
test("ideal composition retains closed lap and open branch paths in embedded component order", () => {
  const ideal = composeIdealLine(network, sources);
  assert.ok(ideal);
  assert.equal(ideal.geometry.type, "MultiLineString");
  assert.equal(ideal.geometry.coordinates.length, 3);
  for (const [i, source] of sources.entries()) {
    const path = geometryPaths(source.features.find((f) => f.properties.role === "ideal")!.geometry)[0];
    assert.deepEqual(ideal.geometry.coordinates[i], path);
    assert.equal(JSON.stringify(path[0]) === JSON.stringify(path.at(-1)), i === 0);
  }
  assert.equal(ideal.properties.edgeMarginM, 0.5);
});
test("ideal composition refuses missing lines and sources that differ from the embedded boundary recipe", () => {
  const missing = structuredClone(sources);
  missing[1].features = missing[1].features.filter((f) => f.properties.role !== "ideal");
  assert.equal(composeIdealLine(network, missing), undefined);
  const stale = structuredClone(sources);
  geometryPaths(stale[1].features.find((f) => f.properties.role === "inner")!.geometry)[0][0][0] += 0.0001;
  assert.equal(composeIdealLine(network, stale), undefined);
  assert.equal(composeIdealLine(network, sources.slice(1)), undefined);
});
