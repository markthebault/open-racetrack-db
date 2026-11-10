import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  indexSchema,
  validateTrack,
  validateLayout,
  geometryPaths,
} from "../schemas/data";
import { traceWidthReference } from "../src/trace-width-geometry";
import { gradeProfileHeight } from "../src/grade-separation";
const index = indexSchema.parse(
  JSON.parse(await readFile("data/index.json", "utf8")),
);
let layouts = 0,
  widths = 0,
  unavailable = 0,
  bridges = 0;
for (const e of index.tracks) {
  const track = validateTrack(
      JSON.parse(await readFile("data/" + e.file, "utf8")),
    ),
    dir = "data/" + dirname(e.file);
  for (const entry of track.layouts) {
    if (!entry.file) continue;
    const file = dir + "/" + entry.file,
      text = await readFile(file, "utf8"),
      d = validateLayout(JSON.parse(text), track, entry.id);
    layouts++;
    if (
      d.features.some((f) =>
        ["inner", "outer", "ideal"].includes(f.properties.role),
      )
    )
      throw Error("Stored derived points: " + file);
    if (text !== JSON.stringify(JSON.parse(text)) + "\n")
      throw Error("Noncompact layout: " + file);
    if (entry.lineUnavailableReason) {
      if (entry.roadWidthM || d.metadata.model3d)
        throw Error("Unavailable layout has active line data: " + file);
      unavailable++;
      continue;
    }
    if (entry.roadWidthM) {
      widths++;
      if (
        !entry.roadWidthSource ||
        Math.round(entry.roadWidthSource.meanWidthM * 2) / 2 !==
          entry.roadWidthM
      )
        throw Error("Invalid rounded width provenance: " + file);
      if (!d.metadata.model3d) throw Error("Missing compact model: " + file);
    } else if (d.metadata.model3d) throw Error("Model without width: " + file);
    const model = d.metadata.model3d,
      grade =
        model && model.kind !== "surface" ? model.gradeSeparation : undefined;
    if (grade) {
      const source = geometryPaths(
          d.features.find((f) => f.properties.role === "trace")!.geometry,
        )[0],
        ref = traceWidthReference(source, d.metadata.closed, entry.roadWidthM);
      if (grade.stationCount !== ref.frames.length || grade.sourceStationOffset)
        throw Error("Bridge profile grid mismatch: " + file);
      for (const c of grade.crossings) {
        const mid = (r: [number, number]) =>
          (r[0] +
            ((r[1] - r[0] + grade.stationCount) % grade.stationCount) / 2) %
          grade.stationCount;
        if (
          gradeProfileHeight(grade, mid(c.upper)) -
            gradeProfileHeight(grade, mid(c.lower)) <
          3
        )
          throw Error("Bridge height separation missing: " + file);
      }
      bridges++;
    }
  }
}
const coverage = JSON.parse(
  await readFile("data/ideal-lines-coverage.json", "utf8"),
);
if (
  coverage.computedOnDemand !== widths ||
  coverage.unavailable !== unavailable
)
  throw Error("Compact line coverage is stale");
console.log({
  layouts,
  widths,
  unavailable,
  bridgeProfiles: bridges,
  storedDerivedLines: 0,
});
