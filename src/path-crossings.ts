import type { Position } from "./geo";

export interface PathCrossing {
  segments: [number, number];
  fractions: [number, number];
  stations: [number, number];
  point: Position;
  kind: "crossing" | "touch" | "overlap";
}

/** Metre-plane topology only. A crossing does not establish a junction or an overpass. */
export function pathCrossings(
  path: Position[],
  closed = false,
): PathCrossing[] {
  if (path.some((p) => p.some((v) => !Number.isFinite(v))))
    throw new Error("Crossing audit needs finite metre-plane coordinates");
  const points = path.slice();
  if (
    closed &&
    points.length &&
    (points[0][0] !== points.at(-1)![0] || points[0][1] !== points.at(-1)![1])
  )
    points.push(points[0]);
  const count = points.length - 1,
    lengths = points
      .slice(1)
      .map((b, i) => Math.hypot(b[0] - points[i][0], b[1] - points[i][1])),
    stations = [0];
  for (const length of lengths) stations.push(stations.at(-1)! + length);
  const result: PathCrossing[] = [],
    cells = new Map<string, number[]>(),
    epsilon = 1e-7,
    cellSize = 128,
    cross = (a: Position, b: Position) => a[0] * b[1] - a[1] * b[0];
  const record = (
    a: number,
    b: number,
    t: number,
    u: number,
    kind: PathCrossing["kind"],
  ) => {
    const s: [number, number] = [
      stations[a] + t * lengths[a],
      stations[b] + u * lengths[b],
    ];
    if (closed)
      for (let i = 0; i < 2; i++)
        if (Math.abs(s[i] - stations.at(-1)!) < epsilon) s[i] = 0;
    if (Math.abs(s[0] - s[1]) < epsilon) return;
    if (s[0] > s[1]) {
      [s[0], s[1]] = [s[1], s[0]];
      [a, b] = [b, a];
      [t, u] = [u, t];
    }
    // A vertex hit can be reported by both incident segments. Keep one station pair.
    if (
      result.some(
        (r) =>
          r.kind === kind &&
          Math.abs(r.stations[0] - s[0]) < epsilon &&
          Math.abs(r.stations[1] - s[1]) < epsilon,
      )
    )
      return;
    result.push({
      segments: [a, b],
      fractions: [t, u],
      stations: s,
      point: [
        points[a][0] + t * (points[a + 1][0] - points[a][0]),
        points[a][1] + t * (points[a + 1][1] - points[a][1]),
      ],
      kind,
    });
  };
  for (let i = 0; i < count; i++) {
    if (lengths[i] <= epsilon) continue;
    const a = points[i],
      b = points[i + 1],
      keys: string[] = [],
      seen = new Set<number>();
    for (
      let x = Math.floor(Math.min(a[0], b[0]) / cellSize);
      x <= Math.floor(Math.max(a[0], b[0]) / cellSize);
      x++
    )
      for (
        let y = Math.floor(Math.min(a[1], b[1]) / cellSize);
        y <= Math.floor(Math.max(a[1], b[1]) / cellSize);
        y++
      ) {
        const key = `${x},${y}`;
        keys.push(key);
        for (const j of cells.get(key) ?? []) seen.add(j);
      }
    for (const j of seen) {
      const c = points[j],
        d = points[j + 1],
        v: Position = [b[0] - a[0], b[1] - a[1]],
        w: Position = [d[0] - c[0], d[1] - c[1]],
        delta: Position = [c[0] - a[0], c[1] - a[1]],
        det = cross(v, w);
      if (Math.abs(det) > epsilon * lengths[i] * lengths[j]) {
        const t = cross(delta, w) / det,
          u = cross(delta, v) / det,
          ti = epsilon / lengths[i],
          tj = epsilon / lengths[j];
        if (t < -ti || t > 1 + ti || u < -tj || u > 1 + tj) continue;
        record(
          j,
          i,
          Math.max(0, Math.min(1, u)),
          Math.max(0, Math.min(1, t)),
          t > ti && t < 1 - ti && u > tj && u < 1 - tj ? "crossing" : "touch",
        );
      } else if (Math.abs(cross(delta, v)) <= epsilon * lengths[i]) {
        const dot = (p: Position) =>
            ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / lengths[i] ** 2,
          lo = Math.max(0, Math.min(dot(c), dot(d))),
          hi = Math.min(1, Math.max(dot(c), dot(d)));
        if (hi < lo - epsilon / lengths[i]) continue;
        const t = (lo + hi) / 2,
          p: Position = [a[0] + t * v[0], a[1] + t * v[1]],
          u = ((p[0] - c[0]) * w[0] + (p[1] - c[1]) * w[1]) / lengths[j] ** 2;
        record(
          j,
          i,
          Math.max(0, Math.min(1, u)),
          Math.max(0, Math.min(1, t)),
          (hi - lo) * lengths[i] > epsilon ? "overlap" : "touch",
        );
      }
    }
    for (const key of keys) {
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(i);
    }
  }
  return result.sort(
    (a, b) => a.stations[0] - b.stations[0] || a.stations[1] - b.stations[1],
  );
}
