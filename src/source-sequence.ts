import { CatmullRomCurve3, Vector3 } from "three";
import { sequenceTrace } from "./source-sequence-plan";
export { sequenceTrace } from "./source-sequence-plan";
import type { Layout } from "../schemas/data";
import type { LapModel3D } from "../schemas/track-model";
import type { SourceSequencePlan } from "../schemas/source-sequence";
import { assertRoadContained, roadRings } from "./boundary-path";
import { buildOpenRoad } from "./open-road";
import { buildRoad, type Road, type RoadPoint } from "./lap-simulation";
import { distance, length, nearestEdge, plane, type Position } from "./geo";

/** Physical loop is built once and remains independent of the number of driving passes. */
export function sequenceCycleLayout(
  layout: Layout, recipe: LapModel3D, plan: SourceSequencePlan,
): Layout {
  const { cycle } = sequenceTrace(layout, plan),
    referenceLengthM = recipe.sourceSequence?.cycleElevation.at(-1)![0] ?? length(cycle),
    elevation = recipe.sourceSequence?.cycleElevation ?? [
      [0, 0], [referenceLengthM / 2, 0], [referenceLengthM, 0],
    ];
  return {
    ...layout,
    features: layout.features.map((f) => f.properties.role === "trace"
      ? { ...f, geometry: { type: "LineString" as const, coordinates: cycle } }
      : f),
    metadata: {
      ...layout.metadata, closed: true, timing: undefined,
      lengthM: length(cycle),
      model3d: { ...recipe, kind: "lap", pathMethod: undefined,
        sourceSequence: undefined, startOffsetM: 0,
        referenceLengthM, elevationMethod: "periodic-monotone-cubic", elevation,
        curbs: [], corners: [] },
    },
  };
}

export function sequenceApproachLayout(layout: Layout, recipe: LapModel3D): Layout {
  const sequence = recipe.sourceSequence!;
  return {
    ...layout,
    features: (["inner", "outer"] as const).map((role) => ({
      ...layout.features.find((f) => f.properties.role === role)!,
      geometry: { type: "LineString" as const,
        coordinates: sequence.plan.approach.sections.map((s) => role === "inner" ? s.left : s.right) },
    })),
    metadata: { ...layout.metadata, closed: false,
      model3d: { ...recipe, pathMethod: "paired-border-midpoints", sourceSequence: undefined,
        elevation: sequence.approachElevation,
        referenceLengthM: sequence.approachElevation.at(-1)![0],
        corners: [], curbs: [] } },
  };
}

const centre = (p: RoadPoint): Position => [
  p.x + p.nx * (p.left - p.right) / 2,
  p.z + p.nz * (p.left - p.right) / 2,
];

export function buildSourceSequenceRoad(layout: Layout, recipe: LapModel3D): Road {
  const sequence = recipe.sourceSequence;
  if (!sequence || recipe.kind !== "run") throw new Error("Missing source-sequence run data");
  const { trace, cycle, approach, size } = sequenceTrace(layout, sequence.plan),
    physicalLayout = sequenceCycleLayout(layout, recipe, sequence.plan);
  roadRings(physicalLayout); // Reject crossing or non-nested source rings.
  const physical = buildRoad(physicalLayout);
  if (physical.interpolatedSections || physical.points.some((p) =>
    Math.min(p.left, p.right) <= 0 || Math.abs(p.left - p.right) / 2 > 10))
    throw new Error("Source sequence needs complete source-aligned loop cross-sections");
  assertRoadContained(physicalLayout, physical.points, physical.origin);
  const approachLayout = sequenceApproachLayout(layout, recipe),
    approachRoad = buildOpenRoad(approachLayout, approachLayout.metadata.model3d as LapModel3D),
    projection = plane(physical.origin), local = plane(approachRoad.origin);
  const sections = sequence.plan.approach.sections;
  for (let i = 1; i < sections.length; i++)
    if (Math.max(distance(sections[i - 1].left, sections[i].left),
      distance(sections[i - 1].right, sections[i].right)) > 25)
      throw new Error("Measured approach has an unsupported gap between edge measurements");
  const transform = (p: Position): Position => {
    // Avoid the rounding used for exported geographic coordinates at shared joins.
    const offset = projection.to(approachRoad.origin),
      factor = Math.cos(physical.origin[1] * Math.PI / 180) /
        Math.cos(approachRoad.origin[1] * Math.PI / 180);
    return [offset[0] + p[0] * factor, p[1] - offset[1]];
  };
  const prefix = approachRoad.points.map((p): RoadPoint => {
    const [x, z] = transform([p.x, p.z]);
    return { ...p, x, z, leftEdge: transform(p.leftEdge!), rightEdge: transform(p.rightEdge!) };
  });
  // Each approach point must progress along the saved prefix, within ten metres.
  const sourceDistances = [0];
  for (let i = 1; i < approach.length; i++)
    sourceDistances.push(sourceDistances[i - 1] + distance(approach[i - 1], approach[i]));
  let previous = -Infinity;
  for (const p of approachRoad.points) {
    const left = p.leftEdge!;
    if ((left[0] - p.x) * p.nx + (left[1] - p.z) * p.nz <= 0)
      throw new Error("Measured approach edges are reversed or cross the driving path");
    const hit = nearestEdge(local.from([p.x, -p.z]), approach),
      station = sourceDistances[hit.index] + hit.t * (sourceDistances[hit.index + 1] - sourceDistances[hit.index]);
    if (hit.displacementM > 10 || station < previous - 0.1)
      throw new Error("Measured approach leaves or reverses the saved source prefix");
    previous = station;
  }
  const join = physical.points[0], end = prefix.at(-1)!,
    edges = (p: RoadPoint) => [
      p.leftEdge ?? [p.x + p.nx * p.left, p.z + p.nz * p.left],
      p.rightEdge ?? [p.x - p.nx * p.right, p.z - p.nz * p.right],
    ];
  for (let side = 0; side < 2; side++)
    if (Math.hypot(edges(join)[side][0] - edges(end)[side][0], edges(join)[side][1] - edges(end)[side][1]) > 0.15)
      throw new Error("Measured approach does not meet the inherited loop edges");
  if (distance(local.from([approachRoad.points[0].x, -approachRoad.points[0].z]), trace[0]) > 10)
    throw new Error("Measured approach omits the saved source start");
  // Render the approach plus one physical circuit. Later passes reuse exactly these points.
  const points = prefix.slice(0, -1), loop = physical.points,
    renderSegmentCount = points.length + loop.length,
    fullPasses = Math.floor((trace.length - 1 - sequence.plan.cycleStartIndex) / size),
    remainder = (trace.length - 1 - sequence.plan.cycleStartIndex) % size;
  for (let lap = 0; lap < fullPasses; lap++) points.push(...loop.map((p) => ({ ...p })));
  if (remainder) {
    // Convert the last literal source vertex to the same curve's arc station.
    const raw = cycle.slice(0, -1).map((p) => {
      const [x, north] = projection.to(p); return new Vector3(x, 0, -north);
    }), curve = new CatmullRomCurve3(raw, true, "centripetal");
    curve.arcLengthDivisions = 16000;
    const lengths = curve.getLengths(), t = remainder / size * curve.arcLengthDivisions,
      i = Math.floor(t), arc = lengths[i] + (lengths[i + 1] - lengths[i]) * (t - i),
      sample = arc / curve.getLength() * loop.length,
      last = Math.floor(sample), fraction = sample - last;
    points.push(...loop.slice(0, last + 1).map((p) => ({ ...p })));
    if (fraction > 1e-9) {
      const a = loop[last], b = loop[(last + 1) % loop.length],
        lerp = (x: number, y: number) => x + (y - x) * fraction,
        aEdges = edges(a), bEdges = edges(b),
        edge = (side: number): Position => [lerp(aEdges[side][0], bEdges[side][0]), lerp(aEdges[side][1], bEdges[side][1])],
        leftEdge = edge(0), rightEdge = edge(1),
        width = Math.hypot(leftEdge[0] - rightEdge[0], leftEdge[1] - rightEdge[1]);
      points.push({ ...a, x: (leftEdge[0] + rightEdge[0]) / 2,
        z: (leftEdge[1] + rightEdge[1]) / 2, y: lerp(a.y, b.y),
        left: width / 2, right: width / 2,
        nx: (leftEdge[0] - rightEdge[0]) / width, nz: (leftEdge[1] - rightEdge[1]) / width,
        leftEdge, rightEdge });
    }
  } else points.push({ ...loop[0] });
  let travelled = 0;
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (const [i, p] of points.entries()) {
    p.s = travelled;
    const a = centre(p), b = centre(at(i + 1));
    p.ds = i === points.length - 1 ? 0 : Math.hypot(b[0] - a[0], b[1] - a[1], at(i + 1).y - p.y);
    if (i < points.length - 1 && p.ds < 1e-6) throw new Error("Source sequence contains a zero-length join");
    travelled += p.ds;
    const u = centre(at(i - 4)), v = centre(at(i + 4)),
      ab = Math.hypot(a[0] - u[0], a[1] - u[1]),
      bc = Math.hypot(v[0] - a[0], v[1] - a[1]),
      ac = Math.hypot(v[0] - u[0], v[1] - u[1]);
    p.curvature = 2 * ((a[0] - u[0]) * (v[1] - u[1]) - (a[1] - u[1]) * (v[0] - u[0])) /
      Math.max(1e-6, ab * bc * ac);
  }
  for (let i = 0; i < points.length; i++) {
    const a = at(i - 1), b = at(i + 1);
    points[i].grade = (b.y - a.y) / Math.max(1e-9, b.s - a.s);
  }
  const last = centre(points.at(-1)!);
  if (distance(projection.from([last[0], -last[1]]), trace.at(-1)!) > 10)
    throw new Error("Source sequence omits the saved finish");
  return { points, length: travelled, step: travelled / (points.length - 1),
    origin: physical.origin, recipe, interpolatedSections: 0, renderSegmentCount };
}

