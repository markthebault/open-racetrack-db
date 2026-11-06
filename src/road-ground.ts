import type { Road, RoadPoint } from "./lap-simulation";
import type { BufferGeometry } from "three";

/** Conform ground to surface roads only. Elevated deck samples never lift terrain underneath. */
export function roadGroundHeight(road: Pick<Road, "points">) {
  const cells = new Map<string, RoadPoint[]>();
  for (const p of road.points) {
    if (p.elevated) continue;
    const key = `${Math.floor(p.x / 40)},${Math.floor(p.z / 40)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(p);
  }
  return (x: number, z: number, sampled: number) => {
    let nearest: RoadPoint | undefined,
      best = Infinity;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const p of cells.get(
          `${Math.floor(x / 40) + a},${Math.floor(z / 40) + b}`,
        ) ?? []) {
          const d = (x - p.x) ** 2 + (z - p.z) ** 2;
          if (d < best) {
            best = d;
            nearest = p;
          }
        }
    if (!nearest) return sampled;
    const width = Math.max(nearest.left, nearest.right) + 5,
      t = Math.max(0, Math.min(1, (Math.sqrt(best) - width) / 35)),
      blend = 1 - t * t * (3 - 2 * t);
    return sampled + (nearest.y - 0.1 - sampled) * blend;
  };
}

/** Cap every grid face under each road quad, including edges and shoulders.
 * Merely lowering nearby grid samples can leave interpolated faces above a narrow road.
 * Shared vertices are capped to the lowest crossing road; this operation never raises ground.
 */
export function carveRoadGround(
  geometry: BufferGeometry,
  road: Road,
  grid: { columns: number; rows: number },
  transform = (x: number, z: number, y: number) => [x, z, y],
  clearance = 0.4,
) {
  const { columns, rows } = grid,
    positions = geometry.getAttribute("position"),
    minX = positions.getX(0),
    maxX = positions.getX(columns),
    minZ = positions.getZ(0),
    maxZ = positions.getZ(rows * (columns + 1));
  if (
    positions.count !== (columns + 1) * (rows + 1) ||
    maxX <= minX ||
    maxZ <= minZ
  )
    throw new Error(
      "Road terrain carving needs an east/south regular plane grid",
    );
  const sections = road.points.map((p) => {
    const edge = (left: boolean) => {
      const source = left ? p.leftEdge : p.rightEdge,
        width = left ? p.left : p.right,
        sign = left ? 1 : -1,
        x = source?.[0] ?? p.x + p.nx * width * sign,
        z = source?.[1] ?? p.z + p.nz * width * sign,
        length = Math.hypot(x - p.x, z - p.z),
        extend = (length + 2) / length;
      return transform(p.x + (x - p.x) * extend, p.z + (z - p.z) * extend, p.y);
    };
    return [edge(true), edge(false)];
  });
  const count = road.points.length - (road.recipe.kind === "run" ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const corners = [...sections[i], ...sections[(i + 1) % sections.length]],
      x0 = Math.min(...corners.map((p) => p[0])),
      x1 = Math.max(...corners.map((p) => p[0])),
      z0 = Math.min(...corners.map((p) => p[1])),
      z1 = Math.max(...corners.map((p) => p[1])),
      cap = Math.min(...corners.map((p) => p[2])) - clearance;
    if (x1 < minX || x0 > maxX || z1 < minZ || z0 > maxZ) continue;
    const c0 = Math.max(
        0,
        Math.min(
          columns - 1,
          Math.floor(((x0 - minX) / (maxX - minX)) * columns),
        ),
      ),
      c1 = Math.max(
        0,
        Math.min(
          columns - 1,
          Math.floor(((x1 - minX) / (maxX - minX)) * columns),
        ),
      ),
      r0 = Math.max(
        0,
        Math.min(rows - 1, Math.floor(((z0 - minZ) / (maxZ - minZ)) * rows)),
      ),
      r1 = Math.max(
        0,
        Math.min(rows - 1, Math.floor(((z1 - minZ) / (maxZ - minZ)) * rows)),
      );
    for (let r = r0; r <= r1 + 1; r++)
      for (let c = c0; c <= c1 + 1; c++) {
        const vertex = r * (columns + 1) + c;
        positions.setY(vertex, Math.min(positions.getY(vertex), cap));
      }
  }
  positions.needsUpdate = true;
}
