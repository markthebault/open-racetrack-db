import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
  Color,
} from "three";
import { geometryPaths, type Layout } from "../schemas/data";
import type { SurfaceModel3D } from "../schemas/track-model";
import { plane, length, equal, type Position } from "./geo";
import { sampleElevation, type ElevationGrid } from "./elevation";

export function borderPaths(layout: Layout) {
  return layout.features
    .filter(
      (f) => f.properties.role === "inner" || f.properties.role === "outer",
    )
    .flatMap((f) =>
      geometryPaths(f.geometry).map((points, pathIndex) => ({
        role: f.properties.role as "inner" | "outer",
        pathIndex,
        points,
      })),
    );
}
function closedRing(points: Position[]) {
  return points.slice(0, -1);
}

/** Triangulate the saved rings themselves, preserving branches without inventing their driving order. */
export function borderFootprint(layout: Layout) {
  const origin: Position = [
      (layout.bbox[0] + layout.bbox[2]) / 2,
      (layout.bbox[1] + layout.bbox[3]) / 2,
    ],
    project = plane(origin);
  const inner = borderPaths(layout).filter((p) => p.role === "inner"),
    outer = borderPaths(layout).filter((p) => p.role === "outer");
  if (inner.length !== outer.length || !inner.length)
    throw new Error("Border paths cannot be paired");
  const points: Position[] = [],
    triangles: number[] = [];
  for (let i = 0; i < outer.length; i++) {
    if (
      layout.metadata.borderInference?.edgeConvention ===
      "left-right-along-trace"
    ) {
      const a = outer[i].points,
        b = inner[i].points,
        offset = points.length;
      if (a.length !== b.length)
        throw new Error("Open-road edges must have matching stations");
      for (let j = 0; j < a.length; j++) points.push(a[j], b[j]);
      for (let j = 0; j < a.length - 1; j++) {
        const k = offset + j * 2;
        triangles.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
      continue;
    }
    const a = closedRing(outer[i].points),
      b = closedRing(inner[i].points);
    const av = a.map((p) => new Vector2(...project.to(p))),
      bv = b.map((p) => new Vector2(...project.to(p)));
    const swap = Math.abs(ShapeUtils.area(av)) < Math.abs(ShapeUtils.area(bv));
    const outside = swap ? bv : av,
      inside = swap ? av : bv,
      offset = points.length;
    const faces = ShapeUtils.triangulateShape(outside, [inside]);
    points.push(...(swap ? b : a), ...(swap ? a : b));
    for (const face of faces) triangles.push(...face.map((j) => j + offset));
  }
  if (!triangles.length)
    throw new Error("Saved borders have no triangulatable road surface");
  return { origin, points, triangles };
}
export function borderRoadGeometry(layout: Layout, grid: ElevationGrid) {
  const footprint = borderFootprint(layout),
    project = plane(footprint.origin),
    vertices: number[] = [],
    valid: boolean[] = [];
  for (const point of footprint.points) {
    const [x, north] = project.to(point),
      height = sampleElevation(grid, point);
    valid.push(height !== null);
    vertices.push(x, height ?? 0, -north);
  }
  const triangles: number[] = [];
  for (let i = 0; i < footprint.triangles.length; i += 3) {
    const face = footprint.triangles.slice(i, i + 3);
    if (face.every((j) => valid[j])) triangles.push(...face);
  }
  if (!triangles.length)
    throw new Error("Terrain does not cover the saved road boundaries");
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return {
    geometry,
    origin: footprint.origin,
    triangles: triangles.length / 3,
    missingVertices: valid.filter((v) => !v).length,
  };
}

export function boundarySamples(
  path: Position[],
  origin: Position,
  spacing = 5,
) {
  const closed = equal(path[0], path.at(-1)!);
  const project = plane(origin),
    points = path.map((p) => {
      const [x, north] = project.to(p);
      return { x, z: -north };
    }),
    stations = [0];
  for (let i = 1; i < points.length; i++)
    stations.push(
      stations[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].z - points[i - 1].z,
        ),
    );
  const planarLength = stations.at(-1)!,
    referenceLength = length(path),
    count = Math.max(3, Math.ceil(planarLength / spacing)) + (closed ? 0 : 1),
    samples = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const d = (i / (closed ? count : count - 1)) * planarLength;
    while (segment < stations.length - 2 && stations[segment + 1] < d)
      segment++;
    const t =
      (d - stations[segment]) /
      Math.max(1e-9, stations[segment + 1] - stations[segment]);
    samples.push({
      x: points[segment].x + (points[segment + 1].x - points[segment].x) * t,
      z: points[segment].z + (points[segment + 1].z - points[segment].z) * t,
      s: (i / (closed ? count : count - 1)) * referenceLength,
    });
  }
  return { samples, length: referenceLength, closed };
}
/** Explicitly illustrative intervals on source boundaries, used only for layouts without a safe lap path. */
export function boundaryCurbs(layout: Layout): SurfaceModel3D["curbs"] {
  const origin: Position = [
      (layout.bbox[0] + layout.bbox[2]) / 2,
      (layout.bbox[1] + layout.bbox[3]) / 2,
    ],
    curbs: SurfaceModel3D["curbs"] = [];
  for (const path of borderPaths(layout)) {
    const { samples, length, closed } = boundarySamples(path.points, origin),
      n = samples.length,
      step = length / (closed ? n : n - 1);
    const index = (i: number) =>
      closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i));
    const curved = samples.map((b, i) => {
      const a = samples[index(i - 2)],
        c = samples[index(i + 2)];
      const k =
        (2 * ((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))) /
        Math.max(
          1e-6,
          Math.hypot(b.x - a.x, b.z - a.z) *
            Math.hypot(c.x - b.x, c.z - b.z) *
            Math.hypot(c.x - a.x, c.z - a.z),
        );
      return Math.abs(k) > 1 / 250;
    });
    for (let i = 0; i < n; i++)
      if (curved[i]) {
        const start = i;
        while (i < n && curved[i]) i++;
        if ((i - start) * step >= 12)
          curbs.push({
            role: path.role,
            pathIndex: path.pathIndex,
            startM: Number((start * step).toFixed(2)),
            endM: Number(Math.min(length, i * step).toFixed(2)),
            widthM: 1,
            heightM: 0.08,
          });
      }
  }
  return curbs;
}
export function boundaryCurbGeometry(layout: Layout, model: SurfaceModel3D) {
  const origin: Position = [
      (layout.bbox[0] + layout.bbox[2]) / 2,
      (layout.bbox[1] + layout.bbox[3]) / 2,
    ],
    project = plane(origin),
    vertices: number[] = [],
    colors: number[] = [];
  for (const path of borderPaths(layout)) {
    const intervals = model.curbs.filter(
      (c) => c.role === path.role && c.pathIndex === path.pathIndex,
    );
    if (!intervals.length) continue;
    const { samples, closed } = boundarySamples(path.points, origin, 3),
      n = samples.length;
    const index = (i: number) =>
      closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i));
    const area = samples.reduce((a, p, i) => {
      const q = samples[(i + 1) % n];
      return a + p.x * q.z - q.x * p.z;
    }, 0);
    const sign = closed
      ? Math.sign(area) * (path.role === "outer" ? 1 : -1)
      : path.role === "inner"
        ? 1
        : -1;
    const edge = (i: number, width: number) => {
      const p = samples[index(i)],
        a = samples[index(i - 1)],
        b = samples[index(i + 1)],
        d = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = ((b.z - a.z) / Math.max(d, 1e-9)) * sign,
        nz = (-(b.x - a.x) / Math.max(d, 1e-9)) * sign;
      const h = sampleElevation(model.terrain, project.from([p.x, -p.z]));
      return h === null
        ? undefined
        : [
            [p.x, h + 0.08, p.z],
            [p.x + nx * width, h + 0.08, p.z + nz * width],
          ];
    };
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const interval = intervals.find(
        (c) => samples[i].s >= c.startM && samples[i].s < c.endM,
      );
      if (!interval) continue;
      const a = edge(i, interval.widthM),
        b = edge((i + 1) % n, interval.widthM);
      if (!a || !b) continue;
      const corners = [...a, ...b],
        color = new Color(
          model.curbStyle.colors[
            Math.floor(samples[i].s / model.curbStyle.stripeLengthM) % 2
          ],
        );
      for (const j of [0, 2, 1, 1, 2, 3]) {
        const p = corners[j];
        vertices.push(p[0], p[1] + interval.heightM, p[2]);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return { geometry, origin };
}
