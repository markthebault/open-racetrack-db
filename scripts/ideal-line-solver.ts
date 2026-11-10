import { pathCurvatures } from "../src/path-curvature";
import { G, lateralLimit, type CarProfile } from "../src/ideal-line-model";
export interface Station {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  halfWidth: number;
}
export interface PathPoint {
  x: number;
  y: number;
  z: number;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function geometry(
  points: PathPoint[],
  closed: boolean,
  curvatureWindowM = 0,
) {
  const n = points.length,
    index = (i: number) => (closed ? (i + n) % n : clamp(i, 0, n - 1));
  const ds = points.map((p, i) => {
    const q = points[index(i + 1)];
    return Math.hypot(q.x - p.x, q.z - p.z, q.y - p.y);
  });
  if (curvatureWindowM)
    return { ds, curvature: pathCurvatures(points, closed, curvatureWindowM) };
  const curvature = points.map((b, i) => {
    const a = points[index(i - 1)],
      c = points[index(i + 1)];
    const ab = Math.hypot(b.x - a.x, b.z - a.z),
      bc = Math.hypot(c.x - b.x, c.z - b.z),
      ac = Math.hypot(c.x - a.x, c.z - a.z);
    return (
      (2 * ((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x))) /
      Math.max(1e-8, ab * bc * ac)
    );
  });
  if (!closed) {
    curvature[0] = curvature[1];
    curvature[n - 1] = curvature[n - 2];
  }
  return { ds, curvature };
}
/** Point-mass, speed-dependent aero grip, combined tyre ellipse, power and drag. */
export function speedProfile(
  points: PathPoint[],
  closed: boolean,
  car: CarProfile,
  precise = true,
  entrySpeedKph = 100,
  curvatureWindowM = 0,
  rootMethod: "bisect" | "newton" = "bisect",
  options?: {
    exitSpeedKph?: number;
    geometry?: { ds: number[]; curvature: number[] };
  },
) {
  const { ds, curvature } =
      options?.geometry ?? geometry(points, closed, curvatureWindowM),
    n = points.length,
    edges = closed ? n : n - 1;
  const cornerSpeed = (k: number) => {
    const aero = (car.aeroGAt200 * G) / (200 / 3.6) ** 2;
    return Math.min(
      car.topSpeedKph / 3.6,
      Math.sqrt((car.maxLateralG * G) / Math.max(k, 1e-10)),
      k > aero ? Math.sqrt((car.mechanicalG * G) / (k - aero)) : Infinity,
    );
  };
  const speed = curvature.map((k, i) =>
    cornerSpeed(
      Math.max(
        Math.abs(k),
        Math.abs(curvature[closed ? (i + 1) % n : Math.min(i + 1, n - 1)]),
      ),
    ),
  );
  if (!closed) speed[0] = Math.min(speed[0], entrySpeedKph / 3.6);
  if (!closed && options?.exitSpeedKph !== undefined)
    speed[n - 1] = Math.min(speed[n - 1], options.exitSpeedKph / 3.6);
  function available(v: number, k: number, grade: number, braking: boolean) {
    const aeroFactor = lateralLimit(v, car) / car.mechanicalG;
    const lateral = (v * v * k) / (G * lateralLimit(v, car));
    const ellipse = Math.sqrt(Math.max(0, 1 - lateral * lateral));
    if (braking)
      return (
        Math.min(car.maxBrakingG, car.brakingG * aeroFactor) * G * ellipse +
        G * grade
      );
    const drag = (0.5 * 1.225 * car.dragArea * v * v) / car.massKg + 0.015 * G;
    return (
      Math.min(
        car.driveG * aeroFactor * G * ellipse,
        (car.powerKw * 1000 * 0.9) / (car.massKg * Math.max(v, 8)),
      ) -
      drag -
      G * grade
    );
  }
  function availableDerivative(v: number, k: number, braking: boolean) {
    const aero = car.aeroGAt200 / (200 / 3.6) ** 2,
      uncapped = car.mechanicalG + aero * v * v;
    const grip = Math.min(car.maxLateralG, uncapped),
      dg = uncapped < car.maxLateralG ? 2 * aero * v : 0;
    const factor = grip / car.mechanicalG,
      df = dg / car.mechanicalG,
      lateral = (v * v * k) / (G * grip),
      dl = (2 * v * k) / (G * grip) - (v * v * k * dg) / (G * grip * grip);
    const ellipse = Math.sqrt(Math.max(0, 1 - lateral * lateral)),
      de = (-lateral * dl) / Math.max(ellipse, 1e-12);
    if (braking) {
      const b = Math.min(car.maxBrakingG, car.brakingG * factor),
        db = car.brakingG * factor < car.maxBrakingG ? car.brakingG * df : 0;
      return G * (db * ellipse + b * de);
    }
    const traction = car.driveG * factor * G * ellipse,
      power = (car.powerKw * 1000 * 0.9) / (car.massKg * Math.max(v, 8));
    const derivative =
      traction <= power
        ? car.driveG * G * (df * ellipse + factor * de)
        : v > 8
          ? -power / v
          : 0;
    return derivative - (1.225 * car.dragArea * v) / car.massKg;
  }
  for (let pass = 0; pass < (precise ? 80 : 5); pass++) {
    let change = 0;
    for (const braking of [false, true])
      for (let step = 0; step < edges; step++) {
        const i = braking ? edges - 1 - step : step,
          j = (i + 1) % n;
        const target = braking ? i : j,
          other = braking ? j : i;
        const k = Math.max(Math.abs(curvature[i]), Math.abs(curvature[j]));
        const grade = (points[j].y - points[i].y) / ds[i];
        let low = 0,
          high = speed[target];
        if (
          (high * high - speed[other] ** 2) / (2 * ds[i]) <=
          available(Math.max(high, speed[other]), k, grade, braking)
        )
          continue;
        if (precise && rootMethod === "newton") {
          const otherV = speed[other],
            distance = ds[i];
          const value = (v: number) =>
            (v * v - otherV * otherV) / (2 * distance) -
            available(Math.max(v, otherV), k, grade, braking);
          let x = Math.min(
            high,
            Math.sqrt(
              Math.max(
                0,
                otherV * otherV +
                  2 * distance * available(otherV, k, grade, braking),
              ),
            ),
          );
          if (x <= low || x >= high) x = (low + high) / 2;
          for (let iteration = 0; iteration < 40; iteration++) {
            const f = value(x);
            if (f <= 0) low = x;
            else high = x;
            if (Math.abs(f) < 1e-7 || high - low < 1e-7) {
              const safe = Math.max(low, x - 1e-8);
              if (value(safe) <= 0) {
                low = safe;
                break;
              }
            }
            const derivative =
              x / distance -
              (x > otherV ? availableDerivative(x, k, braking) : 0);
            const next = x - f / Math.max(1e-9, derivative);
            x =
              next > low && next < high && Math.abs(next - x) > 1e-10
                ? next
                : (low + high) / 2;
          }
        } else {
          for (let b = 0; b < (precise ? 26 : 9); b++) {
            const mid = (low + high) / 2;
            const demand = (mid * mid - speed[other] ** 2) / (2 * ds[i]);
            if (
              demand <=
              available(Math.max(mid, speed[other]), k, grade, braking)
            )
              low = mid;
            else high = mid;
          }
        }
        const v = Math.min(speed[target], Math.max(0.5, low));
        change = Math.max(change, speed[target] - v);
        speed[target] = v;
      }
    if (change < 1e-6) break;
  }
  const s = [0],
    longitudinalG: number[] = [];
  let duration = 0;
  for (let i = 0; i < edges; i++) {
    const j = (i + 1) % n;
    duration += (2 * ds[i]) / (speed[i] + speed[j]);
    s.push(s[i] + ds[i]);
    longitudinalG.push((speed[j] ** 2 - speed[i] ** 2) / (2 * ds[i] * G));
  }
  if (!closed) longitudinalG.push(longitudinalG.at(-1)!);
  return {
    speed,
    s,
    duration,
    curvature,
    ds,
    longitudinalG,
    length: s.at(-1)!,
  };
}
/** Bounded coordinate descent on integral curvature squared, then smooth local time refinement. */
export function optimizeLine(
  stations: Station[],
  closed: boolean,
  car: CarProfile,
  entrySpeedKph?: number,
  edgeAllowanceM = 0.12,
  refinement?: {
    initialOffsets?: number[];
    maxSweeps?: number;
    localTimeRefinement?: boolean;
    feasible?: (
      index: number,
      point: PathPoint,
      previous: PathPoint,
      next: PathPoint,
    ) => boolean;
  },
) {
  const n = stations.length,
    offset = new Float64Array(n),
    margin = car.widthM / 2 + edgeAllowanceM;
  const limits = stations.map((p) => Math.max(0, p.halfWidth - margin));
  if (refinement?.initialOffsets)
    offset.set(
      refinement.initialOffsets.map((v, i) => clamp(v, -limits[i], limits[i])),
    );
  const point = (i: number): PathPoint => ({
    x: stations[i].x + stations[i].nx * offset[i],
    z: stations[i].z + stations[i].nz * offset[i],
    y: stations[i].y,
  });
  const index = (i: number) => (closed ? (i + n) % n : clamp(i, 0, n - 1));
  const localCost = (i: number) => {
    let cost = 0;
    for (let d = -1; d <= 1; d++) {
      const j = index(i + d),
        a = point(index(j - 1)),
        b = point(j),
        c = point(index(j + 1));
      const ab = Math.hypot(b.x - a.x, b.z - a.z),
        bc = Math.hypot(c.x - b.x, c.z - b.z),
        ac = Math.hypot(c.x - a.x, c.z - a.z);
      const k =
        (2 * ((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x))) /
        Math.max(1e-8, ab * bc * ac);
      cost += (k * k * (ab + bc)) / 2;
    }
    return cost;
  };
  for (let sweep = 0; sweep < (refinement?.maxSweeps ?? 1100); sweep++) {
    let change = 0;
    for (let step = 0; step < n; step++) {
      const i = sweep % 2 ? step : n - 1 - step;
      if (!closed && (i < 2 || i > n - 3)) continue;
      const old = offset[i],
        f = localCost(i),
        h = 0.03;
      offset[i] = old + h;
      const plus = localCost(i);
      offset[i] = old - h;
      const minus = localCost(i);
      const second = (plus + minus - 2 * f) / (h * h);
      const next = clamp(
        old -
          clamp((plus - minus) / (2 * h) / Math.max(1e-10, second), -0.4, 0.4),
        -limits[i],
        limits[i],
      );
      offset[i] = next;
      if (
        localCost(i) > f ||
        (refinement?.feasible &&
          [-1, 0, 1].some((d) => {
            const j = index(i + d);
            return !refinement.feasible!(
              j,
              point(j),
              point(index(j - 1)),
              point(index(j + 1)),
            );
          }))
      )
        offset[i] = old;
      change = Math.max(change, Math.abs(offset[i] - old));
    }
    if (change < 1e-5) break;
  }
  let points = stations.map((_, i) => point(i));
  const seedDuration = speedProfile(
    points,
    closed,
    car,
    true,
    entrySpeedKph,
  ).duration;
  const seedOffset = offset.slice(),
    seedPoints = points;
  let best = speedProfile(points, closed, car, false, entrySpeedKph).duration;
  const avgStep =
    stations
      .slice(1)
      .reduce(
        (s, p, i) => s + Math.hypot(p.x - stations[i].x, p.z - stations[i].z),
        0,
      ) /
    (n - 1);
  for (const spanM of refinement?.localTimeRefinement === false
    ? []
    : [100, 60, 35]) {
    const radius = Math.max(3, Math.round(spanM / avgStep));
    for (let sweep = 0; sweep < 2; sweep++)
      for (
        let center = closed ? 0 : radius;
        center < (closed ? n : n - radius);
        center += Math.max(3, Math.floor(radius / 1.5))
      ) {
        const ids: number[] = [],
          weights: number[] = [],
          previous: number[] = [];
        for (let d = -radius; d <= radius; d++) {
          const i = index(center + d);
          ids.push(i);
          weights.push((1 + Math.cos((Math.PI * d) / radius)) / 2);
          previous.push(offset[i]);
        }
        let accepted = 0;
        for (const shift of [-0.65, 0.65]) {
          ids.forEach(
            (i, j) =>
              (offset[i] = clamp(
                previous[j] + shift * weights[j],
                -limits[i],
                limits[i],
              )),
          );
          const trial = stations.map((_, i) => point(i));
          const time = speedProfile(
            trial,
            closed,
            car,
            false,
            entrySpeedKph,
          ).duration;
          if (time < best - 0.0005) {
            best = time;
            accepted = shift;
          }
        }
        ids.forEach(
          (i, j) =>
            (offset[i] = clamp(
              previous[j] + accepted * weights[j],
              -limits[i],
              limits[i],
            )),
        );
      }
  }
  points = stations.map((_, i) => point(i));
  let final = speedProfile(points, closed, car, true, entrySpeedKph);
  if (final.duration > seedDuration) {
    points = seedPoints;
    offset.set(seedOffset);
    final = speedProfile(points, closed, car, true, entrySpeedKph);
  }
  // A coarse speed solve must never replace the smooth seed with a slower final solution.
  return { points, profile: final, seedDuration, offset, limits };
}
