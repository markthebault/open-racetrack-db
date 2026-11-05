import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateLayout, validateTrack } from "../schemas/data";
import {
  existingLayoutExtras,
  serializeLayout,
} from "../scripts/layout-borders";
import { buildRoad, simulateLap } from "../src/lap-simulation";
import { courseElevation } from "../src/elevation";

const file = "data/belgium/spa-francorchamps/layouts/grand-prix.geojson";
const raw = JSON.parse(readFileSync(file, "utf8"));
const track = validateTrack(
  JSON.parse(readFileSync("data/belgium/spa-francorchamps/track.json", "utf8")),
);
const validate = (data: unknown) => validateLayout(data, track, "grand-prix");

test("Spa's single GeoJSON contains its complete 3D parameters without changing source geometry", () => {
  const layout = validate(raw),
    model = layout.metadata.model3d!;
  assert.equal(
    createHash("sha256").update(JSON.stringify(layout.features)).digest("hex"),
    "57c193a16a4482f6d3552b4eeae1cf9c167e4699adb90cfe815731867a3dc38b",
  );
  assert.equal(layout.metadata.lengthM, 6994.7);
  assert.equal(layout.metadata.licenseScope, "trace-and-timing");
  assert.deepEqual(
    layout.features.map((f) => f.properties.role),
    ["trace", "inner", "outer"],
  );
  assert.ok(model.kind !== "surface");
  assert.equal(model.elevation.length, 19);
  assert.equal(model.curbs.length, 20);
  assert.ok(model.curbs.every((c) => c.widthM > 0 && c.heightM === 0.08));
  assert.equal(model.terrain.heights.length, 850);
  assert.ok(courseElevation(layout, model.terrain));
  assert.equal(model.bankingDeg, 0);
  assert.ok(model.sources.notes.includes("not a survey"));
  assert.equal(existsSync("data/simulation/spa.json"), false);
  assert.equal(existsSync("data/elevation/be-spa-francorchamps.json"), false);
  assert.ok(
    Math.abs(simulateLap(buildRoad(layout)).duration - 192.67448730272028) <
      1e-6,
  );
});

test("canonical serialization and regeneration retain the embedded model and its own attribution", async () => {
  const layout = validate(raw),
    text = serializeLayout(layout);
  assert.equal(text, await readFile(file, "utf8"));
  assert.deepEqual(validate(JSON.parse(text)), layout);
  const extras = await existingLayoutExtras(file);
  assert.deepEqual(extras.model3d, layout.metadata.model3d);
  assert.equal(extras.borders.length, 2);
  assert.ok(extras.model3d!.imagery.attribution.includes("SPW"));
  for (const f of extras.borders)
    assert.equal(
      "license" in f.properties ? f.properties.license : null,
      "LicenseRef-Track-Borders",
    );
});

test("invalid stationing, curb dimensions, raster data and source URLs are rejected", () => {
  const changes: ((data: typeof raw) => void)[] = [
    (d) => {
      d.metadata.model3d.elevation[1][0] = 0;
    },
    (d) => {
      d.metadata.model3d.elevation.at(-1)[0] = 7005;
    },
    (d) => {
      d.metadata.model3d.elevation.at(-1)[1] = 417;
    },
    (d) => {
      d.metadata.model3d.curbs[0].endM = 7005;
    },
    (d) => {
      d.metadata.model3d.curbs[0].startM = 300;
    },
    (d) => {
      d.metadata.model3d.curbs[0].heightM = -0.1;
    },
    (d) => {
      d.metadata.model3d.curbs[0].widthM = 0;
    },
    (d) => {
      d.metadata.model3d.terrain.trackId = "wrong-track";
    },
    (d) => {
      d.metadata.model3d.terrain.heights.pop();
    },
    (d) => {
      d.metadata.model3d.imagery.url = "javascript:alert(1)";
    },
    (d) => {
      d.metadata.model3d.imagery.extent3857[2] = 0;
    },
    (d) => {
      d.metadata.model3d.corners[1].distanceM = 0;
    },
    (d) => {
      d.metadata.model3d.bankingDeg = 5;
    },
  ];
  for (const change of changes) {
    const data = structuredClone(raw);
    change(data);
    assert.throws(() => validate(data));
  }
});

test("the extension remains optional and requires appropriate route and licensing data when present", () => {
  const legacy = structuredClone(raw);
  delete legacy.metadata.model3d;
  assert.equal(validate(legacy).metadata.model3d, undefined);
  assert.throws(() => buildRoad(validate(legacy)), /no embedded/);
  const missingBorder = structuredClone(raw);
  missingBorder.features.pop();
  assert.throws(() => validate(missingBorder));
  const noAnchor = structuredClone(raw);
  delete noAnchor.metadata.timing;
  assert.throws(() => validate(noAnchor), /timing start/);
});
