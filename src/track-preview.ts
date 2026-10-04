import { bounds, plane, type Position } from "./geo";

// Use metres in both axes so the outline keeps its geographic proportions.
export function planarCourse(paths: Position[][]) {
  const box = bounds(paths.flat());
  const origin: Position = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const projection = plane(origin);
  const localPaths = paths.map((path) => path.map(projection.to));
  const extent = bounds(localPaths.flat());
  return {
    paths: localPaths,
    origin,
    width: extent[2] - extent[0],
    height: extent[3] - extent[1],
  };
}

export function previewPath(paths: Position[][]) {
  const local = planarCourse(paths);
  const scale = 52 / Math.max(local.width, local.height, 1);
  return local.paths
    .map((path) => {
      const points = path.map(
        (p) => [32 + p[0] * scale, 32 - p[1] * scale] as Position,
      );
      const keep = new Set([0, points.length - 1]);
      const pending: [number, number][] = [[0, points.length - 1]];
      // Simplify only the 64 px thumbnails. The 2D map, 3D model and exports use full coordinates.
      while (pending.length) {
        const [first, last] = pending.pop()!,
          a = points[first],
          b = points[last];
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          squaredLength = dx * dx + dy * dy;
        let furthest = -1,
          squaredDistance = 0.35 ** 2;
        for (let i = first + 1; i < last; i++) {
          const p = points[i];
          const t = squaredLength
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / squaredLength,
                ),
              )
            : 0;
          const deviation =
            (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
          if (deviation > squaredDistance) {
            squaredDistance = deviation;
            furthest = i;
          }
        }
        if (furthest >= 0) {
          keep.add(furthest);
          pending.push([first, furthest], [furthest, last]);
        }
      }
      const sampled = [...keep].sort((a, b) => a - b).map((i) => points[i]);
      return sampled
        .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
        .join("");
    })
    .join("");
}
