/** Curvature at a fixed physical window, independent of stored vertex density. X/Z are horizontal metres. */
export function pathCurvatures(
  points: { x: number; z: number }[],
  closed: boolean,
  windowM: number,
) {
  const n = points.length,
    station = [0];
  for (let i = 1; i < n; i++)
    station.push(
      station[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].z - points[i - 1].z,
        ),
    );
  const total =
    station[n - 1] +
    (closed
      ? Math.hypot(points[0].x - points[n - 1].x, points[0].z - points[n - 1].z)
      : 0);
  const cursors = [0, 0],
    previous = [-Infinity, -Infinity];
  const at = (s: number, side: number) => {
    s = closed
      ? ((s % total) + total) % total
      : Math.max(0, Math.min(total, s));
    let lo = s < previous[side] ? 0 : cursors[side];
    while (lo + 1 < n && station[lo + 1] <= s) lo++;
    cursors[side] = lo;
    previous[side] = s;
    const a = points[lo],
      b = points[(lo + 1) % n],
      length =
        lo === n - 1 ? total - station[lo] : station[lo + 1] - station[lo],
      t = length ? (s - station[lo]) / length : 0;
    return { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
  };
  const result = points.map((p, i) => {
    const a = at(station[i] - windowM, 0),
      b = at(station[i] + windowM, 1),
      ab = Math.hypot(p.x - a.x, p.z - a.z),
      bc = Math.hypot(b.x - p.x, b.z - p.z),
      ac = Math.hypot(b.x - a.x, b.z - a.z);
    return (
      (2 * ((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x))) /
      Math.max(1e-10, ab * bc * ac)
    );
  });
  if (!closed && n > 2) {
    result[0] = result[1];
    result[n - 1] = result[n - 2];
  }
  return result;
}
