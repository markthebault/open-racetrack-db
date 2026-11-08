import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import {
  gradeSeparationSchema,
  type GradeSeparation,
} from "../schemas/grade-separation";
import type { Layout } from "../schemas/data";
import { geometryPaths } from "../schemas/data";
import { auditGradeCrossings } from "./audit-grade-crossings";
import { imageCrossSections } from "./infer-image-borders";

/** Verify embedded bridge claims against exact selected public source versions. No network calls. */
export async function verifyGradeSource(
  layout: Layout,
  grade: GradeSeparation,
  sourcesRoot = "sources",
) {
  grade = gradeSeparationSchema.parse(grade);
  const root = `${sourcesRoot}/${layout.metadata.trackId}`,
    recipe = JSON.parse(
      await readFile(
        `${root}/layouts/${layout.metadata.layoutId}.json`,
        "utf8",
      ),
    ),
    snapshotFile = resolve(root, recipe.snapshotFile ?? "osm.json"),
    bytes = await readFile(snapshotFile),
    sha256 = createHash("sha256").update(bytes).digest("hex"),
    trace = geometryPaths(
      layout.features.find((f) => f.properties.role === "trace")!.geometry,
    )[0],
    frames = imageCrossSections(trace),
    hits = auditGradeCrossings(
      trace,
      true,
      JSON.parse(bytes.toString()).elements,
      recipe.segments,
    );
  if (
    dirname(snapshotFile) !== resolve(root) ||
    recipe.snapshotSha256 !== sha256 ||
    grade.stationCount !== frames.count ||
    hits.length !== grade.crossings.length
  )
    throw new Error("Grade source recipe, snapshot or crossing count mismatch");
  const used = new Set<number>();
  const station = (metres: number) =>
    (((metres / frames.step - (grade.sourceStationOffset ?? 0)) %
      frames.count) +
      frames.count) %
    frames.count;
  for (const c of grade.crossings) {
    const matches = hits.flatMap((hit, i) => {
      if (used.has(i) || hit.status !== "source-bridge-needs-profile")
        return [];
      const candidate = hit.bridgeCandidates[0],
        upper = station(hit.stationsM[candidate.branch]),
        lower = station(hit.stationsM[1 - candidate.branch]);
      return candidate.wayId === c.source.wayId &&
        candidate.wayVersion === c.source.wayVersion &&
        candidate.bridge === c.source.bridge &&
        candidate.layer === c.source.layer &&
        c.source.snapshotSha256 === sha256 &&
        upper > c.upper[0] &&
        upper < c.upper[1] &&
        lower > c.lower[0] &&
        lower < c.lower[1]
        ? [i]
        : [];
    });
    if (
      matches.length !== 1 ||
      [c.upper, c.lower].some((r) => (r[1] - r[0]) * frames.step > 150)
    )
      throw new Error(
        "Grade intervals do not uniquely match a selected source bridge",
      );
    used.add(matches[0]);
  }
}
