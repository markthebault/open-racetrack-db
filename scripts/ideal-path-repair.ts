import { idealLocalRoute } from "./ideal-local-route";
import type { PathPoint } from "./ideal-line-solver";
import { insideRing } from "../src/boundary-path";
import type { Position } from "../src/geo";
/** Repair a short corner-cut only when both replacement segments fit the eroded source footprint. */
export function repairIdealPath(
  points: PathPoint[],
  closed: boolean,
  rings: Position[][],
  clearance: (p: Position) => number,
  margin: number,
): PathPoint[] {
  const valid = (x: number, z: number) =>
    clearance([x, -z]) >= margin &&
    insideRing([x, -z], rings[0]) !== insideRing([x, -z], rings[1]);
  const segment = (a: PathPoint, b: PathPoint) => {
    const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!valid(a.x * (1 - t) + b.x * t, a.z * (1 - t) + b.z * t))
        return false;
    }
    return true;
  };
  const result: PathPoint[] = [];
  for (let i = 0; i < (closed ? points.length : points.length - 1); i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    result.push(a);
    if (segment(a, b)) continue;
    if (!valid(a.x, a.z) || !valid(b.x, b.z))
      throw new Error("Repair endpoints do not fit the source corridor");
    const direct = Math.hypot(a.x - b.x, a.z - b.z);
    if (direct > 120)
      throw new Error(
        "Source corridor has a discontinuity exceeding local repair limits",
      );
    const mx = (a.x + b.x) / 2,
      mz = (a.z + b.z) / 2;
    let best: PathPoint | undefined,
      bestCost = Infinity;
    for (let radius = 1; radius <= 16; radius += 0.5) {
      for (let k = 0; k < 32; k++) {
        const t = (k / 32) * 2 * Math.PI,
          c = {
            x: mx + radius * Math.cos(t),
            z: mz + radius * Math.sin(t),
            y: (a.y + b.y) / 2,
          };
        const length =
          Math.hypot(a.x - c.x, a.z - c.z) + Math.hypot(b.x - c.x, b.z - c.z);
        if (
          length >= bestCost ||
          !valid(c.x, c.z) ||
          !segment(a, c) ||
          !segment(c, b)
        )
          continue;
        best = c;
        bestCost = length;
      }
      if (best && radius > direct / 2 + 2) break;
    }
    if (!best) {
      const routed = idealLocalRoute(a, b, valid, segment);
      result.push(...routed.slice(1, -1));
      continue;
    }
    // Round the repair through its control point when that entire curve also fits.
    const control = { x: 2 * best.x - mx, z: 2 * best.z - mz, y: best.y },
      n = Math.max(4, Math.ceil(bestCost / 1));
    const rounded = Array.from({ length: n + 1 }, (_, j) => {
      const t = j / n;
      return {
        x: (1 - t) ** 2 * a.x + 2 * t * (1 - t) * control.x + t * t * b.x,
        z: (1 - t) ** 2 * a.z + 2 * t * (1 - t) * control.z + t * t * b.z,
        y: a.y * (1 - t) + b.y * t,
      };
    });
    if (rounded.slice(1).every((p, j) => segment(rounded[j], p)))
      result.push(...rounded.slice(1, -1));
    else result.push(best);
  }
  if (!closed) result.push(points.at(-1)!);
  return result;
}
