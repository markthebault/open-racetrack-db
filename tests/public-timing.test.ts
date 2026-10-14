import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { timingDatabaseSchema, withTiming } from "../scripts/public-timing";
import { validateLayout, validateTrack, type Layout } from "../schemas/data";
import { timingMarkers, timingAvailability } from "../src/timing";

const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const spa = async () => ({
  track: validateTrack(await json("data/belgium/spa-francorchamps/track.json")),
  layout: (await json(
    "data/belgium/spa-francorchamps/layouts/grand-prix.geojson",
  )) as Layout,
});

test("public timing contains only per-layout start and finish coordinates", async () => {
  const database = timingDatabaseSchema.parse(await json("data/timing.json"));
  assert.equal(Object.keys(database).length, 996);
  const index = await json("data/index.json");
  const identities = new Set<string>();
  for (const entry of index.tracks) {
    const track = validateTrack(await json(`data/${entry.file}`));
    for (const layout of track.layouts) {
      const key = `${track.id}/${layout.id}`,
        timing = database[key];
      if (!timing) continue;
      assert.ok(
        layout.referenceId,
        `${key}: expected explicit layout identity`,
      );
      assert.ok(layout.file);
      const data = validateLayout(
        await json(
          `data/${entry.file.replace(/track.json$/, "")}${layout.file}`,
        ),
        track,
        layout.id,
      );
      assert.deepEqual(data.metadata.timing, timing);
      assert.deepEqual(Object.keys(timing).sort(), ["finish", "start"]);
      identities.add(key);
    }
  }
  assert.equal(identities.size, Object.keys(database).length);
  assert.equal(database["es-jerez/motorcycle"], undefined);
  assert.equal(database["it-misano/short"], undefined);
  assert.throws(() =>
    timingDatabaseSchema.parse({
      "track/layout": { start: [7, 48], source: "extra" },
    }),
  );
});

test("timing enrichment never copies a venue's positions to another layout or changes trace geometry", async () => {
  const { layout } = await spa();
  const plain = structuredClone(layout);
  delete plain.metadata.timing;
  plain.metadata.timingStatus = "missing";
  const database = timingDatabaseSchema.parse(await json("data/timing.json"));
  const result = withTiming(plain, database);
  assert.equal(result.features, plain.features);
  assert.deepEqual(result.bbox, plain.bbox);
  assert.equal(result.metadata.lengthM, plain.metadata.lengthM);
  assert.equal(plain.metadata.timing, undefined);
  const other = {
    ...plain,
    metadata: { ...plain.metadata, layoutId: "unmatched" },
  };
  assert.equal(withTiming(other, database), other);
});

test("GPS validation rejects misaligned, malformed and incompatible positions", async () => {
  const { track, layout } = await spa();
  const moved = structuredClone(layout);
  moved.metadata.timing = { start: [7, 48], finish: [7, 48] };
  assert.throws(() => validateLayout(moved, track, "grand-prix"), /too far/);
  const incompatible = structuredClone(layout);
  incompatible.metadata.timing!.finish = [5.97, 50.44];
  assert.throws(
    () => validateLayout(incompatible, track, "grand-prix"),
    /same GPS/,
  );
  assert.throws(() =>
    timingDatabaseSchema.parse({ "track/layout": { start: [181, 48] } }),
  );
  assert.throws(() => timingDatabaseSchema.parse({ "track/layout": {} }));
});

test("shared markers retain exact GPS positions and separate or partial positions keep their roles", async () => {
  const { layout } = await spa(),
    before = structuredClone(layout);
  const [marker] = timingMarkers(layout);
  assert.equal(marker.role, "start_finish");
  assert.deepEqual(marker.point, layout.metadata.timing!.start);
  for (let axis = 0; axis < 2; axis++)
    assert.ok(
      Math.abs(
        (marker.coordinates[0][axis] + marker.coordinates[1][axis]) / 2 -
          marker.point[axis],
      ) < 1e-7,
    );
  assert.deepEqual(layout, before);
  const partial = structuredClone(layout);
  partial.metadata.timingMode = "separate";
  delete partial.metadata.timing!.finish;
  assert.deepEqual(
    timingMarkers(partial).map((gate) => gate.role),
    ["start"],
  );
  assert.deepEqual(timingAvailability(partial.metadata.timing), {
    start: true,
    finish: false,
  });
  assert.deepEqual(timingAvailability(), { start: false, finish: false });
});
