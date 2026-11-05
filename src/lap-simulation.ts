import { CatmullRomCurve3, Vector3 } from "three";
import { geometryPaths, type Layout } from "../schemas/data";
import { plane, type Position } from "./geo";
import { indexBorders, borderSection } from "./border-sections";

export const GRAVITY = 9.80665;
export const DEFAULT_CAR = {
  powerHp: 300,
  massKg: 1400,
  topSpeedKph: 260,
  brakingG: 1.2,
  lateralG: 1.1,
  efficiency: 0.85,
  dragArea: 0.66,
  rollingResistance: 0.015,
};
export type CarSpec = typeof DEFAULT_CAR;
export type ElevationAnchor = [number, number];
export type LapRecipe = import("../schemas/track-model").LapModel3D;
export interface RoadPoint {
  x: number;
  z: number;
  y: number;
  s: number;
  ds: number;
  left: number;
  right: number;
  nx: number;
  nz: number;
  curvature: number;
  grade: number;
}
export interface Road {
  points: RoadPoint[];
  length: number;
  step: number;
  origin: Position;
  recipe: LapRecipe;
  interpolatedSections: number;
}
export interface Lap {
  road: Road;
  car: CarSpec;
  speed: number[];
  time: number[];
  duration: number;
}

/** Periodic monotone cubic interpolation: anchors are exact and hills cannot overshoot. */
export function roadHeight(anchors: ElevationAnchor[], station: number) {
  const end = anchors.at(-1)![0];
  const s = ((station % end) + end) % end;
  const n = anchors.length - 1;
  const slopes = anchors
    .slice(0, -1)
    .map((p, i) => (anchors[i + 1][1] - p[1]) / (anchors[i + 1][0] - p[0]));
  const tangent = (i: number) => {
    const previous = (i - 1 + n) % n,
      next = i % n;
    const a = slopes[previous],
      b = slopes[next];
    if (a * b <= 0) return 0;
    const ha = anchors[previous + 1][0] - anchors[previous][0],
      hb = anchors[next + 1][0] - anchors[next][0];
    return (3 * (ha + hb)) / ((2 * hb + ha) / a + (hb + 2 * ha) / b);
  };
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

/** Convert only existing compact geographic data to a disposable metre-scale road. */
export function buildRoad(layout: Layout): Road {
  const recipe = layout.metadata.model3d;
  if (!recipe) throw new Error("This layout has no embedded 3D model data.");
  if (recipe.kind === "surface") throw new Error("This layout has no playable closed-lap model.");
  const trace = geometryPaths(
    layout.features.find((f) => f.properties.role === "trace")!.geometry,
  )[0];
  const origin =
    (layout.metadata.timing?.start as Position | undefined) ?? trace[0];
  const projection = plane(origin);
  const raw = trace.slice(0, -1).map((p) => {
    const [x, y] = projection.to(p);
    return new Vector3(x, 0, -y);
  });
  const curve = new CatmullRomCurve3(raw, true, "centripetal");
  curve.arcLengthDivisions = 16000;
  const count = Math.ceil(curve.getLength() / 3),
    length = curve.getLength(),
    step = length / count;
  // The existing GPS gate is the finish line; the venue's distance anchors use its start line.
  let finish = 0,
    closest = Infinity;
  for (let i = 0; i < count; i++) {
    const d = curve.getPointAt(i / count).lengthSq();
    if (d < closest) {
      closest = d;
      finish = i / count;
    }
  }
  const start = (finish + recipe.startOffsetM / length) % 1;
  const borders = layout.features
    .filter(
      (f) => f.properties.role === "inner" || f.properties.role === "outer",
    )
    .flatMap((f) => geometryPaths(f.geometry))
    .map((path) =>
      path.map((p) => {
        const [x, y] = projection.to(p);
        return [x, -y] as Position;
      }),
    );
  if (borders.length !== 2)
    throw new Error("This lap needs two continuous source borders.");
  const index = indexBorders(borders);
  let interpolatedSections = 0;
  const points: RoadPoint[] = [];
  for (let i = 0; i < count; i++) {
    const u = (start + i / count) % 1,
      p = curve.getPointAt(u),
      t = curve.getTangentAt(u).normalize();
    const nx = t.z,
      nz = -t.x; // driver left in east/up/south coordinates
    const section = borderSection(index, p.x, p.z, nx, nz);
    if (!section) interpolatedSections++;
    // Missing cross-sections are repaired below by interpolation, never a silently invented width.
    points.push({
      x: p.x,
      z: p.z,
      y: roadHeight(recipe.elevation, (i / count) * recipe.referenceLengthM),
      s: i * step,
      ds: step,
      left: section?.[0] ?? NaN,
      right: section?.[1] ?? NaN,
      nx,
      nz,
      curvature: 0,
      grade: 0,
    });
  }
  for (const key of ["left", "right"] as const) {
    if (points.every((p) => !Number.isFinite(p[key])))
      throw new Error("Source borders do not intersect this trace.");
    for (let i = 0; i < count; i++)
      if (!Number.isFinite(points[i][key])) {
        let a = 1,
          b = 1;
        while (!Number.isFinite(points[(i - a + count) % count][key])) a++;
        while (!Number.isFinite(points[(i + b) % count][key])) b++;
        points[i][key] =
          (points[(i - a + count) % count][key] * b +
            points[(i + b) % count][key] * a) /
          (a + b);
      }
  }
  // Recenter the driving path within actual asymmetric source edges. Geometry retains both edges.
  const mid = points.map((p) => ({
    x: p.x + (p.nx * (p.left - p.right)) / 2,
    z: p.z + (p.nz * (p.left - p.right)) / 2,
  }));
  // Curvature uses a 24m chord to suppress centimetre-scale trace/border digitisation noise.
  const radius = 4;
  for (let i = 0; i < count; i++) {
    const a = mid[(i - radius + count) % count],
      b = mid[i],
      c = mid[(i + radius) % count];
    const ab = Math.hypot(b.x - a.x, b.z - a.z),
      bc = Math.hypot(c.x - b.x, c.z - b.z),
      ac = Math.hypot(c.x - a.x, c.z - a.z);
    points[i].curvature =
      (2 * ((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))) /
      Math.max(1e-6, ab * bc * ac);
    points[i].grade =
      (points[(i + 1) % count].y - points[(i - 1 + count) % count].y) /
      (2 * step);
  }
  let travelled = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    points[i].s = travelled;
    points[i].ds = Math.hypot(
      mid[j].x - mid[i].x,
      mid[j].z - mid[i].z,
      points[j].y - points[i].y,
    );
    travelled += points[i].ds;
  }
  for (let i = 0; i < count; i++) {
    const previous = (i - 1 + count) % count;
    points[i].grade =
      (points[(i + 1) % count].y - points[previous].y) /
      (points[previous].ds + points[i].ds);
  }
  return {
    points,
    length: travelled,
    step: travelled / count,
    origin,
    recipe,
    interpolatedSections,
  };
}

export function driveAcceleration(
  speed: number,
  grade: number,
  curvature: number,
  car: CarSpec,
) {
  const lat = (speed * speed * Math.abs(curvature)) / (car.lateralG * GRAVITY);
  const grip = 0.55 * GRAVITY * Math.sqrt(Math.max(0, 1 - lat * lat));
  const power =
    (car.powerHp * 745.699872 * car.efficiency) /
    (car.massKg * Math.max(speed, 8));
  const resistance =
    (0.5 * 1.225 * car.dragArea * speed * speed) / car.massKg +
    car.rollingResistance * GRAVITY;
  return Math.min(grip, power) - resistance - GRAVITY * grade;
}
export function brakeDeceleration(
  speed: number,
  grade: number,
  curvature: number,
  car: CarSpec,
) {
  const lat = (speed * speed * Math.abs(curvature)) / (car.lateralG * GRAVITY);
  // Conservative: ignore drag assistance, so tyre demand remains below the braking limit.
  return Math.max(
    0,
    car.brakingG * GRAVITY * Math.sqrt(Math.max(0, 1 - lat * lat)) +
      GRAVITY * grade,
  );
}

/** Periodic forward power / backward braking solver with a combined-grip ellipse. Flying lap. */
export function simulateLap(road: Road, car: CarSpec = DEFAULT_CAR): Lap {
  if (Object.values(car).some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error("Car values must be positive.");
  const { points } = road,
    n = points.length;
  const speed = points.map((p, i) =>
    Math.min(
      car.topSpeedKph / 3.6,
      Math.sqrt(
        (car.lateralG * GRAVITY) /
          Math.max(
            Math.abs(p.curvature),
            Math.abs(points[(i + 1) % n].curvature),
            Math.abs(points[(i - 1 + n) % n].curvature),
            1e-8,
          ),
      ),
    ),
  );
  // Conservative endpoint bound: evaluate grip at the larger endpoint speed and curvature.
  for (let pass = 0; pass < 100; pass++) {
    let change = 0;
    for (let i = 0; i < n; i++) {
      const step = points[i].ds;
      const j = (i + 1) % n,
        grade = (points[j].y - points[i].y) / step,
        k = Math.max(
          Math.abs(points[i].curvature),
          Math.abs(points[j].curvature),
        );
      let low = 0,
        high = speed[j];
      for (let b = 0; b < 28; b++) {
        const mid = (low + high) / 2;
        const required = (mid * mid - speed[i] ** 2) / (2 * step);
        if (
          required <= driveAcceleration(Math.max(speed[i], mid), grade, k, car)
        )
          low = mid;
        else high = mid;
      }
      const v = Math.max(1, low);
      if (v < speed[j]) {
        change = Math.max(change, speed[j] - v);
        speed[j] = v;
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      const step = points[i].ds;
      const j = (i + 1) % n,
        grade = (points[j].y - points[i].y) / step,
        k = Math.max(
          Math.abs(points[i].curvature),
          Math.abs(points[j].curvature),
        );
      let low = 0,
        high = speed[i];
      for (let b = 0; b < 28; b++) {
        const mid = (low + high) / 2;
        const required = (mid * mid - speed[j] ** 2) / (2 * step);
        if (
          required <= brakeDeceleration(Math.max(mid, speed[j]), grade, k, car)
        )
          low = mid;
        else high = mid;
      }
      const v = Math.max(1, low);
      if (v < speed[i]) {
        change = Math.max(change, speed[i] - v);
        speed[i] = v;
      }
    }
    if (change < 1e-7) break;
  }
  const time = [0];
  for (let i = 0; i < n; i++)
    time.push(time[i] + (2 * points[i].ds) / (speed[i] + speed[(i + 1) % n]));
  return { road, car, speed, time, duration: time[n] };
}

export function sampleLap(lap: Lap, elapsed: number) {
  const time = Math.max(0, Math.min(lap.duration, elapsed));
  let lo = 0,
    hi = lap.speed.length - 1;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (lap.time[m] <= time) lo = m;
    else hi = m - 1;
  }
  const i = lo,
    j = (i + 1) % lap.speed.length,
    dt = lap.time[i + 1] - lap.time[i],
    t = time - lap.time[i];
  const acceleration = (lap.speed[j] - lap.speed[i]) / dt;
  const fraction = Math.min(
    1,
    (lap.speed[i] * t + 0.5 * acceleration * t * t) / lap.road.points[i].ds,
  );
  const a = lap.road.points[i],
    b = lap.road.points[j],
    lerp = (x: number, y: number) => x + (y - x) * fraction;
  const speed = lap.speed[i] + acceleration * t;
  const curvature = lerp(a.curvature, b.curvature),
    grade = lerp(a.grade, b.grade);
  return {
    index: i,
    fraction,
    time,
    distance: Math.min(lap.road.length, a.s + fraction * a.ds),
    speed,
    acceleration,
    lateralG: (speed * speed * curvature) / GRAVITY,
    grade,
    x: lerp(a.x, b.x),
    y: lerp(a.y, b.y),
    z: lerp(a.z, b.z),
    nx: lerp(a.nx, b.nx),
    nz: lerp(a.nz, b.nz),
    left: lerp(a.left, b.left),
    right: lerp(a.right, b.right),
  };
}
export function formatLapTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}
