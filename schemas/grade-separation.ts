import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const range = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().positive(),
]);
/** Paired edge station indices, independent of the simulation's start/finish rotation. */
export const gradeSeparationSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    method: z.literal("source-bridge-ground-approaches-v1"),
    stationCount: z.number().int().min(12).max(199999),
    crossings: z
      .array(
        z.strictObject({
          upper: range,
          lower: range,
          source: z.strictObject({
            wayId: z.number().int().positive(),
            wayVersion: z.number().int().positive(),
            snapshotSha256: hash,
            bridge: z.literal("yes"),
            layer: z.string().min(1),
          }),
          note: z.string().min(1),
        }),
      )
      .min(1)
      .max(16),
    elevation: z.strictObject({
      source: z.literal("GSI DEM5A"),
      url: z.literal("https://maps.gsi.go.jp/development/ichiran.html#dem"),
      attribution: z.literal("Geospatial Information Authority of Japan (GSI)"),
      reuseEvidenceUrl: z.literal(
        "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html",
      ),
      sampling: z.literal("bilinear-pixel-centres"),
      toleranceM: z.number().positive().max(0.5),
      tiles: z
        .array(
          z.strictObject({
            zoom: z.literal(15),
            x: z.number().int().min(0).max(32767),
            y: z.number().int().min(0).max(32767),
            sha256: hash,
          }),
        )
        .min(1)
        .max(500),
      anchors: z
        .array(
          z.tuple([z.number().nonnegative(), z.number().min(-12000).max(9000)]),
        )
        .min(3)
        .max(50000),
      note: z.string().min(1),
    }),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const a = value.elevation.anchors;
    if (
      a[0][0] !== 0 ||
      a.at(-1)![0] !== value.stationCount ||
      a[0][1] !== a.at(-1)![1]
    )
      issue(
        "Grade profile must cover the paired closed path and meet at its seam",
      );
    if (a.some((p, i) => i > 0 && p[0] <= a[i - 1][0]))
      issue("Grade profile stations must increase strictly");
    const spans: [number, number][] = [];
    for (const crossing of value.crossings) {
      for (const r of [crossing.upper, crossing.lower]) {
        if (r[0] >= r[1] || r[1] >= value.stationCount)
          issue("Crossing intervals must be ordered inside the paired path");
        if (spans.some((s) => r[0] <= s[1] && r[1] >= s[0]))
          issue("Crossing intervals must not overlap");
        spans.push(r);
      }
      // Bridge decks are interpolated from pinned approach samples, not a nominal clearance.
      for (const station of crossing.upper)
        if (!a.some((p) => p[0] === station))
          issue("Bridge interpolation must retain both approach anchors");
      if (a.some((p) => p[0] > crossing.upper[0] && p[0] < crossing.upper[1]))
        issue(
          "Bridge spans must interpolate only between their two approach anchors",
        );
    }
    const keys = value.elevation.tiles.map((t) => `${t.zoom}/${t.x}/${t.y}`);
    if (new Set(keys).size !== keys.length) issue("Duplicate elevation tiles");
  });
export type GradeSeparation = z.infer<typeof gradeSeparationSchema>;
