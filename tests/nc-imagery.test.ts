import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { imageryForLayout } from "../src/model-preparation";
import { validateTrack, validateLayout } from "../schemas/data";
import { buildRoad } from "../src/lap-simulation";
test("NC analysis imagery retains its specific reuse policy and RGB georeferencing through playback", async () => {
  const root = "data/united-states/us-gopro-motorplex-e67c71ed",
    track = validateTrack(
      JSON.parse(await readFile(root + "/track.json", "utf8")),
    ),
    layout = validateLayout(
      JSON.parse(
        await readFile(root + "/layouts/gopro-motorplex.geojson", "utf8"),
      ),
      track,
      "gopro-motorplex",
    ),
    reference = layout.metadata.borderInference!.imagery,
    display = imageryForLayout(layout),
    url = new URL(display.url);
  assert.equal(reference.license, "LicenseRef-NCOneMap-open-data");
  assert.equal(
    reference.reuseEvidenceUrl,
    "https://www.nconemap.gov/pages/terms",
  );
  assert.match(reference.attribution, /NC OneMap \(2019\)/);
  assert.match(
    url.pathname,
    /Orthoimagery_2020_2023_4band_analysis\/ImageServer\/exportImage$/,
  );
  assert.equal(url.searchParams.get("bandIds"), "0,1,2");
  assert.equal(url.searchParams.get("f"), "image");
  assert.deepEqual(
    url.searchParams.get("bbox")!.split(",").map(Number),
    reference.extent3857,
  );
  assert.deepEqual(display.extent3857, reference.extent3857);
  const road = buildRoad(layout);
  assert.equal(road.interpolatedSections, 0);
  assert.ok(
    road.points.every((p) => p.left + p.right >= 3.5 && p.left + p.right <= 15),
  );
});
