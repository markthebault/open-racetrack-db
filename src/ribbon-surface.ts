import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import { equal, type Position } from "./geo";
import { pathCrossings } from "./path-crossings";
import { insideRing } from "./boundary-path";

const area = (ring: Position[]) => ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length];
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

/** Disposable physical footprint. Source order and shared-ground evidence are checked separately. */
export function ribbonFootprint(left: Position[], right: Position[], closed: boolean): MultiPolygon {
  if (left.length !== right.length || left.length < (closed ? 3 : 2) ||
      [...left, ...right].some((p) => p.some((v) => !Number.isFinite(v))))
    throw new Error("Ribbon footprint needs matching finite edge stations");
  const closure = equal(left[0], left.at(-1)!);
  if (closure !== equal(right[0], right.at(-1)!) || (!closed && closure))
    throw new Error("Ribbon footprint edge closure mismatch");
  const n = left.length - (closed && closure ? 1 : 0), polygons: Polygon[] = [];
  for (let i = 0; i < n; i++)
    if (Math.hypot(left[i][0] - right[i][0], left[i][1] - right[i][1]) < 1e-6)
      throw new Error("Ribbon footprint has a zero-width section");
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const j = (i + 1) % n;
    const quad = [left[i], right[i], right[j], left[j]],
      ring = quad.filter((p, k) => !equal(p, quad[(k + 3) % 4]));
    if (ring.length < 3 || Math.abs(area(ring)) < 1e-8 || pathCrossings(ring, true).length)
      throw new Error("Ribbon footprint has folded or degenerate adjacent stations");
    polygons.push([ring]);
  }
  // One MultiPolygon argument avoids spreading large station arrays into function arguments.
  const footprint = polygonClipping.union(polygons);
  if (!footprint.length) throw new Error("Ribbon footprint has no surface");
  return footprint;
}

export function footprintArea(footprint: MultiPolygon) {
  return footprint.reduce((sum, polygon) => sum + Math.abs(area(polygon[0])) -
    polygon.slice(1).reduce((holes, ring) => holes + Math.abs(area(ring)), 0), 0);
}

/** Resolve saved area boundaries without pairing vertices or changing their source coordinates. */
export function groundFootprintFromRings(outer: Position[][], inner: Position[][]): MultiPolygon {
  if (!outer.length || [...outer, ...inner].some((ring) => ring.length < 4 ||
      !equal(ring[0], ring.at(-1)!) || ring.some((p) => p.some((v) => !Number.isFinite(v)))))
    throw new Error("Ground boundaries need finite closed rings");
  const outside = polygonClipping.union(outer.map((ring) => [ring]));
  const footprint = inner.length
    ? polygonClipping.difference(outside, polygonClipping.union(inner.map((ring) => [ring])))
    : outside;
  if (!footprint.length || footprintArea(footprint) <= 1e-8)
    throw new Error("Ground boundaries have no paved area");
  return footprint;
}

function squaredSegmentDistance(point: Position, a: Position, b: Position) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy,
    t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
  return (point[0] - a[0] - t * dx) ** 2 + (point[1] - a[1] - t * dy) ** 2;
}

/** Positive inside pavement, negative in grass or outside. A centre point alone is not car clearance. */
export function groundClearanceM(footprint: MultiPolygon, point: Position) {
  if (!footprint.length || point.some((v) => !Number.isFinite(v)))
    throw new Error("Ground clearance needs a footprint and finite position");
  let squared = Infinity;
  for (const polygon of footprint) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
    squared = Math.min(squared, squaredSegmentDistance(point, ring[i - 1], ring[i]));
  }
  if (!Number.isFinite(squared)) throw new Error("Ground clearance has no boundary segments");
  const inside = footprint.some((polygon) => insideRing(point, polygon[0]) &&
    !polygon.slice(1).some((hole) => insideRing(point, hole)));
  return Math.sqrt(squared) * (inside ? 1 : -1);
}

/** Continuous clearance for a complete driving segment, including intervening grass islands. */
export function groundSegmentClearanceM(footprint: MultiPolygon, a: Position, b: Position) {
  const ends = Math.min(groundClearanceM(footprint, a), groundClearanceM(footprint, b));
  if (ends <= 0) return ends;
  let squared = ends * ends;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const polygon of footprint) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
    const c = ring[i - 1], d = ring[i], ex = d[0] - c[0], ey = d[1] - c[1],
      denominator = dx * ey - dy * ex;
    if (denominator !== 0) {
      const qx = c[0] - a[0], qy = c[1] - a[1],
        t = (qx * ey - qy * ex) / denominator, u = (qx * dy - qy * dx) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
    }
    squared = Math.min(squared, squaredSegmentDistance(a, c, d), squaredSegmentDistance(b, c, d),
      squaredSegmentDistance(c, a, b), squaredSegmentDistance(d, a, b));
  }
  return Math.sqrt(squared);
}

/** Split shared edges together so terrain samples cannot leave cracks between faces. */
function refineGround(points: Vector2[], faces: number[][], maxEdgeM: number) {
  for (let pass = 0; pass < 32; pass++) {
    const midpoints = new Map<string, number>();
    const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
    for (const face of faces) for (let i = 0; i < 3; i++) {
      const a = face[i], b = face[(i + 1) % 3], edge = key(a, b);
      if (points[a].distanceTo(points[b]) <= maxEdgeM || midpoints.has(edge)) continue;
      if (points.length >= 1_000_000) throw new Error("Ground footprint exceeds runtime terrain mesh budget");
      midpoints.set(edge, points.length);
      points.push(points[a].clone().add(points[b]).multiplyScalar(0.5));
    }
    if (!midpoints.size) return faces;
    const next: number[][] = [];
    for (const face of faces) {
      const mids = face.map((a, i) => midpoints.get(key(a, face[(i + 1) % 3]))),
        count = mids.filter((m) => m !== undefined).length;
      if (!count) { next.push(face); continue; }
      // Rotate to the split edge, or to the first of two consecutive split edges.
      const start = mids.findIndex((m, i) => m !== undefined &&
        (count !== 2 || mids[(i + 1) % 3] !== undefined)),
        [a, b, c] = [0, 1, 2].map((i) => face[(start + i) % 3]),
        [ab, bc, ca] = [0, 1, 2].map((i) => mids[(start + i) % 3]);
      if (count === 1) next.push([a, ab!, c], [ab!, b, c]);
      else if (count === 2) next.push([ab!, b, bc!], [a, ab!, c], [ab!, bc!, c]);
      else next.push([a, ab!, ca!], [ab!, b, bc!], [ca!, bc!, c], [ab!, bc!, ca!]);
    }
    faces = next;
  }
  throw new Error("Ground footprint terrain subdivision did not converge");
}

/** One height per physical XY position. No branch-specific height offsets or stored mesh. */
export function triangulateGroundFootprint(
  footprint: MultiPolygon,
  heightAt: (point: Position) => number,
  lift = 0,
  maxEdgeM = 20,
) {
  if (!footprint.length || !Number.isFinite(lift) || !Number.isFinite(maxEdgeM) || maxEdgeM <= 0)
    throw new Error("Ground footprint is empty or invalid");
  const vertices: number[] = [], uv: number[] = [], triangles: number[] = [];
  for (const polygon of footprint) {
    if (!polygon.length || polygon.some((ring) => ring.length < 4 || !equal(ring[0], ring.at(-1)!) ||
      ring.some((p) => p.some((v) => !Number.isFinite(v)))))
      throw new Error("Ground footprint needs finite closed boundary rings");
    const rings = polygon.map((ring) => ring.slice(0, -1).map((p) => new Vector2(...p))),
      points = rings.flat(), offset = vertices.length / 3,
      faces = refineGround(points, ShapeUtils.triangulateShape(rings[0], rings.slice(1)), maxEdgeM);
    for (const p of points) {
      const height = heightAt([p.x, p.y]);
      if (!Number.isFinite(height)) throw new Error("Ground height is unavailable beneath the footprint");
      vertices.push(p.x, height + lift, p.y);
      uv.push(p.x / 4, p.y / 4);
    }
    for (const [a, b, c] of faces) {
      const u = points[a], v = points[b], w = points[c],
        cross = (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
      // East/south coordinates reverse the usual 2D winding when lifted into Three.js.
      triangles.push(offset + a, offset + (cross > 0 ? c : b), offset + (cross > 0 ? b : c));
    }
  }
  if (!triangles.length) throw new Error("Ground footprint has no triangles");
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return { geometry, triangles: triangles.length / 3, areaM2: footprintArea(footprint) };
}
