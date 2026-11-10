import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gradeSeparationSchema } from "../schemas/grade-separation";
import {
  gradeForLayout,
  gradeProfileHeight,
  onBridge,
} from "../src/grade-separation";
import { courseElevation } from "../src/elevation";
import { remapWidthGrade } from "../scripts/width-grade";
import type { Layout } from "../schemas/data";
import fixture from "./legacy-authoring-tests.json";

test("all preserved bridge profiles reproduce on the source grid, including cyclic seam crossings", () => {
  const index = JSON.parse(readFileSync("data/index.json", "utf8"));
  let count = 0,
    wrapped = 0;
  for (const entry of index.tracks) {
    const track = JSON.parse(readFileSync("data/" + entry.file, "utf8"));
    const dir = "data/" + entry.file.replace(/track\.json$/, "");
    for (const layout of track.layouts) {
      if (!layout.file) continue;
      const file = dir + layout.file,
        raw = JSON.parse(readFileSync(file, "utf8")) as Layout;
      const grade = gradeForLayout(raw);
      if (!grade) continue;
      gradeSeparationSchema.parse(grade);
      const original = JSON.parse(
        execFileSync("git", ["show", fixture.datasetCommit + ":" + file], {
          encoding: "utf8",
          maxBuffer: 10_000_000,
        }),
      ) as Layout;
      assert.deepEqual(remapWidthGrade(original, layout.roadWidthM), grade);
      assert.ok(
        courseElevation(raw, raw.metadata.model3d!.terrain),
        "Compact terrain works before paired edges are generated",
      );
      for (const crossing of grade.crossings) {
        const mid = (r: [number, number]) =>
          (r[0] +
            ((r[1] - r[0] + grade.stationCount) % grade.stationCount) / 2) %
          grade.stationCount;
        assert.ok(
          gradeProfileHeight(grade, mid(crossing.upper)) -
            gradeProfileHeight(grade, mid(crossing.lower)) >=
            3,
        );
        assert.ok(onBridge(grade, mid(crossing.upper)));
        if (crossing.upper[0] > crossing.upper[1]) {
          wrapped++;
          assert.ok(onBridge(grade, 0));
          assert.ok(onBridge(grade, grade.stationCount - 0.1));
        }
      }
      const invalid = structuredClone(grade);
      invalid.crossings[0].lower = [...invalid.crossings[0].upper];
      assert.equal(gradeSeparationSchema.safeParse(invalid).success, false);
      count++;
    }
  }
  assert.equal(count, 7);
  assert.equal(wrapped, 4);
});
