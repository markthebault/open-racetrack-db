import type { PathPoint } from "./ideal-line-solver";
/** Bounded A* inside the unchanged, vehicle-width-eroded footprint. */
export function idealLocalRoute(
  a: PathPoint,
  b: PathPoint,
  valid: (x: number, z: number) => boolean,
  segment: (a: PathPoint, b: PathPoint) => boolean,
  paddingOverride?: number,
): PathPoint[] {
  const step = 0.5,
    padding =
      paddingOverride ??
      Math.max(20, Math.min(60, Math.hypot(a.x - b.x, a.z - b.z) / 2)),
    x0 = Math.min(a.x, b.x) - padding,
    z0 = Math.min(a.z, b.z) - padding,
    columns = Math.ceil((Math.abs(a.x - b.x) + 2 * padding) / step) + 1,
    rows = Math.ceil((Math.abs(a.z - b.z) + 2 * padding) / step) + 1;
  const node = (id: number): PathPoint => ({
    x: x0 + (id % columns) * step,
    z: z0 + Math.floor(id / columns) * step,
    y: (a.y + b.y) / 2,
  });
  const cache = new Uint8Array(columns * rows);
  const free = (id: number) => {
    if (!cache[id]) {
      const p = node(id);
      cache[id] = valid(p.x, p.z) ? 1 : 2;
    }
    return cache[id] === 1;
  };
  const anchor = (p: PathPoint) => {
    const x = Math.round((p.x - x0) / step),
      z = Math.round((p.z - z0) / step);
    let best = -1,
      distance = Infinity;
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const cx = x + dx,
          cz = z + dz;
        if (cx < 0 || cz < 0 || cx >= columns || cz >= rows) continue;
        const id = cz * columns + cx,
          q = node(id),
          d = Math.hypot(p.x - q.x, p.z - q.z);
        if (d < distance && free(id) && segment(p, q)) {
          best = id;
          distance = d;
        }
      }
    return best;
  };
  const start = anchor(a),
    end = anchor(b);
  if (start < 0 || end < 0)
    throw new Error("Cannot anchor a local route inside the source footprint");
  const parent = new Int32Array(columns * rows).fill(-1),
    cost = new Float64Array(columns * rows).fill(Infinity),
    closed = new Uint8Array(columns * rows);
  cost[start] = 0;
  const heuristic = (id: number) =>
    Math.hypot(
      (id % columns) - (end % columns),
      Math.floor(id / columns) - Math.floor(end / columns),
    ) * step;
  const heap: { id: number; f: number }[] = [];
  const push = (id: number, f: number) => {
    let i = heap.length;
    heap.push({ id, f });
    while (i) {
      const p = Math.floor((i - 1) / 2);
      if (heap[p].f <= f) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = { id, f };
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (2 * i + 1 < heap.length) {
        let child = 2 * i + 1;
        if (child + 1 < heap.length && heap[child + 1].f < heap[child].f)
          child++;
        if (heap[child].f >= last.f) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first.id;
  };
  push(start, heuristic(start));
  let found = false,
    expanded = 0;
  while (heap.length && expanded++ < 60000) {
    const id = pop();
    if (closed[id]) continue;
    closed[id] = 1;
    if (id === end) {
      found = true;
      break;
    }
    const x = id % columns,
      z = Math.floor(id / columns),
      p = node(id);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const cx = x + dx,
          cz = z + dz;
        if (cx < 0 || cz < 0 || cx >= columns || cz >= rows) continue;
        const next = cz * columns + cx;
        if (closed[next] || !free(next)) continue;
        const candidate = cost[id] + step * Math.hypot(dx, dz);
        if (candidate >= cost[next] || !segment(p, node(next))) continue;
        cost[next] = candidate;
        parent[next] = id;
        push(next, candidate + heuristic(next));
      }
  }
  if (!found && paddingOverride === undefined)
    return idealLocalRoute(a, b, valid, segment, 96);
  if (!found)
    throw new Error(
      "No vehicle-width local route through the saved footprint",
      {
        cause: {
          a,
          b,
          padding,
          expanded,
          frontierRemaining: heap.length,
          columns,
          rows,
        },
      },
    );
  const reversed: PathPoint[] = [];
  for (let id = end; id !== -1; id = parent[id]) reversed.push(node(id));
  const path = [a, ...reversed.reverse(), b].filter(
    (p, i, all) =>
      !i || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > 1e-7,
  );
  const simplified: PathPoint[] = [a];
  let i = 0;
  while (i < path.length - 1) {
    let next = path.length - 1;
    while (next > i + 1 && !segment(path[i], path[next])) next--;
    simplified.push(path[next]);
    i = next;
  }
  const dense: PathPoint[] = [a];
  for (let j = 1; j < simplified.length; j++) {
    const p = simplified[j - 1],
      q = simplified[j],
      count = Math.ceil(Math.hypot(p.x - q.x, p.z - q.z));
    for (let k = 1; k <= count; k++) {
      const t = k / count;
      dense.push({
        x: p.x * (1 - t) + q.x * t,
        z: p.z * (1 - t) + q.z * t,
        y: p.y * (1 - t) + q.y * t,
      });
    }
  }
  for (let pass = 0; pass < 30; pass++)
    for (let j = 1; j < dense.length - 1; j++) {
      const p = dense[j],
        u = dense[j - 1],
        v = dense[j + 1],
        q = {
          x: p.x * 0.6 + (u.x + v.x) * 0.2,
          z: p.z * 0.6 + (u.z + v.z) * 0.2,
          y: p.y,
        };
      if (valid(q.x, q.z) && segment(u, q) && segment(q, v)) dense[j] = q;
    }
  return dense;
}
