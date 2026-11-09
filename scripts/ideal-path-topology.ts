import type { PathPoint } from "./ideal-line-solver";
import type { Position } from "../src/geo";
import { insideRing } from "../src/boundary-path";
/** Remove local backtracking loops while retaining the cycle around the source island. */
export function removeIdealLoops(
  input: PathPoint[],
  innerPoint: Position,
): PathPoint[] {
  let points = input;
  const length = (p: PathPoint[]) =>
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + Math.hypot(a.x - b.x, a.z - b.z);
    }, 0);
  const wraps = (p: PathPoint[]) =>
    p.length >= 3 &&
    insideRing(innerPoint, [
      ...p.map((q) => [q.x, q.z] as Position),
      [p[0].x, p[0].z],
    ]);
  for (let iteration = 0; iteration < 100; iteration++) {
    const grid = new Map<string, number[]>();
    let hit: { i: number; j: number; p: PathPoint } | undefined;
    for (let j = 0; j < points.length && !hit; j++) {
      const c = points[j],
        d = points[(j + 1) % points.length],
        keys: string[] = [],
        candidates = new Set<number>();
      for (
        let x = Math.floor(Math.min(c.x, d.x) / 32);
        x <= Math.floor(Math.max(c.x, d.x) / 32);
        x++
      )
        for (
          let z = Math.floor(Math.min(c.z, d.z) / 32);
          z <= Math.floor(Math.max(c.z, d.z) / 32);
          z++
        ) {
          const key = `${x},${z}`;
          keys.push(key);
          for (const i of grid.get(key) ?? []) candidates.add(i);
        }
      for (const i of candidates) {
        if (j - i === 1 || (i === 0 && j === points.length - 1)) continue;
        const a = points[i],
          b = points[i + 1],
          ux = b.x - a.x,
          uz = b.z - a.z,
          vx = d.x - c.x,
          vz = d.z - c.z,
          den = ux * vz - uz * vx;
        if (Math.abs(den) < 1e-10) continue;
        const t = ((c.x - a.x) * vz - (c.z - a.z) * vx) / den,
          u = ((c.x - a.x) * uz - (c.z - a.z) * ux) / den;
        if (t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8) {
          hit = {
            i,
            j,
            p: { x: a.x + t * ux, z: a.z + t * uz, y: a.y + t * (b.y - a.y) },
          };
          break;
        }
      }
      for (const key of keys) {
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(j);
      }
    }
    if (!hit) return points;
    const { i, j, p } = hit;
    const candidates = [
      [...points.slice(0, i + 1), p, ...points.slice(j + 1)],
      [p, ...points.slice(i + 1, j + 1)],
    ]
      .map((a) =>
        a.filter(
          (q, k) =>
            k === 0 || Math.hypot(q.x - a[k - 1].x, q.z - a[k - 1].z) > 1e-6,
        ),
      )
      .filter(wraps);
    if (!candidates.length)
      throw new Error(
        "Self-crossing cannot be resolved without losing the source circuit",
      );
    points = candidates.sort((a, b) => length(a) - length(b))[0];
  }
  throw new Error("Too many local backtracking loops in source corridor");
}
