import { createHash } from "node:crypto";
import type { GradeSeparation } from "../schemas/grade-separation";
import { assertGradeRibbon } from "../src/grade-separation";
import {
  borderRefinementInputSchema,
  type BorderRefinementInput,
} from "../schemas/border-refinement";
import { assertSeparateSimpleRings, insideRing } from "../src/boundary-path";
import { distance, equal, type Position } from "../src/geo";
import {
  imageCrossSections,
  type inferImageBorders,
  type Raster,
} from "./infer-image-borders";

type Borders = Pick<ReturnType<typeof inferImageBorders>, "inner" | "outer">;
export const borderPairHash = (pair: Borders) =>
  createHash("sha256")
    .update(JSON.stringify({ inner: pair.inner, outer: pair.outer }))
    .digest("hex");

/** Sparse, image-measured corrections to a reproducible proposal; never a nominal-width fallback. */
export function refineImageBorders<T extends Borders>(
  seed: T,
  trace: Position[],
  input: BorderRefinementInput,
  image: Raster,
  imageSha256: string,
  options: { open?: boolean; gradeSeparation?: GradeSeparation } = {},
) {
  const open = options.open === true;
  const recipe = borderRefinementInputSchema.parse(input);
  const paired = recipe.method === "paired-image-edge-anchors-v1";
  if (paired && (open || options.gradeSeparation))
    throw new Error("Paired junction refinements require one simple closed road");
  if (
    recipe.imageSha256 !== imageSha256 ||
    recipe.seedSha256 !== borderPairHash(seed)
  )
    throw new Error("Refinement image or seed hash mismatch");
  if (
    equal(trace[0], trace.at(-1)!) === open ||
    seed.inner.length !== seed.outer.length ||
    ![seed.inner, seed.outer].every(
      (p) => p.length > 2 && equal(p[0], p.at(-1)!) !== open,
    )
  )
    throw new Error(
      "Image refinements require paired borders matching the route closure",
    );
  const {
      projection: project,
      smooth,
      normals,
      index,
      step,
    } = imageCrossSections(
      trace,
      open,
      options.gradeSeparation?.sourceStationOffset,
    ),
    result = structuredClone(seed),
    toPixel = (p: Position) => {
      const x = (6378137 * p[0] * Math.PI) / 180,
        y = 6378137 * Math.asinh(Math.tan((p[1] * Math.PI) / 180)),
        [w, s, e, n] = image.extent;
      return [
        ((x - w) / (e - w)) * image.width - 0.5,
        ((n - y) / (n - s)) * image.height - 0.5,
      ];
    };
  if (seed.inner.length !== smooth.length + (open ? 0 : 1))
    throw new Error("Refinement stations do not match the source trace");
  const changedStations = new Set<number>();
  for (const patch of recipe.patches) {
    const points = seed[patch.edge],
      anchors = patch.anchors.map((a, j) => {
        if (paired && j && (a.station - patch.anchors[j - 1].station) * step > 50)
          throw new Error("Paired refinement measurement gap exceeds 50 metres");
        if (a.station >= points.length)
          throw new Error("Refinement station exceeds the seed");
        if (
          a.kind === "preserved-seed" &&
          distance(points[a.station], a.coordinate) > 0.01
        )
          throw new Error("Preserved refinement anchor differs from the seed");
        const [x, y] = toPixel(a.coordinate);
        if (x < 0 || y < 0 || x > image.width - 1 || y > image.height - 1)
          throw new Error("Refinement anchor lies outside the pinned image");
        const ix = Math.round(x),
          iy = Math.round(y),
          alpha =
            image.sample?.(ix, iy)?.[3] ??
            image.data?.[(iy * image.width + ix) * 4 + 3];
        if (alpha === undefined || alpha < 128)
          throw new Error("Refinement anchor has missing image coverage");
        if (distance(points[a.station], a.coordinate) > 30)
          throw new Error("Refinement anchor is too far from the seed edge");
        const p = project.to(a.coordinate),
          base = smooth[index(a.station)],
          normal = normals[index(a.station)],
          d: Position = [p[0] - base[0], p[1] - base[1]];
        return {
          ...a,
          across: d[0] * normal[0] + d[1] * normal[1],
          along: d[0] * normal[1] - d[1] * normal[0],
          point: p,
        };
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
        result[patch.edge][i] = project
          .from(paired ? [
            a.point[0] + (b.point[0] - a.point[0]) * t,
            a.point[1] + (b.point[1] - a.point[1]) * t,
          ] : [
            p[0] + normal[0] * across + normal[1] * along,
            p[1] + normal[1] * across - normal[0] * along,
          ])
          .map((v) => Number(v.toFixed(7))) as Position;
        if (paired) changedStations.add(index(i));
      }
    }
  }
  for (const edge of ["inner", "outer"] as const) {
    const points = result[edge],
      last = points.length - 1,
      firstChanged = !equal(points[0], seed[edge][0]),
      lastChanged = !equal(points[last], seed[edge][last]);
    if (!open && firstChanged && lastChanged && !equal(points[0], points[last]))
      throw new Error("Refinement closure anchors disagree");
    if (!open) {
      if (lastChanged && !firstChanged) points[0] = points[last];
      else points[last] = points[0];
    }
    for (let i = 0; i < points.length; i++) {
      const a = project.to(seed.inner[i]),
        b = project.to(seed.outer[i]),
        p = project.to(points[i]),
        q = project.to(seed[edge][i]),
        width = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!paired &&
        Math.abs(
          ((p[0] - q[0]) * (b[1] - a[1]) - (p[1] - q[1]) * (b[0] - a[0])) /
            width,
        ) > 1.5
      )
        throw new Error(
          "Refinement moves an edge along the route instead of its cross-section",
        );
      const [x, y] = toPixel(points[i]),
        ix = Math.round(x),
        iy = Math.round(y);
      if (
        ix < 0 ||
        iy < 0 ||
        ix >= image.width ||
        iy >= image.height ||
        (image.sample?.(ix, iy)?.[3] ??
          image.data?.[(iy * image.width + ix) * 4 + 3] ??
          0) < 128
      )
        throw new Error("Refined edge has missing pinned-image coverage");
    }
  }
  if (
    result.inner.some(
      (p, i) =>
        distance(p, result.outer[i]) < 3.5 || distance(p, result.outer[i]) > 45,
    )
  )
    throw new Error("Refined borders exceed supported road widths");
  const rings = [result.inner.map(project.to), result.outer.map(project.to)];
  if (paired) {
    const midpoints = rings[0].map((a, i): Position => [
      (a[0] + rings[1][i][0]) / 2, (a[1] + rings[1][i][1]) / 2,
    ]);
    assertSeparateSimpleRings([midpoints], true);
    const area = (path: Position[]) => path.reduce((sum, a, i) => {
      const b = path[(i + 1) % path.length];
      return sum + a[0] * b[1] - a[1] * b[0];
    }, 0);
    const winding = Math.sign(area(smooth));
    if (!winding || winding !== Math.sign(area(midpoints)))
      throw new Error("Paired refinement reverses the retained driving order");
    for (const i of changedStations) {
      const p = midpoints[i], c = smooth[i],
        a = midpoints[index(i - 1)], b = midpoints[index(i + 1)],
        dx = b[0] - a[0], dy = b[1] - a[1],
        wx = rings[1][i][0] - rings[0][i][0],
        wy = rings[1][i][1] - rings[0][i][1],
        tangent = Math.hypot(dx, dy), width = Math.hypot(wx, wy);
      if (Math.hypot(p[0] - c[0], p[1] - c[1]) > 10)
        throw new Error(`Paired refinement departs more than 10 metres from its retained source station ${i}`);
      if (!tangent || winding * (dy * wx - dx * wy) / tangent < width * 0.5)
        throw new Error(`Paired refinement edges do not cross the road in driving order at station ${i}`);
    }
  }
  if (options.gradeSeparation) {
    if (open)
      throw new Error("Grade-separated refinements require closed edges");
    assertGradeRibbon(result, options.gradeSeparation);
  } else assertSeparateSimpleRings(rings, !open);
  if (
    open &&
    rings[0].some((p, i) => {
      const q = rings[1][i],
        normal = normals[i];
      return (p[0] - q[0]) * normal[0] + (p[1] - q[1]) * normal[1] <= 0;
    })
  )
    throw new Error("Refined open borders reverse left/right driving order");
  if (!open && !options.gradeSeparation && !insideRing(rings[0][0], rings[1]))
    throw new Error(
      "Refined inner boundary is not nested inside the outer boundary",
    );
  for (const patch of recipe.patches)
    for (const anchor of patch.anchors)
      if (
        distance(result[patch.edge][anchor.station], anchor.coordinate) > 0.03
      )
        throw new Error("Refinement closure changed a declared anchor");
  return {
    result,
    refinement: { ...recipe, resultSha256: borderPairHash(result) },
  };
}
