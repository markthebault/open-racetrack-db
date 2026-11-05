import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { indexSchema, validateTrack, validateLayout } from "../schemas/data";
import { isLapModel, trackModelSchema } from "../schemas/track-model";
import {
  borderRoadGeometry,
  boundaryCurbGeometry,
} from "../src/border-surface";
import { buildRoad } from "../src/lap-simulation";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

test("every bordered layout rebuilds a finite road surface and preserves an honest playback mode", () => {
  const catalogue = indexSchema.parse(read("data/index.json"));
  let layouts = 0,
    laps = 0,
    surfaces = 0;
  const venues = new Set<string>();
  for (const entry of catalogue.tracks) {
    const track = validateTrack(read(`data/${entry.file}`));
    for (const item of track.layouts) {
      if (!item.file) continue;
      const layout = validateLayout(
        read(`data/${dirname(entry.file)}/${item.file}`),
        track,
        item.id,
      );
      if (!layout.features.some((f) => f.properties.role === "inner")) continue;
      const key = `${track.id}/${item.id}`,
        model = layout.metadata.model3d;
      assert.ok(model, `${key}: missing model`);
      assert.equal(model.terrain.trackId, track.id);
      const surface = borderRoadGeometry(layout, model.terrain);
      assert.ok(surface.triangles > 0, key);
      assert.equal(
        surface.missingVertices,
        0,
        `${key}: terrain missing beneath a border`,
      );
      assert.ok(
        Array.from(surface.geometry.getAttribute("position").array).every(
          Number.isFinite,
        ),
        key,
      );
      surface.geometry.dispose();
      if (isLapModel(model)) {
        laps++;
        assert.ok(layout.metadata.closed, key);
        const road = buildRoad(layout);
        assert.ok(road.interpolatedSections / road.points.length <= 0.08, key);
        assert.ok(
          road.points.every(
            (p) =>
              Number.isFinite(p.y) &&
              Number.isFinite(p.curvature) &&
              p.left + p.right >= 3,
          ),
          key,
        );
      } else {
        surfaces++;
        assert.throws(() => buildRoad(layout), /no playable/);
        const curbs = boundaryCurbGeometry(layout, model);
        assert.ok(
          Array.from(curbs.geometry.getAttribute("position").array).every(
            Number.isFinite,
          ),
          key,
        );
        curbs.geometry.dispose();
        const invalid = structuredClone(model);
        invalid.curbs = [
          {
            role: "inner",
            pathIndex: 0,
            startM: 10,
            endM: 5,
            widthM: 1,
            heightM: 0.08,
          },
        ];
        assert.equal(trackModelSchema.safeParse(invalid).success, false, key);
      }
      layouts++;
      venues.add(track.id);
    }
  }
  assert.ok(layouts > 0 && laps > 0 && surfaces > 0);
  console.log(
    `Rebuilt ${layouts} layouts across ${venues.size} circuits: ${laps} laps, ${surfaces} surface views.`,
  );
});
