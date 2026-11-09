import type { Position } from "../src/geo";
export function edgeChecker(borders: Position[][]) {
  const cells = new Map<string, { a: Position; b: Position }[]>(),
    size = 32;
  for (const path of borders)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      for (
        let x = Math.floor(Math.min(a[0], b[0]) / size);
        x <= Math.floor(Math.max(a[0], b[0]) / size);
        x++
      )
        for (
          let z = Math.floor(Math.min(a[1], b[1]) / size);
          z <= Math.floor(Math.max(a[1], b[1]) / size);
          z++
        ) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key)!.push({ a, b });
        }
    }
  return (p: Position) => {
    let nearest = Infinity;
    const x = Math.floor(p[0] / size),
      z = Math.floor(p[1] / size);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const { a, b } of cells.get(`${x + dx},${z + dz}`) ?? []) {
          const vx = b[0] - a[0],
            vz = b[1] - a[1],
            t = Math.max(
              0,
              Math.min(
                1,
                ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) /
                  (vx * vx + vz * vz || 1),
              ),
            );
          nearest = Math.min(
            nearest,
            Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vz),
          );
        }
    return nearest;
  };
}
