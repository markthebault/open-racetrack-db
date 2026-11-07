import {
  borderMeasurementInputSchema,
  type BorderMeasurementInput,
} from "../schemas/border-refinement";
import { imageCrossSections, type Raster } from "./infer-image-borders";
import { borderPairHash } from "./refine-image-borders";
import { assertSeparateSimpleRings, insideRing } from "../src/boundary-path";
import { distance, equal, type Position } from "../src/geo";
/** Complete, sparse image anchors. No automatic seed, nominal width or filled image pixels. */
export function measuredImageBorders(
  trace: Position[],
  input: BorderMeasurementInput,
  imageSha256: string,
  image?: Raster,
) {
  const recipe = borderMeasurementInputSchema.parse(input);
  const run = recipe.routeKind === "run";
  if (recipe.imageSha256 !== imageSha256)
    throw new Error("Measurement image hash mismatch");
  if (run && (trace.length < 2 || equal(trace[0], trace.at(-1)!)))
    throw new Error("Open run measurements require distinct source endpoints");
  if (!run && (trace.length < 4 || !equal(trace[0], trace.at(-1)!)))
    throw new Error("Complete image measurements require one closed route");
  const frames = imageCrossSections(trace, run),
    { projection, normals, smooth, count, index, step } = frames,
    lastStation = run ? count - 1 : count,
    paired = recipe.method === "paired-image-edge-anchors-v1";
  if (
    recipe.patches.length !== 2 ||
    new Set(recipe.patches.map((p) => p.edge)).size !== 2
  )
    throw new Error("Measurements require one complete patch per edge");
  const result: {
    inner: Position[];
    outer: Position[];
  } = { inner: [], outer: [] };
  const covered = (p: Position) => {
    if (!image) return;
    const [w, s, e, n] = image.extent,
      x =
        (((6378137 * p[0] * Math.PI) / 180 - w) / (e - w)) * image.width - 0.5,
      y =
        ((n - 6378137 * Math.asinh(Math.tan((p[1] * Math.PI) / 180))) /
          (n - s)) *
          image.height -
        0.5;
    if (x < 0 || y < 0 || x >= image.width - 1 || y >= image.height - 1)
      throw new Error("Measured edge lies outside the pinned image");
    for (const dx of [0, 1])
      for (const dy of [0, 1]) {
        const ix = Math.floor(x) + dx,
          iy = Math.floor(y) + dy;
        if (
          (image.sample?.(ix, iy)?.[3] ??
            image.data?.[(iy * image.width + ix) * 4 + 3] ??
            0) < 128
        )
          throw new Error("Measured edge has missing pinned-image coverage");
      }
  };
  for (const patch of recipe.patches) {
    if (
      patch.anchors[0].station !== 0 ||
      patch.anchors.at(-1)!.station !== lastStation
    )
      throw new Error(
        "Measurements must cover the complete station range and closure",
      );
    const sameEndpoints = equal(
      patch.anchors[0].coordinate,
      patch.anchors.at(-1)!.coordinate,
    );
    if (run && sameEndpoints)
      throw new Error("Open measurement edges must keep separate endpoints");
    if (!run && !sameEndpoints)
      throw new Error("Measurement closure anchors disagree");
    const anchors = patch.anchors.map((a, j) => {
      if (a.kind !== "image-measured")
        throw new Error(
          "Complete measurements cannot preserve automatic seed joins",
        );
      const maximumGapM = recipe.interpolation === "edge-linear-v1" ? 50 : 100;
      if (j && (a.station - patch.anchors[j - 1].station) * step > maximumGapM)
        throw new Error(`Image measurement gap exceeds ${maximumGapM} metres`);
      covered(a.coordinate);
      const q = projection.to(a.coordinate),
        p = smooth[index(a.station)],
        normal = normals[index(a.station)],
        dx = q[0] - p[0],
        dy = q[1] - p[1],
        across = dx * normal[0] + dy * normal[1],
        along = dx * normal[1] - dy * normal[0];
      if (
        paired
          ? Math.hypot(dx, dy) > 45
          : Math.abs(along) > 1.5 || Math.abs(across) > 45
      )
        throw new Error(
          "Image measurement does not match its trace cross-section",
        );
      return { ...a, across, along, point: q };
    });
    for (let j = 1; j < anchors.length; j++) {
      const a = anchors[j - 1],
        b = anchors[j];
      for (let i = a.station; i <= b.station; i++) {
        const t = (i - a.station) / (b.station - a.station),
          p = smooth[index(i)],
          normal = normals[index(i)],
          across = a.across * (1 - t) + b.across * t,
          along = a.along * (1 - t) + b.along * t;
        const point = projection.from(
          recipe.interpolation === "edge-linear-v1"
            ? [
                a.point[0] + (b.point[0] - a.point[0]) * t,
                a.point[1] + (b.point[1] - a.point[1]) * t,
              ]
            : [
                p[0] + normal[0] * across + normal[1] * along,
                p[1] + normal[1] * across - normal[0] * along,
              ],
        );
        covered(point);
        result[patch.edge][i] = point;
      }
    }
    for (const a of patch.anchors)
      if (distance(result[patch.edge][a.station], a.coordinate) > 0.03)
        throw new Error("Reconstruction changed an image measurement");
  }
  if (
    result.inner.some(
      (p, i) =>
        distance(p, result.outer[i]) < 3.5 || distance(p, result.outer[i]) > 45,
    )
  )
    throw new Error("Measured borders exceed supported road widths");
  const rings = [
    result.inner.map(projection.to),
    result.outer.map(projection.to),
  ];
  if (paired) {
    // Image pairs define their own road section; old source normals do not move them.
    // The retained source route still bounds displacement and driving identity.
    const midpoints = rings[0].map(
      (a, i): Position => [
        (a[0] + rings[1][i][0]) / 2,
        (a[1] + rings[1][i][1]) / 2,
      ],
    );
    if (
      midpoints.some(
        (p, i) =>
          Math.hypot(p[0] - smooth[index(i)][0], p[1] - smooth[index(i)][1]) >
          10,
      )
    )
      throw new Error(
        "Image-paired road departs more than 10 metres from its retained source station",
      );
    const area = (path: Position[]) =>
        path.reduce((s, p, i) => {
          const q = path[(i + 1) % path.length];
          return s + p[0] * q[1] - p[1] * q[0];
        }, 0),
      winding = Math.sign(area(midpoints));
    if (!winding || winding !== Math.sign(area(smooth)))
      throw new Error("Image-paired road reverses its retained driving order");
    assertSeparateSimpleRings([midpoints], true);
    const inner = recipe.patches.find((p) => p.edge === "inner")!;
    for (const anchor of inner.anchors.slice(0, -1)) {
      const i = anchor.station,
        a = midpoints[index(i - 1)],
        b = midpoints[index(i + 1)],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        tangent = Math.hypot(dx, dy),
        wx = rings[1][i][0] - rings[0][i][0],
        wy = rings[1][i][1] - rings[0][i][1],
        width = Math.hypot(wx, wy),
        outward = (winding * (dy * wx - dx * wy)) / tangent;
      if (!tangent || outward < width * 0.5)
        throw new Error(
          `Image edge pairs do not cross their measured road in driving order at station ${i}`,
        );
    }
  }
  if (run) {
    const midpoints = rings[0].map(
      (p, i): Position => [
        (p[0] + rings[1][i][0]) / 2,
        (p[1] + rings[1][i][1]) / 2,
      ],
    );
    if (
      midpoints.some(
        (p, i) => Math.hypot(p[0] - smooth[i][0], p[1] - smooth[i][1]) > 10,
      )
    )
      throw new Error(
        "Measured open road departs more than 10 metres from its source",
      );
    if (
      rings[0].some((p, i) => {
        const q = rings[1][i],
          n = normals[index(i)];
        return (p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1] < 3.5;
      })
    )
      throw new Error("Open measurements must retain driver-left/right order");
    assertSeparateSimpleRings([midpoints], false);
  }
  assertSeparateSimpleRings(rings, !run);
  if (!run && !insideRing(rings[0][0], rings[1]))
    throw new Error(
      "Measured inner boundary is not nested inside the outer boundary",
    );
  return {
    result,
    step,
    measurement: { ...recipe, resultSha256: borderPairHash(result) },
  };
}
