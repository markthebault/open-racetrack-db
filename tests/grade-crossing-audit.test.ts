import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { auditGradeCrossings } from "../scripts/audit-grade-crossings";
import type { Position } from "../src/geo";

const trace: Position[] = [
  [-0.0001, -0.0001],
  [0.0001, 0.0001],
  [-0.0001, 0.0001],
  [0.0001, -0.0001],
  [-0.0001, -0.0001],
];
const bridge = {
  type: "way",
  id: 42,
  version: 7,
  tags: { highway: "raceway", bridge: "yes", layer: "1" },
  geometry: [
    { lon: -0.0001, lat: -0.0001 },
    { lon: 0.0001, lat: 0.0001 },
  ],
};
const segments = [{ wayId: 42, wayVersion: 7 }];

test("a bridge must match the selected route version, position and branch direction", () => {
  const result = auditGradeCrossings(trace, true, [bridge], segments);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "source-bridge-needs-profile");
  assert.equal(result[0].bridgeCandidates[0].branch, 0);
  assert.equal(result[0].bridgeCandidates[0].wayVersion, 7);
  assert.deepEqual(result[0].coordinate, [0, 0]);
  for (const [ways, selection] of [
    [[bridge], []],
    [[bridge], [{ wayId: 42, wayVersion: 6 }]],
    [[{ ...bridge, tags: { ...bridge.tags, bridge: "no" } }], segments],
    [[{ ...bridge, tags: { ...bridge.tags, highway: "service" } }], segments],
    [
      [
        {
          ...bridge,
          geometry: bridge.geometry.map((p) => ({ ...p, lon: p.lon + 0.0001 })),
        },
      ],
      segments,
    ],
    [
      [
        {
          ...bridge,
          geometry: [
            { lon: -0.0001, lat: 0 },
            { lon: 0.0001, lat: 0 },
          ],
        },
      ],
      segments,
    ],
  ] as const)
    assert.equal(
      auditGradeCrossings(trace, true, [...ways], [...selection])[0].status,
      "unexplained",
    );
});

test("conflicting source bridge branches remain unresolved", () => {
  const other = {
    ...bridge,
    id: 43,
    geometry: [
      { lon: -0.0001, lat: 0.0001 },
      { lon: 0.0001, lat: -0.0001 },
    ],
  };
  const result = auditGradeCrossings(
    trace,
    true,
    [bridge, other],
    [...segments, { wayId: 43, wayVersion: 7 }],
  );
  assert.equal(result[0].bridgeCandidates.length, 2);
  assert.equal(result[0].status, "unexplained");
});

test("a collinear retrace cannot be excused by a bridge tag", () => {
  const result = auditGradeCrossings(
    [
      [-0.0001, -0.0001],
      [0.0001, 0.0001],
      [0, 0],
    ],
    false,
    [bridge],
    segments,
  );
  assert.equal(result[0].kind, "overlap");
  assert.equal(result[0].status, "unexplained");
});

test("both pinned Suzuka routes identify the same public bridge and upper branch", async () => {
  const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
  for (const id of ["main", "suzuka"]) {
    const root = "sources/jp-suzuka-circuit-175231434/",
      recipe = await read(root + `layouts/${id}.json`),
      snapshot = await read(root + (recipe.snapshotFile ?? "osm.json")),
      layout = await read(
        `data/japan/suzuka-circuit-175231434/layouts/${id}.geojson`,
      ),
      path = layout.features.find(
        (f: { properties: { role: string } }) => f.properties.role === "trace",
      ).geometry.coordinates,
      hits = auditGradeCrossings(
        path,
        true,
        snapshot.elements,
        recipe.segments,
      );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].status, "source-bridge-needs-profile");
    assert.deepEqual(hits[0].coordinate, [136.5306187, 34.8439714]);
    assert.equal(hits[0].bridgeCandidates[0].wayId, 175231434);
    assert.equal(hits[0].bridgeCandidates[0].branch, 1);
  }
});
