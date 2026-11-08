import type { Position } from "./geo";
type Segment = { a: Position; dx: number; dz: number; side: number };
export interface BorderIndex {
  cells: Map<string, Segment[]>;
  cellSize: number;
}
/** Index bounding cells once; each cross-section then visits only nearby segments. */
export function indexBorders(paths: Position[][], cellSize = 64): BorderIndex {
  const cells = new Map<string, Segment[]>();
  paths.forEach((path, side) => {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        segment = { a, dx: b[0] - a[0], dz: b[1] - a[1], side };
      for (
        let x = Math.floor(Math.min(a[0], b[0]) / cellSize);
        x <= Math.floor(Math.max(a[0], b[0]) / cellSize);
        x++
      )
        for (
          let z = Math.floor(Math.min(a[1], b[1]) / cellSize);
          z <= Math.floor(Math.max(a[1], b[1]) / cellSize);
          z++
        ) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key)!.push(segment);
        }
    }
  });
  return { cells, cellSize };
}
export function borderSection(
  index: BorderIndex,
  x: number,
  z: number,
  nx: number,
  nz: number,
): [number, number] | undefined {
  const reach = 35,
    { cellSize, cells } = index,
    candidates = new Set<Segment>();
  for (
    let cx = Math.floor((x - Math.abs(nx) * reach) / cellSize);
    cx <= Math.floor((x + Math.abs(nx) * reach) / cellSize);
    cx++
  )
    for (
      let cz = Math.floor((z - Math.abs(nz) * reach) / cellSize);
      cz <= Math.floor((z + Math.abs(nz) * reach) / cellSize);
      cz++
    )
      for (const s of cells.get(`${cx},${cz}`) ?? []) candidates.add(s);
  const hits: number[][] = [[], []];
  for (const s of candidates) {
    const den = nx * s.dz - nz * s.dx;
    if (Math.abs(den) < 1e-8) continue;
    const qx = s.a[0] - x,
      qz = s.a[1] - z,
      offset = (qx * s.dz - qz * s.dx) / den,
      edge = (qx * nz - qz * nx) / den;
    if (edge >= 0 && edge <= 1 && Math.abs(offset) < reach)
      hits[s.side].push(offset);
  }
  let best: [number, number] | undefined,
    score = Infinity;
  for (const a of hits[0])
    for (const b of hits[1]) {
      const left = Math.max(a, b),
        right = Math.min(a, b),
        width = left - right;
      // Reject collapsed / other-branch crossings. Off-centre source traces may lie outside the road.
      if (width < 3 || width > 45) continue;
      const candidate = Math.abs((left + right) / 2);
      if (candidate < score) {
        score = candidate;
        best = [left, -right];
      }
    }
  return best;
}
