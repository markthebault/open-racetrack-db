import type { PathPoint } from "../scripts/ideal-line-solver";
import type { Position } from "./geo";
/** Signed clearance to the actual paired runtime edges, in source-route order.
 * Local stationing distinguishes two visits to the same XY position at a bridge.
 */
export function widthCorridor(
  left: Position[],
  right: Position[],
  centres: { x: number; z: number }[],
  closed: boolean,
  step: number,
  widthM: number,
  carWidth = 2.05,
  margin = 0.1,
) {
  const n = centres.length,
    index = (i: number) =>
      closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i));
  const edge = (a: Position, b: Position) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    return { x: a[0], z: a[1], dx, dz, inverse: 1 / (dx * dx + dz * dz || 1) };
  };
  const quads = centres.slice(0, closed ? n : n - 1).map((_, i) => {
    const j = index(i + 1),
      p = [left[i], left[j], right[j], right[i]],
      area = p.reduce((s, a, k) => {
        const b = p[(k + 1) % 4];
        return s + a[0] * b[1] - b[0] * a[1];
      }, 0),
      sign = area >= 0 ? 1 : -1;
    return {
      left: edge(left[i], left[j]),
      right: edge(right[i], right[j]),
      planes: p.map((a, k) => {
        const b = p[(k + 1) % 4],
          dx = b[0] - a[0],
          dz = b[1] - a[1];
        return {
          a: -dz * sign,
          b: dx * sign,
          c: (dz * a[0] - dx * a[1]) * sign,
        };
      }),
    };
  });
  const reach = Math.ceil((widthM / 2 + 5) / step),
    last = quads.length - 1;
  const information = (x: number, z: number, station: number) => {
    let minimum = Infinity,
      inside = false;
    for (let d = -reach; d <= reach; d++) {
      const q =
        quads[
          closed ? index(station + d) : Math.max(0, Math.min(last, station + d))
        ];
      if (!inside && q.planes.every((p) => p.a * x + p.b * z + p.c >= -1e-7))
        inside = true;
      for (const e of [q.left, q.right]) {
        const t = Math.max(
          0,
          Math.min(1, ((x - e.x) * e.dx + (z - e.z) * e.dz) * e.inverse),
        );
        minimum = Math.min(
          minimum,
          (x - e.x - t * e.dx) ** 2 + (z - e.z - t * e.dz) ** 2,
        );
      }
    }
    return (inside ? 1 : -1) * Math.sqrt(minimum);
  };
  const referenceClearance = centres.map((p, i) => information(p.x, p.z, i)),
    radius = Math.hypot(2.3, carWidth / 2),
    required = margin + 0.01;
  return {
    clearance: information,
    feasible: (i: number, p: PathPoint, u: PathPoint, v: PathPoint) => {
      // The open run has no road geometry beyond its exact endpoints.
      if (!closed && (i < 2 || i > n - 3)) return true;
      const centre = centres[i],
        off = Math.hypot(p.x - centre.x, p.z - centre.z);
      if (referenceClearance[i] - off - radius >= required) return true;
      const dx = v.x - u.x,
        dz = v.z - u.z,
        length = Math.hypot(dx, dz) || 1;
      for (const along of [-2.3, -1.15, 0, 1.15, 2.3])
        for (const across of [-carWidth / 2, carWidth / 2]) {
          const x = p.x + (along * dx - across * dz) / length,
            z = p.z + (along * dz + across * dx) / length;
          if (information(x, z, i) < required) return false;
        }
      for (const along of [-2.3, 2.3])
        if (
          information(
            p.x + (along * dx) / length,
            p.z + (along * dz) / length,
            i,
          ) < required
        )
          return false;
      return true;
    },
  };
}
