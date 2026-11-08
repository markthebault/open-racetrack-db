import { z } from "zod";

export const nlsProductUrl =
  "https://www.maanmittauslaitos.fi/en/maps-and-spatial-data/datasets-and-interfaces/product-descriptions/elevation-model-2-m";
export const nlsAttribution = (date: string) =>
  `National Land Survey of Finland, Elevation model 2 m, delivered ${date}, CC BY 4.0`;
export const nlsAttributionSchema = z
  .string()
  .regex(
    /^National Land Survey of Finland, Elevation model 2 m, delivered \d{4}-\d{2}-\d{2}, CC BY 4\.0$/,
  );
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const nlsRastersSchema = z
  .array(
    z.strictObject({
      url: z
        .string()
        .regex(
          /^https:\/\/www\.nic\.funet\.fi\/index\/geodata\/mml\/dem2m\/2008_latest\/[A-Z][0-9]\/[A-Z][0-9]{2}\/[A-Z][0-9]{4}[A-Z]\.tif$/,
        ),
      itemUrl: z
        .string()
        .regex(
          /^https:\/\/paituli\.csc\.fi\/geoserver\/ogc\/stac\/v1\/collections\/nls_digital_elevation_model_2m_at_paituli\/items\/nls_digital_elevation_model_2m_at_paituli_[a-z0-9_]+$/,
        ),
      sourceDatetime: z.iso.datetime({ offset: true }),
      crs: z.literal("EPSG:3067"),
      verticalDatum: z.literal("N2000 (EPSG:3900) orthometric metres"),
      pixelSizeM: z.literal(2),
      origin: z.tuple([z.number().int(), z.number().int()]),
      width: z.literal(3000),
      height: z.literal(3000),
      sha256: hash,
    }),
  )
  .min(1)
  .max(16)
  .superRefine((rasters, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (new Set(rasters.map((r) => r.url)).size !== rasters.length)
      issue("Duplicate NLS elevation rasters");
    if (rasters.some((r) => r.origin.some((v) => v % 2 !== 0)))
      issue("NLS raster origin must align to its native two metre grid");
  });
