import { z } from "zod";
import { borderInferenceSchema } from "../schemas/border-inference";
import { validateLayout, type Track } from "../schemas/data";
import { bounds, distance, equal, length, plane, type Position } from "../src/geo";
import { assertSeparateSimpleRings } from "../src/boundary-path";

const license = "LicenseRef-MapTiler-Derived-Borders";
const imageSchema = borderInferenceSchema.shape.imagery.refine(
  image => image.license === license && image.rightsBasis === "source-specific-agreement" && !!image.tiles &&
    image.sha256 !== "0".repeat(64) && image.url === "https://api.maptiler.com/maps/satellite-v4/tiles.json",
  "Licensed route needs its agreement basis and XYZ image reference",
);
export const licensedImageryRouteSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceKind: z.literal("licensed-imagery-route"),
  sourceId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  imagery: imageSchema,
  pixels: z.array(z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()])).min(4).max(20000),
  closed: z.literal(true),
  identificationUrl: z.url().refine(url => /^https?:/.test(url)),
  evidence: z.string().trim().min(20),
});

/** Source coordinates only. The licensed raster is checked during authoring and is not redistributed. */
export function licensedImageryCoordinates(input: unknown): Position[] {
  const source = licensedImageryRouteSchema.parse(input), image = source.imagery;
  const tiles = image.tiles!, [x0, y0, x1, y1] = tiles.bounds;
  const world = 2 * Math.PI * 6378137, span = world / 2 ** tiles.zoom;
  const extent = [x0 * span - world / 2, world / 2 - (y1 + 1) * span,
    (x1 + 1) * span - world / 2, world / 2 - y0 * span];
  if (image.width !== (x1 - x0 + 1) * 512 || image.height !== (y1 - y0 + 1) * 512 ||
    extent.some((v, i) => Math.abs(v - image.extent3857[i]) > 0.00001))
    throw new Error("Licensed route raster dimensions/extent disagree with its XYZ reference");
  const latitude = Math.atan(Math.sinh((extent[1] + extent[3]) / 2 / 6378137));
  if (Math.abs(span / 512 * Math.cos(latitude) - image.groundPixelSizeM) > 0.001)
    throw new Error("Licensed route pixel resolution disagrees with its XYZ reference");
  const points = source.pixels.map(([x, y]): Position => {
    if (x >= image.width || y >= image.height) throw new Error("Licensed route vertex outside raster");
    const mx = extent[0] + (x + 0.5) / image.width * (extent[2] - extent[0]);
    const my = extent[3] - (y + 0.5) / image.height * (extent[3] - extent[1]);
    return [Number((mx / 6378137 * 180 / Math.PI).toFixed(7)),
      Number((Math.atan(Math.sinh(my / 6378137)) * 180 / Math.PI).toFixed(7))];
  });
  if (!equal(points[0], points.at(-1)!)) throw new Error("Licensed route must close exactly");
  for (let i = 1; i < points.length; i++) {
    if (equal(points[i - 1], points[i]) || distance(points[i - 1], points[i]) > 80)
      throw new Error("Licensed route needs distinct source vertices at most 80 m apart");
  }
  const projection = plane(points[0]);
  assertSeparateSimpleRings([points.map(projection.to)]);
  return points;
}

type Recipe = { geometrySource: string; sourceId: string; trackId: string; layoutId: string;
  closed: boolean; timingMode: "shared" | "separate"; gates?: unknown[]; notes: string[] };
export function buildLicensedImageryRoute(recipe: Recipe, input: unknown, track: Track) {
  const source = licensedImageryRouteSchema.parse(input), coordinates = licensedImageryCoordinates(source);
  if (recipe.geometrySource !== "licensed-imagery" || recipe.sourceId !== source.sourceId || !recipe.closed ||
    recipe.trackId !== track.id || recipe.gates?.length)
    throw new Error("Licensed route recipe identity or independent timing mismatch");
  if (!track.sources.some(s => s.id === source.sourceId && s.type === "imagery" &&
    s.license === license && s.url === source.imagery.url))
    throw new Error("Licensed route rights are not registered");
  return validateLayout({ type: "FeatureCollection", bbox: bounds(coordinates), metadata: {
    schemaVersion: 1, trackId: track.id, layoutId: recipe.layoutId, license,
    licenseScope: "trace-and-timing", attribution: source.imagery.attribution, closed: true,
    geometryStatus: "draft", timingStatus: "missing", timingMode: recipe.timingMode,
    lengthM: length(coordinates), reviewedAt: null, notes: recipe.notes,
  }, features: [{ type: "Feature", id: "trace", properties: { role: "trace", sourceIds: [source.sourceId] },
    geometry: { type: "LineString", coordinates } }] }, track, recipe.layoutId);
}
