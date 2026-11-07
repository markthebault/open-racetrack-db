import { z } from "zod";

export const rerProductUrl =
  "https://geoportale.regione.emilia-romagna.it/catalogo/dati-cartografici/altimetria/layer-60";
export const rerAttribution =
  "Regione Emilia-Romagna, DTM 0.5m RER 2023-24, CC BY 4.0";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
/** Native WCS subset; the footprint snapshot distinguishes real coverage from zero-filled blanks. */
export const rerRasterSchema = z
  .strictObject({
    serviceUrl: z.literal(
      "https://servizigis.regione.emilia-romagna.it/wcs/dtmrer2023_24",
    ),
    coverageId: z.literal("1"),
    crs: z.literal("EPSG:7791"),
    verticalDatum: z.literal(
      "Genova 1942 orthometric metres, ITALGEO2005 geoid",
    ),
    pixelSizeM: z.literal(0.5),
    bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    sha256: hash,
    footprintSha256: hash,
    footprints: z
      .array(
        z.strictObject({
          objectId: z.number().int().positive(),
          sheet: z.string().regex(/^32_\d{8}$/),
          acquiredDates: z.array(z.iso.date()).min(1).max(5),
        }),
      )
      .min(1)
      .max(256),
  })
  .superRefine((raster, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const [west, south, east, north] = raster.bounds;
    if (west < 524186 || south < 4858357 || east > 801331.5 || north > 4999086)
      issue("RER crop must lie inside the declared native source grid");
    if (
      raster.bounds.some((v) => !Number.isInteger(v * 2)) ||
      east - west !== raster.width * 0.5 ||
      north - south !== raster.height * 0.5
    )
      issue(
        "RER crop dimensions and bounds must retain the native half metre grid",
      );
    const ids = raster.footprints.map((f) => f.objectId),
      sheets = raster.footprints.map((f) => f.sheet);
    if (
      new Set(ids).size !== ids.length ||
      new Set(sheets).size !== sheets.length
    )
      issue("Duplicate RER source footprints");
  });
