import type { Layout } from "../schemas/data";
import { roadRings, insideRing } from "../src/boundary-path";
import { type Position } from "../src/geo";
import { edgeChecker } from "./ideal-clearance";
import type { Station } from "./ideal-line-solver";

/** A second correspondence strategy for valid rings whose normal rays hit a distant branch. */
export function nearestBorderCorridor(layout: Layout) {
  const { project, inner, outer } = roadRings(layout),
    rings = [inner, outer],
    clearance = edgeChecker(rings);
  const lengths = inner
      .slice(1)
      .map((p, i) => Math.hypot(p[0] - inner[i][0], p[1] - inner[i][1])),
    total = lengths.reduce((a, b) => a + b, 0);
  const n = Math.ceil(total / (total > 30000 ? 9 : 3)),
    step = total / n;
  const inside = (p: Position) => !insideRing(p, inner) && insideRing(p, outer);
  const clearSegment = (a: Position, b: Position) => {
    const count = Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]));
    for (let i = 1; i < count; i++) {
      const t = i / count;
      if (!inside([a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t]))
        return false;
    }
    return true;
  };
  let segment = 0,
    segmentStart = 0;
  const stations: Station[] = [];
  for (let i = 0; i < n; i++) {
    const s = i * step;
    while (segment < lengths.length - 1 && s > segmentStart + lengths[segment])
      segmentStart += lengths[segment++];
    const a = inner[segment],
      b = inner[segment + 1],
      t = (s - segmentStart) / lengths[segment],
      p: Position = [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t];
    const candidates = outer
      .slice(1)
      .map((v, j) => {
        const u = outer[j],
          dx = v[0] - u[0],
          dy = v[1] - u[1],
          q = Math.max(
            0,
            Math.min(
              1,
              ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          ),
          point: Position = [u[0] + q * dx, u[1] + q * dy];
        return { point, d: Math.hypot(point[0] - p[0], point[1] - p[1]) };
      })
      .sort((a, b) => a.d - b.d);
    let selected: { point: Position; d: number } | undefined;
    for (const c of candidates) {
      if (c.d < 2.25) continue;
      const m: Position = [(p[0] + c.point[0]) / 2, (p[1] + c.point[1]) / 2];
      if (inside(m) && clearSegment(p, c.point)) {
        selected = c;
        break;
      }
    }
    if (!selected) continue;
    const q = selected.point,
      m: Position = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    stations.push({
      x: m[0],
      z: -m[1],
      y: 0,
      nx: (q[0] - p[0]) / selected.d,
      nz: -(q[1] - p[1]) / selected.d,
      halfWidth: clearance(m),
    });
  }
  if (stations.length < 3)
    throw new Error("Cannot establish a route around the source island");
  const area = (p: Position[]) =>
    p.slice(1).reduce((s, q, i) => s + p[i][0] * q[1] - q[0] * p[i][1], 0);
  const trace = layout.features.find((f) => f.properties.role === "trace")!;
  if (trace.geometry.type !== "LineString")
    throw new Error(
      "Nearest-boundary corridor requires a single ordered route",
    );
  if (
    Math.sign(area(trace.geometry.coordinates.map(project.to))) !==
    Math.sign(area(inner))
  )
    stations.reverse();
  return { stations, origin: trace.geometry.coordinates[0], rings, clearance };
}
