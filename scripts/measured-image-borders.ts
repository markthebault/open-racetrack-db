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
  if (recipe.imageSha256 !== imageSha256)
    throw new Error("Measurement image hash mismatch");
  if (trace.length < 4 || !equal(trace[0], trace.at(-1)!))
    throw new Error("Complete image measurements require one closed route");
  const frames = imageCrossSections(trace),
    { projection, normals, smooth, count, index, step } = frames;
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
      patch.anchors.at(-1)!.station !== count
    )
      throw new Error(
        "Measurements must cover the complete station range and closure",
      );
    if (!equal(patch.anchors[0].coordinate, patch.anchors.at(-1)!.coordinate))
      throw new Error("Measurement closure anchors disagree");
    const anchors = patch.anchors.map((a, j) => {
      if (a.kind !== "image-measured")
        throw new Error(
          "Complete measurements cannot preserve automatic seed joins",
        );
      if (j && (a.station - patch.anchors[j - 1].station) * step > 100)
        throw new Error("Image measurement gap exceeds 100 metres");
      covered(a.coordinate);
      const q = projection.to(a.coordinate),
        p = smooth[index(a.station)],
        normal = normals[index(a.station)],
        dx = q[0] - p[0],
        dy = q[1] - p[1],
        across = dx * normal[0] + dy * normal[1],
        along = dx * normal[1] - dy * normal[0];
      if (Math.abs(along) > 1.5 || Math.abs(across) > 45)
        throw new Error(
          "Image measurement does not match its trace cross-section",
        );
      return { ...a, across, along };
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
        const point = projection.from([
          p[0] + normal[0] * across + normal[1] * along,
          p[1] + normal[1] * across - normal[0] * along,
        ]);
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
  assertSeparateSimpleRings(rings, true);
  if (!insideRing(rings[0][0], rings[1]))
    throw new Error(
      "Measured inner boundary is not nested inside the outer boundary",
    );
  return {
    result,
    step,
    measurement: { ...recipe, resultSha256: borderPairHash(result) },
  };
}
