import {widthCorridor} from "./width-corridor";
import type { Position } from "./geo";
import { traceWidthReference, widthEdges } from "./trace-width-geometry";
import { pathCurvatures } from "./path-curvature";
import { IDEAL_CAR } from "./ideal-line-model";
import { roadHeight } from "./road-height";
import { gradeProfileHeight } from "./grade-separation";
import type { GradeSeparation } from "../schemas/grade-separation";
import { plane } from "./geo";
import { optimizeTrajectory } from "./trajectory-qp";
export interface WidthCalculationInput {
  trace: Position[];
  closed: boolean;
  widthM: number;
  leftRight: boolean;
  sourceLicenses: string[];
  elevation?: {
    anchors: [number, number][];
    referenceLengthM: number;
    start?: Position;
    startOffsetM: number;
    gradeSeparation?: GradeSeparation;
  };
}
export function calculateTraceWidth(input: WidthCalculationInput) {
  if (!Number.isFinite(input.widthM) || input.widthM < 3 || input.widthM > 45)
    throw Error("Unsupported road width");
  const started = performance.now(),
    reference = traceWidthReference(input.trace, input.closed, input.widthM),
    { frames } = reference,
    n = frames.length,
    half = input.widthM / 2,
    margin = 0.1;
  const index = (i: number) =>
    input.closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i));
  const curvature = pathCurvatures(
    frames.map((p) => ({ x: p.x, z: -p.y })),
    input.closed,
    3,
  );
  const pinched = curvature.flatMap((k, i) =>
    Math.abs(k) * half >= 0.98 ? [i] : [],
  );
  if (pinched.length)
    throw Error(
      `The mapped trace has ${pinched.length} samples too tight for a ${input.widthM} m offset. Width remains stored; estimated edges are unavailable for this layout.`,
    );
  const elevation = input.elevation;
  let start = 0;
  if (input.closed && elevation?.start) {
    const p = plane(reference.origin).to(elevation.start);
    let nearest = Infinity;
    frames.forEach((f, i) => {
      const d = Math.hypot(f.x - p[0], f.y - p[1]);
      if (d < nearest) {
        nearest = d;
        start = i;
      }
    });
    start = (start + Math.round(elevation.startOffsetM / reference.step)) % n;
  }
  const height = (i: number) =>
    !elevation
      ? 0
      : elevation.gradeSeparation
        ? gradeProfileHeight(elevation.gradeSeparation, i)
        : roadHeight(
            elevation.anchors,
            ((input.closed ? (i - start + n) % n : i) /
              (input.closed ? n : n - 1)) *
              elevation.referenceLengthM,
            input.closed,
          );
  const edges = widthEdges(reference, input.widthM, input.closed),
    stations = frames.map((p, i) => ({
      x: p.x,
      z: -p.y,
      y: height(i),
      nx: p.nx,
      nz: -p.ny,
      halfWidth: half,
    }));
  for (let i = 0; i < (input.closed ? n : n - 1); i++) {
    const a = frames[i],
      b = frames[index(i + 1)],
      dx = b.x - a.x,
      dy = b.y - a.y;
    for (const side of [-1, 1]) {
      const vx = b.x + side * b.nx * half - a.x - side * a.nx * half,
        vy = b.y + side * b.ny * half - a.y - side * a.ny * half;
      if (vx * dx + vy * dy <= 0)
        throw Error(
          "The mapped reference cannot form an unfolded constant-width corridor",
        );
    }
  }
  const projection=plane(reference.origin),planar=(p:Position):Position=>{const xy=projection.to(p);return[xy[0],-xy[1]];};
  const corridor=widthCorridor(edges.left.slice(0,n).map(planar),edges.right.slice(0,n).map(planar),stations,input.closed,reference.step,input.widthM,IDEAL_CAR.widthM,margin);
  const feasible=corridor.feasible;
  const result = optimizeTrajectory(stations, input.closed, IDEAL_CAR, {
    feasible,
  });
  const coordinates = result.points.map((p) =>
    reference.geographic([p.x, -p.z]),
  );
  if (input.closed) coordinates.push(coordinates[0]);
  const area = frames.reduce((s, p, i) => {
      const q = frames[(i + 1) % n];
      return s + p.x * q.y - q.x * p.y;
    }, 0),
    innerLeft = input.leftRight || !input.closed || area > 0;
  const feature = (role: "inner" | "outer", side: "left" | "right") => ({
    type: "Feature" as const,
    id: role,
    properties: {
      role,
      sourceIds: [],
      license: "LicenseRef-Trace-Width-Corridor" as const,
      estimated: true as const,
      method: "constant-width-trace-v1" as const,
      widthM: input.widthM,
      side,
      edgeConvention:
        input.leftRight || !input.closed
          ? ("left-right" as const)
          : ("inner-outer" as const),
      sourceLicenses: input.sourceLicenses,
    },
    geometry: { type: "LineString" as const, coordinates: edges[side] },
  });
  return {
    features: [
      feature("inner", innerLeft ? "left" : "right"),
      feature("outer", innerLeft ? "right" : "left"),
      {
        type: "Feature" as const,
        id: "ideal",
        properties: {
          role: "ideal" as const,
          sourceIds: [],
          estimated: true as const,
          method: "trace-width-lap-time-v2" as const,
          edgeMarginM: margin,
          borderLicenses: [
            "LicenseRef-Trace-Width-Corridor",
            ...input.sourceLicenses,
          ],
          localRefinement: {
            bounds: [
              Math.min(...input.trace.map((p) => p[0])),
              Math.min(...input.trace.map((p) => p[1])),
              Math.max(...input.trace.map((p) => p[0])),
              Math.max(...input.trace.map((p) => p[1])),
            ] as [number, number, number, number],
            maximumStepM: reference.step,
            curvatureWindowM: 3,
          },
        },
        geometry: { type: "LineString" as const, coordinates },
      },
    ],
    elapsedMs: performance.now() - started,
    referencePoints: n,
    maximumReferenceShiftM: reference.maximumReferenceShiftM,
    repairCount: 0,
    optimization: result.diagnostics,
  };
}
