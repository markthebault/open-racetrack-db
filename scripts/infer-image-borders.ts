import { PNG } from "pngjs";
import type { GradeSeparation } from "../schemas/grade-separation";
import { assertGradeRibbon } from "../src/grade-separation";
import { plane, equal, type Position } from "../src/geo";
type RasterExtent = {
  width: number;
  height: number;
  extent: [number, number, number, number];
};
export type Raster = RasterExtent &
  (
    | { data: Uint8Array; sample?: never }
    | { data?: never; sample: (x: number, y: number) => readonly number[] }
  );
const R = 6378137;
class MissingImageCoverage extends Error {}
const mercator = (p: Position): Position => [
  (R * p[0] * Math.PI) / 180,
  R * Math.asinh(Math.tan((p[1] * Math.PI) / 180)),
];
const average = (
  values: Position[],
  i: number,
  radius: number,
  closed = true,
): Position => {
  let x = 0,
    y = 0;
  for (let j = -radius; j <= radius; j++) {
    const p =
      values[
        closed
          ? (i + j + values.length) % values.length
          : Math.max(0, Math.min(values.length - 1, i + j))
      ];
    x += p[0];
    y += p[1];
  }
  return [x / (radius * 2 + 1), y / (radius * 2 + 1)];
};
const norm = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function decodeRaster(bytes: Buffer, extent: Raster["extent"]): Raster {
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height, data: png.data, extent };
}
function pixel(image: Raster, geo: Position): number[] {
  const p = mercator(geo),
    [w, s, e, n] = image.extent,
    x = ((p[0] - w) / (e - w)) * image.width - 0.5,
    y = ((n - p[1]) / (n - s)) * image.height - 0.5;
  if (x < 0 || y < 0 || x >= image.width - 1 || y >= image.height - 1)
    throw new Error("Imagery does not cover the full boundary search corridor");
  const a = Math.floor(x),
    b = Math.floor(y),
    u = x - a,
    v = y - b,
    out = [0, 0, 0];
  for (const [dx, dy, weight] of [
    [0, 0, (1 - u) * (1 - v)],
    [1, 0, u * (1 - v)],
    [0, 1, (1 - u) * v],
    [1, 1, u * v],
  ]) {
    const k = ((b + dy) * image.width + a + dx) * 4;
    const rgba = image.sample?.(a + dx, b + dy);
    if ((rgba ? rgba[3] : image.data![k + 3]) < 128)
      throw new MissingImageCoverage("Imagery has missing coverage");
    for (let c = 0; c < 3; c++)
      out[c] += ((rgba ? rgba[c] : image.data![k + c]) / 255) * weight;
  }
  return out;
}
function selfCrosses(path: Position[], closed = true) {
  const cell = 24,
    cells = new Map<string, number[]>();
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      seen = new Set<number>();
    for (
      let x = Math.floor(Math.min(a[0], b[0]) / cell);
      x <= Math.floor(Math.max(a[0], b[0]) / cell);
      x++
    )
      for (
        let y = Math.floor(Math.min(a[1], b[1]) / cell);
        y <= Math.floor(Math.max(a[1], b[1]) / cell);
        y++
      ) {
        const key = `${x},${y}`;
        for (const j of cells.get(key) ?? []) seen.add(j);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key)!.push(i);
      }
    for (const j of seen) {
      if (Math.abs(i - j) <= 1 || (closed && i === path.length - 1 && j === 1))
        continue;
      const c = path[j - 1],
        d = path[j];
      const cross = (p: Position, q: Position, r: Position) =>
        (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      if (
        cross(a, b, c) * cross(a, b, d) < 0 &&
        cross(c, d, a) * cross(c, d, b) < 0
      )
        return true;
    }
  }
  return false;
}
export function imageCrossSections(trace: Position[], open = false) {
  const closed = equal(trace[0], trace.at(-1)!);
  if (!closed && !open)
    throw new Error(
      "A single closed route is required to classify inner and outer edges",
    );
  const projection = plane(trace[0]),
    raw = trace.map((p) => projection.to(p)),
    stations = [0];
  for (let i = 1; i < raw.length; i++)
    stations.push(
      stations[i - 1] +
        Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]),
    );
  const count = Math.max(12, Math.ceil(stations.at(-1)! / 3)),
    step = stations.at(-1)! / (closed ? count : count - 1),
    path: Position[] = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (segment < raw.length - 2 && stations[segment + 1] < s) segment++;
    const t =
      (s - stations[segment]) / (stations[segment + 1] - stations[segment]);
    path.push([
      raw[segment][0] + (raw[segment + 1][0] - raw[segment][0]) * t,
      raw[segment][1] + (raw[segment + 1][1] - raw[segment][1]) * t,
    ]);
  }
  const smooth = path.map((_, i) => average(path, i, 1, closed));
  const index = (i: number) =>
    closed ? (i + count) % count : Math.max(0, Math.min(count - 1, i));
  const normals = smooth.map((_, i): Position => {
    const a = smooth[index(i - 2)],
      b = smooth[index(i + 2)],
      d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
  });
  return { closed, projection, count, step, smooth, normals, index };
}

/** Image-driven proposals only. Evidence metrics are not calibrated positional confidence. */
export function inferImageBorders(
  trace: Position[],
  image: Raster,
  options: {
    open?: boolean;
    method?: "road-appearance-v3" | "road-local-appearance-v4";
    gradeSeparation?: GradeSeparation;
  } = {},
) {
  const gradeSeparation = options.gradeSeparation,
    localAppearance = options.method === "road-local-appearance-v4",
    appearance = localAppearance || options.method === "road-appearance-v3",
    minOffset = appearance ? -10 : 2;
  const { closed, projection, count, step, smooth, normals, index } =
    imageCrossSections(trace, options.open);
  if (
    options.gradeSeparation &&
    (!closed ||
      !localAppearance ||
      options.gradeSeparation.stationCount !== count)
  )
    throw new Error(
      "Grade separation requires matching closed local-appearance stations",
    );
  const samples = smooth.map((p, i) =>
    Array.from({ length: 121 }, (_, j) => {
      try {
        return pixel(
          image,
          projection.from([
            p[0] + normals[i][0] * (j - 60) * 0.5,
            p[1] + normals[i][1] * (j - 60) * 0.5,
          ]),
        );
      } catch (error) {
        if (error instanceof MissingImageCoverage) return null;
        throw error;
      }
    }),
  );
  const centers = samples.map((row) => {
    if (row.slice(58, 63).some((p) => p === null))
      throw new MissingImageCoverage(
        "Imagery has missing coverage near the source trace",
      );
    return [0, 1, 2].map(
      (c) => row.slice(58, 63).reduce((s, p) => s + p![c], 0) / 5,
    );
  });
  const roadColor = [0, 1, 2].map(
    (c) =>
      centers.map((v) => v[c]).sort((a, b) => a - b)[Math.floor(count / 2)],
  );
  // Neutral pavement colours adapt to local lighting; this is only a proposal prior.
  // Colour alone cannot distinguish a road from adjoining aprons or concrete.
  const localColors = localAppearance
    ? samples.map((row) => {
        const neutral = row
          .slice(30, 91)
          .filter((p): p is number[] => p !== null)
          .filter(
            (p) =>
              (p[0] + p[1] + p[2]) / 3 > 0.1 && (p[0] + p[1] + p[2]) / 3 < 0.7,
          )
          .sort(
            (a, b) =>
              Math.max(...a) -
              Math.min(...a) -
              (Math.max(...b) - Math.min(...b)),
          )
          .slice(0, 15);
        if (neutral.length < 5) return [0, 1, 2].map((c) => row[60]![c]);
        return [0, 1, 2].map(
          (c) =>
            neutral.map((p) => p[c]).sort((a, b) => a - b)[
              Math.floor(neutral.length / 2)
            ],
        );
      })
    : undefined;
  const means = (row: (number[] | null)[], indices: number[]) =>
    [0, 1, 2].map(
      (c) => indices.reduce((s, j) => s + row[j]![c], 0) / indices.length,
    );
  const borders: Position[][] = [],
    evidence: { strong: number; interior: number }[] = [],
    widths: number[][] = [];
  for (const sign of [1, -1]) {
    const options = appearance ? 71 : 47,
      contrast: number[][] = [],
      interior: number[][] = [],
      scores: number[][] = [];
    for (let i = 0; i < count; i++) {
      const cs: number[] = [],
        ins: number[] = [],
        score: number[] = [];
      const sectionColor = localColors
        ? [0, 1, 2].map(
            (c) =>
              [-2, -1, 0, 1, 2]
                .map((d) => localColors[index(i + d)][c])
                .sort((a, b) => a - b)[2],
          )
        : roadColor;
      for (let j = 0; j < options; j++) {
        const offset = minOffset + j * 0.5,
          k = 60 + sign * offset * 2;
        const needed = appearance
          ? [
              ...[1, 2, 3, 4, 5, 6].map((d) => k - sign * d),
              ...[1, 2, 3, 4].map((d) => k + sign * d),
            ]
          : Array.from(
              { length: Math.abs(k - 60) + 9 },
              (_, q) => Math.min(60, k) - 4 + q,
            );
        if (needed.some((q) => samples[i][q] === null)) {
          cs.push(0);
          ins.push(Infinity);
          score.push(Infinity);
          continue;
        }
        const inside = means(
            samples[i],
            [1, 2, 3, 4].map((v) => k - sign * v),
          ),
          outside = means(
            samples[i],
            [1, 2, 3, 4].map((v) => k + sign * v),
          );
        const c = norm(outside, inside);
        let residual = 0;
        if (appearance) {
          for (let d = 1; d <= 6; d++)
            residual += norm(samples[i][k - sign * d]!, sectionColor) / 6;
        } else {
          for (let a = Math.min(60, k); a <= Math.max(60, k); a++)
            residual += norm(samples[i][a]!, centers[i]);
          residual /= Math.abs(k - 60) + 1;
        }
        cs.push(c);
        ins.push(residual);
        score.push(
          appearance && sign === -1 && widths[0][i] + offset < 4
            ? Infinity
            : -2 * c +
                6 * residual +
                0.003 * offset +
                (appearance
                  ? 3 *
                    Math.max(0, 0.04 + residual - norm(outside, sectionColor))
                  : 0),
        );
      }
      contrast.push(cs);
      interior.push(ins);
      scores.push(score);
    }
    let dp = new Float64Array(options);
    const back: Uint8Array[] = [];
    for (let i = 0; i < count * (closed ? 2 : 1); i++) {
      const next = new Float64Array(options),
        prior = new Uint8Array(options);
      for (let j = 0; j < options; j++) {
        let best = Infinity;
        for (
          let a = Math.max(0, j - 4);
          a <= Math.min(options - 1, j + 4);
          a++
        ) {
          const v = dp[a] + 0.1 * ((a - j) * 0.5) ** 2;
          if (v < best) {
            best = v;
            prior[j] = a;
          }
        }
        next[j] = best + scores[i % count][j];
      }
      dp = next;
      back.push(prior);
    }
    if (!Array.from(dp).some(Number.isFinite))
      throw new Error("No coherent image-supported road interval");
    let state = Array.from(dp).indexOf(Math.min(...dp));
    const chosen = new Uint8Array(back.length);
    for (let i = back.length - 1; i >= 0; i--) {
      chosen[i] = state;
      state = back[i][state];
    }
    const picks = Array.from(chosen.slice(closed ? count : 0)),
      ds = picks.map((j) => minOffset + j * 0.5),
      filtered = ds.map((_, i) => {
        let sum = 0;
        for (let j = -2; j <= 2; j++) sum += ds[index(i + j)] / 5;
        return sum;
      });
    const planar = smooth.map((p, i): Position => [
      p[0] + normals[i][0] * filtered[i] * sign,
      p[1] + normals[i][1] * filtered[i] * sign,
    ]);
    if (closed) planar.push(planar[0]);
    if (!gradeSeparation && selfCrosses(planar, closed))
      throw new Error(
        "Inferred boundary crosses itself; image needs manual review",
      );
    if (picks.filter((j) => j === 0 || j === options - 1).length / count > 0.06)
      throw new Error(
        "Too many sections hit the search limit; image needs manual review",
      );
    const strong =
        picks.filter((j, i) => contrast[i][j] > 0.055).length / count,
      errors = picks.map((j, i) => interior[i][j]).sort((a, b) => a - b),
      residual = errors[Math.floor(count / 2)];
    if (strong < 0.75 || residual > 0.12)
      throw new Error("Insufficient consistent image-edge evidence");
    const points = planar.map(
      (p) => projection.from(p).map((v) => Number(v.toFixed(7))) as Position,
    );
    borders.push(points);
    widths.push(filtered);
    evidence.push({
      strong: Number(strong.toFixed(4)),
      interior: Number(residual.toFixed(4)),
    });
  }
  if (
    widths[0].some(
      (w, i) => w + widths[1][i] > 45 || (appearance && w + widths[1][i] < 3.5),
    )
  )
    throw new Error(
      "Image suggests an ambiguous apron or junction wider than 45 m",
    );
  // Missing pixels are never filled. Every sampled point through the selected
  // road and its 2 m edge neighbourhood must have actual source coverage.
  for (let i = 0; i < count; i++) {
    const first = Math.floor(60 - 2 * widths[1][i] - 4),
      last = Math.ceil(60 + 2 * widths[0][i] + 4);
    for (let j = first; j <= last; j++)
      if (!samples[i][j])
        throw new MissingImageCoverage(
          "Selected road or edge neighbourhood has missing imagery coverage",
        );
  }
  for (const border of borders) for (const p of border) pixel(image, p);
  const area = (points: Position[]) =>
    Math.abs(
      points
        .slice(1)
        .reduce((a, p, i) => a + points[i][0] * p[1] - p[0] * points[i][1], 0),
    );
  if (options.gradeSeparation)
    assertGradeRibbon(
      { inner: borders[0], outer: borders[1] },
      options.gradeSeparation,
    );
  const inner =
    options.gradeSeparation || !closed || area(borders[0]) < area(borders[1])
      ? 0
      : 1;
  return { inner: borders[inner], outer: borders[1 - inner], evidence, step };
}
