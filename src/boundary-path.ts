import { geometryPaths, type Layout } from "../schemas/data";
import { equal, plane, type Position } from "./geo";

const cross = (a: Position, b: Position) => a[0] * b[1] - a[1] * b[0];
const subtract = (a: Position, b: Position): Position => [
  a[0] - b[0],
  a[1] - b[1],
];
export function insideRing(p: Position, ring: Position[]) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      b = ring[i];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function signedArea(ring: Position[]) {
  return ring.slice(1).reduce((sum, p, i) => sum + cross(ring[i], p), 0) / 2;
}
function assertSeparateSimpleRings(rings: Position[][]) {
  type Edge = { a: Position; b: Position; ring: number; index: number };
  const grid = new Map<string, Edge[]>(),
    size = 32;
  function on(p: Position, a: Position, b: Position) {
    return (
      Math.abs(cross(subtract(p, a), subtract(b, a))) < 1e-7 &&
      p[0] >= Math.min(a[0], b[0]) &&
      p[0] <= Math.max(a[0], b[0]) &&
      p[1] >= Math.min(a[1], b[1]) &&
      p[1] <= Math.max(a[1], b[1])
    );
  }
  for (const [ring, points] of rings.entries())
    for (let index = 1; index < points.length; index++) {
      const edge: Edge = {
          a: points[index - 1],
          b: points[index],
          ring,
          index,
        },
        candidates = new Set<Edge>(),
        keys: string[] = [];
      for (
        let x = Math.floor(Math.min(edge.a[0], edge.b[0]) / size);
        x <= Math.floor(Math.max(edge.a[0], edge.b[0]) / size);
        x++
      )
        for (
          let y = Math.floor(Math.min(edge.a[1], edge.b[1]) / size);
          y <= Math.floor(Math.max(edge.a[1], edge.b[1]) / size);
          y++
        ) {
          const key = `${x},${y}`;
          keys.push(key);
          for (const previous of grid.get(key) ?? []) candidates.add(previous);
        }
      for (const other of candidates) {
        if (
          other.ring === ring &&
          (index - other.index === 1 ||
            index - other.index === points.length - 2)
        )
          continue;
        const a = cross(subtract(edge.b, edge.a), subtract(other.a, edge.a)),
          b = cross(subtract(edge.b, edge.a), subtract(other.b, edge.a)),
          c = cross(subtract(other.b, other.a), subtract(edge.a, other.a)),
          d = cross(subtract(other.b, other.a), subtract(edge.b, other.a));
        if (
          (a * b < 0 && c * d < 0) ||
          on(edge.a, other.a, other.b) ||
          on(edge.b, other.a, other.b) ||
          on(other.a, edge.a, edge.b) ||
          on(other.b, edge.a, edge.b)
        )
          throw new Error(
            "Boundary rings cross or touch; driving order needs review",
          );
      }
      for (const key of keys) {
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(edge);
      }
    }
}
export function roadRings(layout: Layout) {
  const trace = layout.features.find((f) => f.properties.role === "trace");
  if (!trace || trace.geometry.type !== "LineString")
    throw new Error("Boundary path needs a continuous source route");
  const project = plane(trace.geometry.coordinates[0]);
  const rings = ["inner", "outer"]
    .map((role) => {
      const f = layout.features.find((f) => f.properties.role === role);
      if (
        !f ||
        f.geometry.type !== "LineString" ||
        !equal(f.geometry.coordinates[0], f.geometry.coordinates.at(-1)!)
      )
        throw new Error("Boundary path needs two continuous closed rings");
      return f.geometry.coordinates.map(project.to);
    })
    .sort((a, b) => Math.abs(signedArea(a)) - Math.abs(signedArea(b)));
  assertSeparateSimpleRings(rings);
  if (!insideRing(rings[0][0], rings[1]))
    throw new Error("Boundary rings are not nested");
  return { project, inner: rings[0], outer: rings[1] };
}

/** Opt-in reconstruction from unpaired boundary vertices, without moving either source edge. */
export function boundaryNormalMidline(layout: Layout): Position[] {
  if (!layout.metadata.closed || layout.metadata.geometryKind === "network")
    throw new Error("Boundary path requires a single closed route");
  const { project, inner, outer } = roadRings(layout);
  const segments = inner
    .slice(1)
    .map((b, i) => ({
      a: inner[i],
      b,
      length: Math.hypot(...subtract(b, inner[i])),
    }));
  const length = segments.reduce((sum, s) => sum + s.length, 0);
  if (length < 30 || length > 30000)
    throw new Error("Unsupported boundary path length");
  const count = Math.ceil(length / 3),
    step = length / count;
  function sample(s: number): Position {
    s = ((s % length) + length) % length;
    for (const segment of segments) {
      if (s <= segment.length && segment.length > 0) {
        const t = s / segment.length;
        return [
          segment.a[0] + t * (segment.b[0] - segment.a[0]),
          segment.a[1] + t * (segment.b[1] - segment.a[1]),
        ];
      }
      s -= segment.length;
    }
    return inner[0];
  }
  const sign = signedArea(inner) > 0 ? 1 : -1,
    mid: Position[] = [];
  for (let i = 0; i < count; i++) {
    const s = i * step,
      p = sample(s),
      tangent = subtract(sample(s + 6), sample(s - 6)),
      norm = Math.hypot(...tangent);
    if (norm < 1) throw new Error("Boundary path has an ambiguous turn");
    const n: Position = [
      (sign * tangent[1]) / norm,
      (-sign * tangent[0]) / norm,
    ];
    let width = Infinity;
    for (let j = 1; j < outer.length; j++) {
      const edge = subtract(outer[j], outer[j - 1]),
        den = cross(n, edge);
      if (Math.abs(den) < 1e-9) continue;
      const q = subtract(outer[j - 1], p),
        distance = cross(q, edge) / den,
        u = cross(q, n) / den;
      if (distance > 0 && u >= 0 && u <= 1) width = Math.min(width, distance);
    }
    if (width < 3 || width > 45)
      throw new Error("Boundary path cannot establish a supported road width");
    const m: Position = [p[0] + (n[0] * width) / 2, p[1] + (n[1] * width) / 2];
    if (insideRing(m, inner) || !insideRing(m, outer))
      throw new Error("Boundary path leaves the saved road surface");
    mid.push(m);
  }
  // Preserve the source trace's travel direction, independent of boundary storage order.
  const trace = geometryPaths(
    layout.features.find((f) => f.properties.role === "trace")!.geometry,
  )[0].map(project.to);
  if (Math.sign(signedArea(trace)) !== Math.sign(signedArea(inner)))
    mid.reverse();
  const result = mid.map(project.from);
  result.push(result[0]);
  return result;
}

export function assertRoadContained(
  layout: Layout,
  points: {
    x: number;
    z: number;
    nx: number;
    nz: number;
    left: number;
    right: number;
  }[],
  origin: Position,
) {
  const { project, inner, outer } = roadRings(layout),
    local = plane(origin);
  for (const p of points) {
    const offset = (p.left - p.right) / 2;
    const m = project.to(
      local.from([p.x + p.nx * offset, -(p.z + p.nz * offset)]),
    );
    if (insideRing(m, inner) || !insideRing(m, outer))
      throw new Error(
        "Reconstructed driving path leaves the saved road surface",
      );
  }
}
