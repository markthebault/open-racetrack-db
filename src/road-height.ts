type ElevationAnchor = [number, number];

/** Periodic monotone cubic interpolation: anchors are exact and hills cannot overshoot. */
export function roadHeight(
  anchors: ElevationAnchor[],
  station: number,
  closed = true,
) {
  const end = anchors.at(-1)![0];
  const s = closed
    ? ((station % end) + end) % end
    : Math.max(0, Math.min(end, station));
  const n = anchors.length - 1;
  const slopes = anchors
    .slice(0, -1)
    .map((p, i) => (anchors[i + 1][1] - p[1]) / (anchors[i + 1][0] - p[0]));
  const tangent = (i: number) => {
    if (!closed && (i === 0 || i === n)) return slopes[i === 0 ? 0 : n - 1];
    const previous = (i - 1 + n) % n,
      next = i % n;
    const a = slopes[previous],
      b = slopes[next];
    if (a * b <= 0) return 0;
    const ha = anchors[previous + 1][0] - anchors[previous][0],
      hb = anchors[next + 1][0] - anchors[next][0];
    return (3 * (ha + hb)) / ((2 * hb + ha) / a + (hb + 2 * ha) / b);
  };
  if (!closed && s === end) return anchors.at(-1)![1];
  const i = Math.max(
    0,
    anchors.findIndex((p, j) => j < n && s >= p[0] && s < anchors[j + 1][0]),
  );
  const [s0, y0] = anchors[i],
    [s1, y1] = anchors[i + 1],
    h = s1 - s0,
    t = (s - s0) / h;
  return (
    (2 * t ** 3 - 3 * t * t + 1) * y0 +
    (t ** 3 - 2 * t * t + t) * h * tangent(i) +
    (-2 * t ** 3 + 3 * t * t) * y1 +
    (t ** 3 - t * t) * h * tangent(i + 1)
  );
}
