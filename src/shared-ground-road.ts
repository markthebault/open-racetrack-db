import { CatmullRomCurve3, Vector3 } from "three";
import type { Layout } from "../schemas/data";
import type { LapModel3D } from "../schemas/track-model";
import type { Road, RoadPoint } from "./lap-simulation";
import { sharedGroundBoundaries } from "./shared-ground-data";
import { assertSeparateSimpleRings, insideRing } from "./boundary-path";
import { groundFootprintFromRings, groundSegmentClearanceM } from "./ribbon-surface";
import { plane, type Position } from "./geo";
import { sampleElevation } from "./elevation";

// Encloses the rendered 1.88 × 4.35 m car in every orientation, including a small margin.
export const GROUND_CAR_RADIUS_M = 2.5;

export function sharedGroundFootprint(layout: Layout, origin: Position) {
  const boundaries = sharedGroundBoundaries(layout), projection = plane(origin),
    to = (p: Position): Position => { const [x, n] = projection.to(p); return [x, -n]; },
    outer = boundaries.outer.map(to), inner = boundaries.inner.map((ring) => ring.map(to));
  assertSeparateSimpleRings([outer, ...inner]);
  if (inner.some((ring, i) => !insideRing(ring[0], outer) ||
      inner.some((other, j) => i !== j && insideRing(ring[0], other))))
    throw new Error("Shared-ground grass islands must be separate holes inside the original outer boundary");
  return { footprint: groundFootprintFromRings([outer], inner), boundaries, projection };
}

function section(rings: Position[][], point: Position, normal: Position): [number, number] {
  let left = Infinity, right = Infinity;
  for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dz = b[1] - a[1],
      denominator = normal[0] * dz - normal[1] * dx;
    if (Math.abs(denominator) < 1e-10) continue;
    const qx = a[0] - point[0], qz = a[1] - point[1],
      across = (qx * dz - qz * dx) / denominator,
      along = (qx * normal[1] - qz * normal[0]) / denominator;
    if (along < 0 || along > 1) continue;
    if (across >= 0) left = Math.min(left, across);
    else right = Math.min(right, -across);
  }
  if (!Number.isFinite(left + right) || Math.min(left, right) < GROUND_CAR_RADIUS_M)
    throw new Error("Shared-ground cross-section does not contain the complete car");
  return [left, right];
}

/** Follow the complete saved source, with no lane recentering, shortcut or independent branch height. */
export function buildSharedGroundRoad(layout: Layout, recipe: LapModel3D): Road {
  const feature = layout.features.find((f) => f.properties.role === "trace")!;
  if (feature.geometry.type !== "LineString" || !recipe.sharedGround)
    throw new Error("Shared ground requires its complete source and reconstruction recipe");
  const trace = feature.geometry.coordinates,
    origin = layout.metadata.timing?.start ?? trace[0],
    { footprint, boundaries, projection } = sharedGroundFootprint(layout, origin),
    raw = trace.slice(0, -1).map((p) => {
      const [x, n] = projection.to(p); return new Vector3(x, 0, -n);
    }), curve = new CatmullRomCurve3(raw, true, "centripetal");
  curve.arcLengthDivisions = 16000;
  const count = Math.ceil(curve.getLength() / 3),
    // Include every exact control parameter, especially both visits to a shared source node.
    parameters = [...new Set([...Array.from({ length: count }, (_, i) => curve.getUtoTmapping(i / count, 0)),
      ...raw.map((_, i) => i / raw.length)])].sort((a, b) => a - b),
    samples = parameters.map((t) => ({ point: curve.getPoint(t), t }));
  let start = 0;
  for (let i = 1; i < samples.length; i++)
    if (samples[i].point.lengthSq() < samples[start].point.lengthSq()) start = i;
  const ordered = [...samples.slice(start), ...samples.slice(0, start)],
    n = ordered.length, rings = footprint.flat(), points: RoadPoint[] = [];
  for (let i = 0; i < n; i++) {
    const { point: p, t } = ordered[i], q = ordered[(i + 1) % n].point,
      tangent = curve.getTangent(t).normalize(), nx = tangent.z, nz = -tangent.x,
      height = sampleElevation(recipe.terrain, projection.from([p.x, -p.z]));
    if (height === null) throw new Error("Terrain does not cover the shared-ground driving path");
    if (groundSegmentClearanceM(footprint, [p.x, p.z], [q.x, q.z]) < GROUND_CAR_RADIUS_M)
      throw new Error("Shared-ground driving segment does not clear the complete car body");
    const [left, right] = section(rings, [p.x, p.z], [nx, nz]);
    points.push({ x: p.x, z: p.z, y: height, nx, nz, left, right,
      s: 0, ds: 0, curvature: 0, grade: 0, sourceStation: t * raw.length });
  }
  let length = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i], q = points[(i + 1) % n];
    p.s = length; p.ds = Math.hypot(q.x - p.x, q.z - p.z, q.y - p.y); length += p.ds;
    if (p.ds < 1e-8) throw new Error("Shared-ground source sampling has a collapsed driving segment");
  }
  const at = (s: number) => {
    s = ((s % length) + length) % length;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (points[mid].s <= s) lo = mid; else hi = mid - 1; }
    const p = points[lo], q = points[(lo + 1) % n], t = (s - p.s) / p.ds;
    return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, y: p.y + (q.y - p.y) * t };
  };
  for (const p of points) {
    const a = at(p.s - 12), c = at(p.s + 12),
      ab = Math.hypot(p.x - a.x, p.z - a.z), bc = Math.hypot(c.x - p.x, c.z - p.z), ac = Math.hypot(c.x - a.x, c.z - a.z);
    p.curvature = 2 * ((p.x - a.x) * (c.z - a.z) - (p.z - a.z) * (c.x - a.x)) / Math.max(1e-6, ab * bc * ac);
    p.grade = (c.y - a.y) / 24;
  }
  return { points, length, step: length / n, origin, recipe, interpolatedSections: 0,
    ground: { footprint, boundaries: { outer: boundaries.outer, inner: boundaries.inner } } };
}
