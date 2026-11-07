import { z } from "zod";
import {
  nlsAttribution,
  nlsAttributionSchema,
  nlsRastersSchema,
} from "./nls-elevation";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const range = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().positive(),
]);
const profile = {
  sampling: z.literal("bilinear-pixel-centres"),
  crossingInterpolation: z.literal("both-road-approaches-v1").optional(),
  toleranceM: z.number().positive().max(0.5),
  anchors: z
    .array(
      z.tuple([z.number().nonnegative(), z.number().min(-12000).max(9000)]),
    )
    .min(3)
    .max(50000),
  note: z.string().min(1),
};
const elevationSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("GSI DEM5A"),
    url: z.literal("https://maps.gsi.go.jp/development/ichiran.html#dem"),
    attribution: z.literal("Geospatial Information Authority of Japan (GSI)"),
    reuseEvidenceUrl: z.literal(
      "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html",
    ),
    sampling: profile.sampling,
    crossingInterpolation: profile.crossingInterpolation,
    toleranceM: profile.toleranceM,
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
    anchors: profile.anchors,
    note: profile.note,
  }),
  z.strictObject({
    ...profile,
    source: z.literal("ICGC MET 50cm 2021-2023"),
    url: z.literal(
      "https://catalegs.ide.cat/geonetwork/geonetwork/api/records/model-elevacions-terreny-lidar-catalunya-50cm-2021-2023?language=all",
    ),
    attribution: z.literal(
      "Institut Cartogràfic i Geològic de Catalunya (ICGC), CC BY 4.0",
    ),
    reuseEvidenceUrl: z.literal(
      "https://datacloud.ide.cat/especificacions/model-elevacions-terreny-territorial-v1r0-20260902.pdf",
    ),
    crossingInterpolation: z.literal("both-road-approaches-v1"),
    raster: z.strictObject({
      url: z.literal(
        "https://datacloud.icgc.cat/datacloud/model-elevacions-terreny/tif_unzip/model-elevacions-terreny-lidar-catalunya-50cm-2021-2023.tif",
      ),
      crs: z.literal("EPSG:25831"),
      verticalDatum: z.literal("EGM08D595 orthometric metres"),
      pixelSizeM: z.literal(0.5),
      // Column, row, width and height in the original 538000 × 524000 cell grid.
      sourceWindow: z.tuple([
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
        z.number().int().positive(),
        z.number().int().positive(),
      ]),
      sha256: hash,
    }),
  }),
  z.strictObject({
    ...profile,
    source: z.literal("NLS Elevation model 2 m"),
    url: z.literal(
      "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/elevation-model-2-m",
    ),
    attribution: nlsAttributionSchema,
    deliveredAt: z.iso.date(),
    reuseEvidenceUrl: z.literal(
      "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/elevation-model-2-m",
    ),
    crossingInterpolation: z.literal("both-road-approaches-v1"),
    rasters: nlsRastersSchema,
  }),
]);

/** Paired edge station indices, independent of the simulation's start/finish rotation. */
export const gradeSeparationSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    method: z.literal("source-bridge-ground-approaches-v1"),
    stationCount: z.number().int().min(12).max(199999),
    sourceStationOffset: z.number().int().nonnegative().optional(),
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
    elevation: elevationSchema,
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const a = value.elevation.anchors;
    if ((value.sourceStationOffset ?? 0) >= value.stationCount)
      issue("Source station offset must be inside the closed source grid");
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
      // An occluded lower road must not inherit the deck's raster height.
      const interpolated = value.elevation.crossingInterpolation
        ? [crossing.upper, crossing.lower]
        : [crossing.upper];
      for (const span of interpolated) {
        for (const station of span)
          if (!a.some((p) => p[0] === station))
            issue("Bridge interpolation must retain both approach anchors");
        if (a.some((p) => p[0] > span[0] && p[0] < span[1]))
          issue(
            "Bridge spans must interpolate only between their two approach anchors",
          );
      }
    }
    if (value.elevation.source === "GSI DEM5A") {
      const keys = value.elevation.tiles.map((t) => `${t.zoom}/${t.x}/${t.y}`);
      if (new Set(keys).size !== keys.length)
        issue("Duplicate elevation tiles");
    } else if (value.elevation.source === "ICGC MET 50cm 2021-2023") {
      const [column, row, width, height] = value.elevation.raster.sourceWindow;
      if (column + width > 538000 || row + height > 524000)
        issue("ICGC crop must lie inside the original native raster grid");
    } else {
      const elevation = value.elevation;
      if (elevation.attribution !== nlsAttribution(elevation.deliveredAt))
        issue("NLS attribution must identify the product and delivery date");
    }
  });
export type GradeSeparation = z.infer<typeof gradeSeparationSchema>;
