import { geometryPaths, type Layout } from "../schemas/data";
import type { Road, RoadPoint } from "./lap-simulation";
import { roadHeight } from "./lap-simulation";
import { traceWidthReference } from "./trace-width-geometry";
import { gradeProfileHeight, onBridge } from "./grade-separation";
import { pathCurvatures } from "./path-curvature";
import { plane } from "./geo";
export function runtimeWidth(layout: Layout) {
  const f = layout.features.find((f) => f.properties.role === "inner");
  return f &&
    "method" in f.properties &&
    f.properties.method === "constant-width-trace-v1"
    ? f.properties.widthM
    : undefined;
}
export function buildTraceWidthRoad(layout: Layout, widthM: number): Road {
  const recipe = layout.metadata.model3d;
  if (!recipe || recipe.kind === "surface") throw Error("No playable model");
  const source = geometryPaths(
      layout.features.find((f) => f.properties.role === "trace")!.geometry,
    )[0],
    closed = recipe.kind !== "run",
    reference = traceWidthReference(source, closed, widthM),
    { frames, origin } = reference,
    grade = recipe.gradeSeparation;
  if (grade && grade.stationCount !== frames.length)
    throw Error("Width bridge profile does not match the source grid");
  let start = 0;
  if (closed && layout.metadata.timing?.start) {
    const p = plane(origin).to(layout.metadata.timing.start);
    let nearest = Infinity;
    frames.forEach((f, i) => {
      const d = Math.hypot(f.x - p[0], f.y - p[1]);
      if (d < nearest) {
        nearest = d;
        start = i;
      }
    });
    start =
      (start + Math.round(recipe.startOffsetM / reference.step)) %
      frames.length;
  }
  const points: RoadPoint[] = frames.map((_, j) => {
    const index = closed ? (start + j) % frames.length : j,
      p = frames[index],
      nx = p.nx,
      nz = -p.ny;
    return {
      x: p.x,
      z: -p.y,
      y: grade
        ? gradeProfileHeight(grade, index)
        : roadHeight(
            recipe.elevation,
            (j / (closed ? frames.length : frames.length - 1)) *
              recipe.referenceLengthM,
            closed,
          ),
      nx,
      nz,
      left: widthM / 2,
      right: widthM / 2,
      leftEdge: [p.x + (nx * widthM) / 2, -p.y + (nz * widthM) / 2],
      rightEdge: [p.x - (nx * widthM) / 2, -p.y - (nz * widthM) / 2],
      s: 0,
      ds: 0,
      curvature: 0,
      grade: 0,
      sourceStation: index,
      ...(grade ? { elevated: onBridge(grade, index) } : {}),
    };
  });
  const curvature = pathCurvatures(points, closed, 3);
  let travelled = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      next = points[(i + 1) % points.length];
    p.s = travelled;
    p.ds =
      !closed && i === points.length - 1
        ? 0
        : Math.hypot(next.x - p.x, next.z - p.z, next.y - p.y);
    p.curvature = curvature[i];
    travelled += p.ds;
  }
  for (let i = 0; i < points.length; i++) {
    const a =
        points[
          closed ? (i - 1 + points.length) % points.length : Math.max(0, i - 1)
        ],
      b =
        points[
          closed ? (i + 1) % points.length : Math.min(points.length - 1, i + 1)
        ];
    points[i].grade = (b.y - a.y) / Math.max(1e-6, a.ds + points[i].ds);
  }
  return {
    points,
    length: travelled,
    step: reference.step,
    origin,
    recipe,
    interpolatedSections: 0,
  };
}
