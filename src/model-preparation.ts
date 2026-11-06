import { geometryPaths, type Layout } from "../schemas/data";
import {
  trackModelSchema,
  isLapModel,
  type TrackModel3D,
  type LapModel3D,
  type SurfaceModel3D,
} from "../schemas/track-model";
import { boundaryCurbs, borderRoadGeometry } from "./border-surface";
import { sampleElevation, type ElevationGrid } from "./elevation";
import { plane, length as geographicLength } from "./geo";
import { pairedBorderMidline } from "./border-midline";
import {
  buildRoad,
  roadHeight,
  type ElevationAnchor,
  type Road,
} from "./lap-simulation";

export const PREPARATION_VERSION = 2;
export const ELEVATION_TOLERANCE_M = 0.5;
export const WORLD_IMAGERY_SERVICE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
export const WORLD_IMAGERY_CREDIT =
  "Esri, Vantor, Earthstar Geographics, and the GIS User Community";

/** Exact request aspect ratio avoids an undocumented extent adjustment by the map service. */
export function imageryForLayout(layout: Layout): TrackModel3D["imagery"] {
  const reference = layout.metadata.borderInference?.imagery;
  if (reference) {
    if (reference.tiles)
      return {
        url: reference.url,
        tiles: reference.tiles,
        extent3857: reference.extent3857,
        attribution: reference.attribution,
        termsUrl: reference.termsUrl,
      };
    const url = new URL(reference.url);
    const exported = /\/exportImage$/i.test(url.pathname),
      wms = url.searchParams.get("REQUEST")?.toUpperCase() === "GETMAP";
    if (exported || wms) {
      if (exported) {
        url.searchParams.set("f", "image");
        url.searchParams.set("bbox", reference.extent3857.join(","));
        url.searchParams.set("size", `${reference.width},${reference.height}`);
      }
      return {
        url: url.href,
        extent3857: reference.extent3857,
        attribution: reference.attribution,
        termsUrl: reference.reuseEvidenceUrl,
      };
    }
  }

  const radians = Math.PI / 180,
    r = 6378137;
  const points = layout.features.flatMap((f) =>
    geometryPaths(f.geometry).flat(),
  );
  const xs = points.map((p) => r * p[0] * radians),
    ys = points.map(
      (p) => r * Math.log(Math.tan(Math.PI / 4 + (p[1] * radians) / 2)),
    );
  const latitude = (layout.bbox[1] + layout.bbox[3]) / 2,
    margin = 180 / Math.cos(latitude * radians);
  const west = Math.min(...xs) - margin,
    east = Math.max(...xs) + margin,
    south = Math.min(...ys) - margin,
    north = Math.max(...ys) + margin;
  const width = east - west,
    height = north - south,
    size = 2048;
  const columns = Math.max(
      256,
      Math.round((size * width) / Math.max(width, height)),
    ),
    rows = Math.max(256, Math.round((size * height) / Math.max(width, height)));
  const resolution = Math.max(width / columns, height / rows),
    cx = (west + east) / 2,
    cy = (south + north) / 2;
  const extent3857: [number, number, number, number] = [
    cx - (columns * resolution) / 2,
    cy - (rows * resolution) / 2,
    cx + (columns * resolution) / 2,
    cy + (rows * resolution) / 2,
  ].map((v) => Number(v.toFixed(4))) as [number, number, number, number];
  const query = new URLSearchParams({
    bbox: extent3857.join(","),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${columns},${rows}`,
    format: "jpg",
    f: "image",
  });
  return {
    url: `${WORLD_IMAGERY_SERVICE}/export?${query}`,
    extent3857,
    attribution: WORLD_IMAGERY_CREDIT,
    termsUrl: "https://www.esri.com/en-us/legal/terms/web-site-service",
  };
}

/** Keep only anchors needed to preserve the sampled terrain within the stated vertical tolerance. */
export function compressElevation(
  samples: ElevationAnchor[],
  tolerance = ELEVATION_TOLERANCE_M,
  closed = true,
): ElevationAnchor[] {
  if (samples.length < 3)
    throw new Error("At least three elevation samples are required");
  const indices = new Set([
    0,
    Math.floor((samples.length - 1) / 2),
    samples.length - 1,
  ]);
  for (let iteration = 0; iteration < samples.length; iteration++) {
    const ordered = [...indices].sort((a, b) => a - b),
      anchors = ordered.map((i) => samples[i]);
    let worst = tolerance,
      index = -1;
    for (let i = 1; i < samples.length - 1; i++)
      if (!indices.has(i)) {
        const error = Math.abs(
          roadHeight(anchors, samples[i][0], closed) - samples[i][1],
        );
        if (error > worst) {
          worst = error;
          index = i;
        }
      }
    if (index < 0) return anchors;
    indices.add(index);
  }
  return samples;
}

export function terrainProfile(
  road: Road,
  terrain: ElevationGrid,
): ElevationAnchor[] {
  const projection = plane(road.origin),
    step = Math.max(1, Math.floor(40 / road.step)),
    samples: ElevationAnchor[] = [];
  const closed = road.recipe.kind !== "run",
    denominator = road.points.length - (closed ? 0 : 1);
  for (let i = 0; i < denominator; i += step) {
    const p = road.points[i],
      height = sampleElevation(terrain, projection.from([p.x, -p.z]));
    if (height === null)
      throw new Error("Terrain does not cover the selected course");
    samples.push([
      (i / denominator) * road.recipe.referenceLengthM,
      Number(height.toFixed(3)),
    ]);
  }
  const last = road.points.at(-1)!;
  const endHeight = closed
    ? samples[0][1]
    : sampleElevation(terrain, projection.from([last.x, -last.z]));
  if (endHeight === null)
    throw new Error("Terrain does not cover the route finish");
  samples.push([road.recipe.referenceLengthM, Number(endHeight.toFixed(3))]);
  return compressElevation(samples, ELEVATION_TOLERANCE_M, closed);
}

/** Illustration only: no claim that curvature identifies a real painted curb or its dimensions. */
export function illustrativeCurbs(road: Road): LapModel3D["curbs"] {
  const n = road.points.length,
    length = road.recipe.referenceLengthM,
    step = length / n;
  const index = (i: number) =>
    road.recipe.kind === "run" ? Math.max(0, Math.min(n - 1, i)) : (i + n) % n;
  const signs = road.points.map((_, i) => {
    let k = 0;
    for (let j = -2; j <= 2; j++) k += road.points[index(i + j)].curvature / 5;
    return Math.abs(k) > 1 / 300 ? Math.sign(k) : 0;
  });
  const runs: { start: number; end: number; sign: number; angle: number }[] =
    [];
  for (let i = 0; i < n; i++) {
    if (!signs[i]) continue;
    const start = i,
      sign = signs[i];
    let angle = 0;
    while (i < n && signs[i] === sign) {
      angle += Math.abs(road.points[i].curvature) * road.points[i].ds;
      i++;
    }
    const end = i - 1,
      previous = runs.at(-1);
    if (
      previous &&
      previous.sign === sign &&
      (start - previous.end) * step < 25
    ) {
      previous.end = end;
      previous.angle += angle;
    } else runs.push({ start, end, sign, angle });
    i--;
  }
  return runs
    .filter((r) => (r.end - r.start) * step >= 12 && r.angle > 0.2)
    .map((r) => ({
      startM: Number(Math.max(0, r.start * step - 8).toFixed(2)),
      endM: Number(Math.min(length, (r.end + 1) * step + 8).toFixed(2)),
      side: r.sign > 0 ? ("right" as const) : ("left" as const),
      widthM: 1,
      heightM: 0.08,
    }));
}

export function prepareTrackModel(
  layout: Layout,
  terrain: ElevationGrid,
  inputSha256: string,
): LapModel3D {
  const run =
    !layout.metadata.closed &&
    layout.metadata.borderInference?.edgeConvention ===
      "left-right-along-trace";
  if (
    (!layout.metadata.closed && !run) ||
    layout.metadata.geometryKind === "network"
  )
    throw new Error(
      "Preparation requires a closed route or paired open-road edges",
    );
  const paired =
    run || layout.metadata.borderInference?.method === "rgb-road-appearance-v3";
  const length = paired
    ? geographicLength(pairedBorderMidline(layout))
    : layout.metadata.lengthM;
  const seed: LapModel3D = {
    schemaVersion: 1,
    ...(run ? { kind: "run" as const } : {}),
    ...(paired ? { pathMethod: "paired-border-midpoints" as const } : {}),
    startOffsetM: 0,
    referenceLengthM: length,
    elevationMethod: run ? "monotone-cubic" : "periodic-monotone-cubic",
    elevation: [
      [0, 0],
      [length / 2, 0],
      [length, 0],
    ],
    bankingDeg: 0,
    quality: {
      stationing: paired ? "border-midline" : "mapped-trace",
      elevation: "terrain-raster",
      curbs: "geometry-estimated",
      borders: "supplemental-unverified",
    },
    corners: [],
    curbs: [],
    curbStyle: { colors: ["#f2f2e7", "#c73732"], stripeLengthM: 2 },
    imagery: imageryForLayout(layout),
    terrain,
    preparation: {
      version: PREPARATION_VERSION,
      inputSha256,
      elevationToleranceM: ELEVATION_TOLERANCE_M,
      curbMethod: "curvature-intervals-v1",
    },
    sources: {
      elevation: terrain.source.url,
      imagery: imageryForLayout(layout).url,
      imageryCredit: imageryForLayout(layout).attribution,
      notes: `Road height is sampled from the existing approximately ${terrain.source.sampleSpacingM} m terrain raster and compressed to a 0.5 m interpolation tolerance relative to those samples; this is not road-surface survey accuracy. Station distances use ${paired ? "the midpoint of corresponding border stations" : "the mapped trace"}, not an official length measurement. ${run ? "This standing-start run begins at the first paired edge station and ends at the last; original timing metadata are retained. Finish speed is unconstrained, with no stopping zone modelled." : layout.metadata.timing?.start ? "The saved start gate sets the simulation origin." : "There is no saved GPS start gate; the simulation begins at the first trace coordinate."} Curbs and bend labels are geometry-based illustrations, not extracted from imagery or verified real curb locations; widths, heights and colours are assumed. Banking is unknown and assumed zero. Source border coordinates retain their separate feature-level licence; invalid cross-sections are interpolated. Imagery is an external display resource subject to provider terms; no image bytes are included.`,
    },
  };
  const road = buildRoad({
    ...layout,
    metadata: { ...layout.metadata, model3d: seed },
  });
  if (road.interpolatedSections / road.points.length > 0.08)
    throw new BorderAlignmentError(
      "Too many invalid border cross-sections; inspect geometry before preparing this layout",
    );
  const elevation = terrainProfile(road, terrain),
    curbs = illustrativeCurbs(road);
  const corners = [
    {
      distanceM: 0,
      name: run
        ? "Run start"
        : layout.metadata.timing?.start
          ? "Start / finish"
          : "Trace start",
    },
    ...(run ? [{ distanceM: length, name: "Finish" }] : []),
    ...curbs
      .filter((c) => c.startM > 0)
      .map((c, i) => ({
        distanceM: Number(((c.startM + c.endM) / 2).toFixed(2)),
        name: `Bend ${i + 1}`,
      })),
  ]
    .sort((a, b) => a.distanceM - b.distanceM)
    .filter((c, i, a) => !i || c.distanceM > a[i - 1].distanceM);
  const result = trackModelSchema.parse({ ...seed, elevation, curbs, corners });
  if (!isLapModel(result)) throw new Error("Expected a lap recipe");
  return result;
}

export class BorderAlignmentError extends Error {}

export function prepareSurfaceModel(
  layout: Layout,
  terrain: ElevationGrid,
  inputSha256: string,
  reason: SurfaceModel3D["reason"],
): SurfaceModel3D {
  // Audit the exact boundary surface, rather than forcing an ambiguous route into a lap.
  const surface = borderRoadGeometry(layout, terrain);
  surface.geometry.dispose();
  const result = trackModelSchema.parse({
    schemaVersion: 1,
    kind: "surface",
    reason,
    bankingDeg: 0,
    quality: {
      stationing: "mapped-trace",
      elevation: "terrain-raster",
      curbs: "geometry-estimated",
      borders: "supplemental-unverified",
    },
    imagery: imageryForLayout(layout),
    terrain,
    curbs: boundaryCurbs(layout),
    curbStyle: { colors: ["#f2f2e7", "#c73732"], stripeLengthM: 2 },
    preparation: {
      version: PREPARATION_VERSION,
      inputSha256,
      elevationToleranceM: ELEVATION_TOLERANCE_M,
      curbMethod: "boundary-curvature-v1",
    },
    sources: {
      elevation: terrain.source.url,
      imagery: imageryForLayout(layout).url,
      imageryCredit: imageryForLayout(layout).attribution,
      notes: `Road surfaces are triangulated directly between this layout's saved road boundaries. Elevation follows the approximately ${terrain.source.sampleSpacingM} m terrain raster, not a survey of the road. Curbs are geometry-based illustrations on curved boundaries; their locations, widths, heights and colours are assumed, not extracted from imagery. Banking is unknown. ${reason === "route-not-closed" ? "The source is an open route or branch network, without one validated closed driving order." : "The source trace and borders have too many unmatched cross-sections for safe lap reconstruction."} Lap playback is unavailable. Boundary coordinates and their separate feature-level licence are preserved. Imagery loads externally on demand; no image bytes or meshes are stored.`,
    },
  });
  if (result.kind !== "surface") throw new Error("Expected a surface recipe");
  return result;
}

export function prepareModel(
  layout: Layout,
  terrain: ElevationGrid,
  inputSha256: string,
): TrackModel3D {
  if (
    !layout.metadata.closed &&
    layout.metadata.geometryKind !== "network" &&
    layout.metadata.borderInference?.edgeConvention === "left-right-along-trace"
  )
    return prepareTrackModel(layout, terrain, inputSha256);
  if (!layout.metadata.closed || layout.metadata.geometryKind === "network")
    return prepareSurfaceModel(
      layout,
      terrain,
      inputSha256,
      "route-not-closed",
    );
  try {
    return prepareTrackModel(layout, terrain, inputSha256);
  } catch (error) {
    if (error instanceof BorderAlignmentError)
      return prepareSurfaceModel(
        layout,
        terrain,
        inputSha256,
        "border-alignment",
      );
    throw error;
  }
}
