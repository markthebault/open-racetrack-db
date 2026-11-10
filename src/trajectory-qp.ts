/** Independent browser implementation of TUM's iterative minimum-curvature QP concept.
 * Lateral cubic B-spline controls couple a whole corner sequence. Each QP linearizes
 * curvature, bounds vehicle-centre offsets and limits the trust region. This is not
 * the upstream TUM minimum-time/IPOPT implementation. See Docs/30-browser-trajectory.md.
 */
import {
  geometry,
  speedProfile,
  type PathPoint,
  type Station,
} from "../scripts/ideal-line-solver";
import type { CarProfile } from "./ideal-line-model";
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
type Row = { ids: number[]; values: number[]; residual: number };
type Basis = { ids: number[]; values: number[] };

/** Banded Cholesky, with a small Woodbury correction for periodic seam rows. */
function quadraticSystem(rows: Row[], count: number, ridge: number) {
  const bandwidth = 6,
    stride = bandwidth + 1;
  const band = new Float64Array(count * stride),
    seam: Row[] = [];
  for (let i = 0; i < count; i++) band[i * stride] = ridge;
  for (const row of rows) {
    if (Math.max(...row.ids) - Math.min(...row.ids) > bandwidth) {
      seam.push(row);
      continue;
    }
    for (let a = 0; a < row.ids.length; a++)
      for (let b = 0; b <= a; b++) {
        const i = Math.max(row.ids[a], row.ids[b]),
          j = Math.min(row.ids[a], row.ids[b]);
        band[i * stride + i - j] += row.values[a] * row.values[b];
      }
  }
  for (let i = 0; i < count; i++) {
    for (let j = Math.max(0, i - bandwidth); j <= i; j++) {
      let value = band[i * stride + i - j];
      for (let k = Math.max(0, i - bandwidth, j - bandwidth); k < j; k++)
        value -= band[i * stride + i - k] * band[j * stride + j - k];
      band[i * stride + i - j] =
        i === j ? Math.sqrt(Math.max(value, 1e-15)) : value / band[j * stride];
    }
  }
  const solveBand = (rhs: Float64Array) => {
    const x = rhs.slice();
    for (let i = 0; i < count; i++) {
      for (let d = 1; d <= Math.min(bandwidth, i); d++)
        x[i] -= band[i * stride + d] * x[i - d];
      x[i] /= band[i * stride];
    }
    for (let i = count - 1; i >= 0; i--) {
      for (let d = 1; d <= Math.min(bandwidth, count - 1 - i); d++)
        x[i] -= band[(i + d) * stride + d] * x[i + d];
      x[i] /= band[i * stride];
    }
    return x;
  };
  const columns = seam.map((row) => {
    const rhs = new Float64Array(count);
    row.ids.forEach((id, j) => (rhs[id] = row.values[j]));
    return solveBand(rhs);
  });
  const m = seam.length,
    small = new Float64Array(m * m);
  for (let i = 0; i < m; i++)
    for (let j = 0; j <= i; j++) {
      let v =
        (i === j ? 1 : 0) +
        seam[i].ids.reduce(
          (s, id, k) => s + seam[i].values[k] * columns[j][id],
          0,
        );
      for (let k = 0; k < j; k++) v -= small[i * m + k] * small[j * m + k];
      small[i * m + j] =
        i === j ? Math.sqrt(Math.max(v, 1e-15)) : v / small[j * m + j];
    }
  return (rhs: Float64Array) => {
    const x = solveBand(rhs),
      w = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      w[i] = seam[i].ids.reduce((s, id, k) => s + seam[i].values[k] * x[id], 0);
      for (let j = 0; j < i; j++) w[i] -= small[i * m + j] * w[j];
      w[i] /= small[i * m + i];
    }
    for (let i = m - 1; i >= 0; i--) {
      for (let j = i + 1; j < m; j++) w[i] -= small[j * m + i] * w[j];
      w[i] /= small[i * m + i];
    }
    for (let j = 0; j < m; j++)
      for (let i = 0; i < count; i++) x[i] -= columns[j][i] * w[j];
    return x;
  };
}

function boxQP(rows: Row[], lower: number[], upper: number[], count: number) {
  const gradient = new Float64Array(count),
    diagonal = new Float64Array(count);
  for (const row of rows)
    row.ids.forEach((id, j) => {
      gradient[id] += row.values[j] * row.residual;
      diagonal[id] += row.values[j] ** 2;
    });
  // Scale for a stable, resolution-independent ADMM penalty.
  const scale = Math.sqrt(count / diagonal.reduce((s, x) => s + x, 0));
  const normalized = rows.map((r) => ({
    ...r,
    values: r.values.map((v) => v * scale),
  }));
  for (let i = 0; i < count; i++) gradient[i] *= scale * scale;
  const rho = 0.01,
    damping = 1e-7,
    solve = quadraticSystem(normalized, count, rho + damping);
  const z = new Float64Array(count),
    u = new Float64Array(count),
    rhs = new Float64Array(count);
  let primal = Infinity,
    dual = Infinity,
    iterations = 0;
  for (; iterations < 1200; iterations++) {
    for (let i = 0; i < count; i++) rhs[i] = -gradient[i] + rho * (z[i] - u[i]);
    const x = solve(rhs);
    primal = 0;
    dual = 0;
    for (let i = 0; i < count; i++) {
      const old = z[i],
        relaxed = 1.6 * x[i] - 0.6 * old;
      z[i] = clamp(relaxed + u[i], lower[i], upper[i]);
      u[i] += relaxed - z[i];
      primal = Math.max(primal, Math.abs(x[i] - z[i]));
      dual = Math.max(dual, rho * Math.abs(z[i] - old));
    }
    if (primal < 0.001 && dual < 0.00001) break;
  }
  return {
    delta: z,
    iterations,
    primal,
    dual,
    converged: primal < 0.001 && dual < 0.00001,
  };
}
export interface TrajectoryOptions {
  controlStepM?: number;
  timeRefinement?: boolean;
  feasible?: (
    i: number,
    p: PathPoint,
    previous: PathPoint,
    next: PathPoint,
  ) => boolean;
}
export function optimizeTrajectory(
  stations: Station[],
  closed: boolean,
  car: CarProfile,
  options: TrajectoryOptions = {},
) {
  const profileFor = (points: PathPoint[]) =>
    speedProfile(points, closed, car, true, 100, 3, "newton");
  const started = performance.now(),
    n = stations.length;
  const ds =
    stations
      .slice(1)
      .reduce(
        (s, p, i) => s + Math.hypot(p.x - stations[i].x, p.z - stations[i].z),
        0,
      ) /
    (n - 1);
  const spans = Math.max(
      8,
      Math.ceil(((closed ? n : n - 1) * ds) / (options.controlStepM ?? 6)),
    ),
    count = closed ? spans : spans + 1;
  const index = (i: number) => (closed ? (i + n) % n : clamp(i, 0, n - 1));
  const controlIndex = (i: number) =>
    closed ? (i + count) % count : clamp(i, 0, count - 1);
  const basis: Basis[] = stations.map((_, i) => {
    const s = (i / (closed ? n : n - 1)) * spans,
      j = Math.floor(s),
      t = s - j;
    const weights = [
      (1 - t) ** 3 / 6,
      (3 * t ** 3 - 6 * t * t + 4) / 6,
      (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6,
      t ** 3 / 6,
    ];
    const merged = new Map<number, number>();
    weights.forEach((w, k) => {
      const id = controlIndex(j + k - 1);
      merged.set(id, (merged.get(id) ?? 0) + w);
    });
    return { ids: [...merged.keys()], values: [...merged.values()] };
  });
  const limit = Math.max(
    0,
    Math.min(...stations.map((p) => p.halfWidth)) - car.widthM / 2 - 0.12,
  );
  let controls = new Float64Array(count);
  const limits = Array.from({ length: count }, (_, i) =>
    !closed && (i < 2 || i >= count - 2) ? 0 : limit,
  );
  const path = (values: Float64Array) =>
    stations.map((s, i) => {
      const a = basis[i].ids.reduce(
        (sum, id, j) => sum + basis[i].values[j] * values[id],
        0,
      );
      return { x: s.x + s.nx * a, z: s.z + s.nz * a, y: s.y };
    });
  const curvatureCost = (points: PathPoint[]) => {
    let cost = 0;
    for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
      const a = points[index(i - 1)],
        b = points[i],
        c = points[index(i + 1)];
      const vx = (c.x - a.x) / (2 * ds),
        vz = (c.z - a.z) / (2 * ds),
        ax = (c.x - 2 * b.x + a.x) / (ds * ds),
        az = (c.z - 2 * b.z + a.z) / (ds * ds);
      const k =
        (vx * az - vz * ax) / Math.max(1e-9, (vx * vx + vz * vz) ** 1.5);
      cost += k * k * ds;
    }
    return cost;
  };
  const centerPoints = path(controls),
    centerCost = curvatureCost(centerPoints);
  let points = centerPoints,
    cost = centerCost,
    outer = 0,
    maxChange = Infinity,
    qpConverged = true;
  const history: {
    cost: number;
    changeM: number;
    qpIterations: number;
    primal: number;
    dual: number;
  }[] = [];
  for (; outer < 80; outer++) {
    const rows: Row[] = [];
    for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
      const a = index(i - 1),
        b = i,
        c = index(i + 1),
        p = points[a],
        q = points[b],
        r = points[c];
      const vx = (r.x - p.x) / (2 * ds),
        vz = (r.z - p.z) / (2 * ds),
        ax = (r.x - 2 * q.x + p.x) / (ds * ds),
        az = (r.z - 2 * q.z + p.z) / (ds * ds);
      const v2 = vx * vx + vz * vz,
        denom = Math.max(1e-9, v2 ** 1.5),
        k = (vx * az - vz * ax) / denom;
      const changes = new Map<
        number,
        { vx: number; vz: number; ax: number; az: number }
      >();
      for (const [s, vw, aw] of [
        [a, -1 / (2 * ds), 1 / (ds * ds)],
        [b, 0, -2 / (ds * ds)],
        [c, 1 / (2 * ds), 1 / (ds * ds)],
      ]) {
        basis[s].ids.forEach((id, j) => {
          const w = basis[s].values[j],
            old = changes.get(id) ?? { vx: 0, vz: 0, ax: 0, az: 0 };
          old.vx += stations[s].nx * w * vw;
          old.vz += stations[s].nz * w * vw;
          old.ax += stations[s].nx * w * aw;
          old.az += stations[s].nz * w * aw;
          changes.set(id, old);
        });
      }
      const ids = [...changes.keys()].sort((a, b) => a - b),
        weight = Math.sqrt(ds);
      rows.push({
        ids,
        values: ids.map((id) => {
          const d = changes.get(id)!;
          return (
            weight *
            ((d.vx * az - d.vz * ax + vx * d.az - vz * d.ax) / denom -
              (3 * k * (vx * d.vx + vz * d.vz)) / v2)
          );
        }),
        residual: k * weight,
      });
    }
    const qp = boxQP(
      rows,
      limits.map((v, i) => Math.max(-v - controls[i], -2)),
      limits.map((v, i) => Math.min(v - controls[i], 2)),
      count,
    );
    qpConverged = qp.converged;
    let next = controls,
      trial = points,
      nextCost = cost;
    maxChange = 0;
    for (const step of [1, 0.5, 0.25, 0.125, 0.0625]) {
      const candidate = controls.map((v, i) => v + step * qp.delta[i]),
        candidatePath = path(candidate),
        candidateCost = curvatureCost(candidatePath);
      if (candidateCost < cost * (1 - 1e-10)) {
        next = candidate;
        trial = candidatePath;
        nextCost = candidateCost;
        maxChange = qp.delta.reduce(
          (s, v) => Math.max(s, Math.abs(v * step)),
          0,
        );
        break;
      }
    }
    history.push({
      cost: nextCost,
      changeM: maxChange,
      qpIterations: qp.iterations,
      primal: qp.primal,
      dual: qp.dual,
    });
    controls = next;
    points = trial;
    const improvement = (cost - nextCost) / Math.max(cost, 1e-10);
    cost = nextCost;
    if (maxChange < 0.005 || improvement < 1e-6) break;
  }
  // A smooth global retreat maintains spline continuity if the swept body needs more space
  // than the normal-width bounds (yaw and tight corners). Never repair individual vertices.
  const envelopeOK = (p: PathPoint[], affected?: number[]) =>
    !options.feasible ||
    (affected ?? Array.from({ length: n }, (_, i) => i)).every((i) => {
      const q = p[i];
      if (!options.feasible!(i, q, p[index(i - 1)], p[index(i + 1)]))
        return false;
      if (!closed && i === n - 1) return true;
      const r = p[index(i + 1)];
      return [0.25, 0.5, 0.75].every((t) =>
        options.feasible!(
          i,
          {
            x: q.x + t * (r.x - q.x),
            z: q.z + t * (r.z - q.z),
            y: q.y + t * (r.y - q.y),
          },
          q,
          r,
        ),
      );
    });
  let retreat = 1;
  while (!envelopeOK(points) && retreat > 0.1) {
    controls = controls.map((x) => x * 0.97);
    retreat *= 0.97;
    points = path(controls);
  }
  if (!envelopeOK(points))
    throw Error(
      "The calculated trajectory cannot fit the vehicle envelope in the estimated corridor",
    );
  const seedControls = controls.slice(),
    seedPoints = points;
  const seed = profileFor(points);
  let accepted = 0,
    candidates = 0,
    denseBest = seed.duration;
  const timeHistory: { before: number; after: number; feasibleTime: number }[] =
    [];
  if (options.timeRefinement !== false) {
    // A curvature optimum can sit on the outside of an entire hairpin. Explore
    // a distance-minimizing seed as well; choose by actual lap time, never by appearance.
    const distanceRows: Row[] = [];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const j = index(i + 1),
        changes = new Map<number, { x: number; z: number }>();
      for (const [station, sign] of [
        [i, -1],
        [j, 1],
      ])
        basis[station].ids.forEach((id, k) => {
          const d = changes.get(id) ?? { x: 0, z: 0 };
          d.x += sign * basis[station].values[k] * stations[station].nx;
          d.z += sign * basis[station].values[k] * stations[station].nz;
          changes.set(id, d);
        });
      const ids = [...changes.keys()].sort((a, b) => a - b),
        weight = 1 / Math.sqrt(ds);
      distanceRows.push({
        ids,
        values: ids.map((id) => changes.get(id)!.x * weight),
        residual: (stations[j].x - stations[i].x) * weight,
      });
      distanceRows.push({
        ids,
        values: ids.map((id) => changes.get(id)!.z * weight),
        residual: (stations[j].z - stations[i].z) * weight,
      });
    }
    const shorter = boxQP(
      distanceRows,
      limits.map((v) => -v),
      limits,
      count,
    ).delta;
    for (const mix of [0.25, 0.5, 0.75, 1]) {
      let trial = seedControls.map((v, i) => v * (1 - mix) + shorter[i] * mix),
        p = path(trial),
        retreats = 0;
      while (!envelopeOK(p) && retreats++ < 35) {
        trial = trial.map((v) => v * 0.97);
        p = path(trial);
      }
      if (!envelopeOK(p)) continue;
      const time = profileFor(p).duration;
      if (time < denseBest) {
        controls = trial;
        points = p;
        denseBest = time;
      }
    }
    // Optimize smooth control patches against the same aero/tyre/power/braking model.
    // Every feasible candidate uses the same dense profile; no coarse-ranking veto.
    let currentProfile = profileFor(points),
      runningSpeed = currentProfile.speed.slice(),
      runningDs = currentProfile.ds.slice();
    denseBest = currentProfile.duration;
    const evaluatePatch = (p: PathPoint[], station: number, reach: number) => {
      const extra = Math.ceil(350 / ds),
        start = closed
          ? station - reach - extra
          : Math.max(0, station - reach - extra),
        end = closed
          ? station + reach + extra
          : Math.min(n - 1, station + reach + extra);
      if (end - start + 1 >= n - 2) {
        const profile = profileFor(p);
        return {
          time: profile.duration,
          commit: () => {
            runningSpeed = profile.speed.slice();
            runningDs = profile.ds.slice();
          },
        };
      }
      const ids = Array.from({ length: end - start + 1 }, (_, j) =>
        index(start + j),
      );
      // Include the true neighbouring geometry beyond both fixed-speed joins.
      let before = 0,
        after = 0,
        travel = 0;
      while ((closed || start - before > 0) && travel < 5 && before < n) {
        const a = p[index(start - before)],
          b = p[index(start - before - 1)];
        travel += Math.hypot(a.x - b.x, a.z - b.z);
        before++;
      }
      travel = 0;
      while ((closed || end + after < n - 1) && travel < 5 && after < n) {
        const a = p[index(end + after)],
          b = p[index(end + after + 1)];
        travel += Math.hypot(a.x - b.x, a.z - b.z);
        after++;
      }
      const padded = Array.from(
          { length: ids.length + before + after },
          (_, j) => p[index(start - before + j)],
        ),
        g = geometry(padded, false, 3);
      const localGeometry = {
        ds: g.ds.slice(before, before + ids.length),
        curvature: g.curvature.slice(before, before + ids.length),
      };
      const first = ids[0],
        last = ids.at(-1)!,
        entry = closed || start > 0 ? runningSpeed[first] * 3.6 : 100,
        exit = closed || end < n - 1 ? runningSpeed[last] * 3.6 : undefined;
      const profile = speedProfile(
        ids.map((i) => p[i]),
        false,
        car,
        true,
        entry,
        3,
        "newton",
        { exitSpeedKph: exit, geometry: localGeometry },
      );
      if (
        ((closed || start > 0) &&
          Math.abs(profile.speed[0] - runningSpeed[first]) > 1e-6) ||
        (exit !== undefined &&
          Math.abs(profile.speed.at(-1)! - runningSpeed[last]) > 1e-6)
      )
        return { time: Infinity, commit: () => {} };
      let oldTime = 0;
      for (let j = 0; j < ids.length - 1; j++)
        oldTime +=
          (2 * runningDs[ids[j]]) /
          (runningSpeed[ids[j]] + runningSpeed[ids[j + 1]]);
      return {
        time: denseBest - oldTime + profile.duration,
        commit: () => {
          for (let j = 0; j < ids.length; j++)
            runningSpeed[ids[j]] = profile.speed[j];
          for (let j = 0; j < ids.length - 1; j++)
            runningDs[ids[j]] = profile.ds[j];
        },
      };
    };
    const referenceK = geometry(centerPoints, closed, 20).curvature;
    const ranked = referenceK
      .map((k, i) => ({ i, k }))
      .filter((p) => Math.abs(p.k) > 0.0035)
      .sort((a, b) => Math.abs(b.k) - Math.abs(a.k));
    const turns: number[] = [];
    for (const p of ranked)
      if (
        turns.every((i) => {
          const gap = closed
            ? Math.min(Math.abs(i - p.i), n - Math.abs(i - p.i))
            : Math.abs(i - p.i);
          return (
            gap * ds >= (Math.sign(referenceK[i]) === Math.sign(p.k) ? 35 : 20)
          );
        })
      )
        turns.push(p.i);
    for (let sweep = 0; sweep < 3; sweep++) {
      const oldControls = controls.slice(),
        oldPoints = points,
        oldProfile = currentProfile,
        oldAccepted = accepted;
      for (const spanM of [100, 60, 35]) {
        const radius = Math.max(
          3,
          Math.round(spanM / (((closed ? n : n - 1) * ds) / spans)),
        );
        const centres = new Set<number>();
        for (const station of turns) {
          const c = Math.round((station / (closed ? n : n - 1)) * spans);
          for (const d of spanM === 100
            ? [-Math.round(radius / 2), 0, Math.round(radius / 2)]
            : [0]) {
            const i = controlIndex(c + d);
            if (closed || (i >= radius && i < count - radius)) centres.add(i);
          }
        }
        for (const center of [...centres].sort((a, b) => a - b)) {
          const station = Math.round((center / spans) * (closed ? n : n - 1));
          const affected: number[] = [];
          const reach = Math.ceil(
            ((radius + 3) / spans) * (closed ? n : n - 1),
          );
          for (let d = -reach; d <= reach; d++)
            affected.push(index(station + d));
          const ids: number[] = [],
            weights: number[] = [];
          for (let d = -radius; d <= radius; d++) {
            const id = controlIndex(center + d);
            if (limits[id]) {
              ids.push(id);
              weights.push((1 + Math.cos((Math.PI * d) / radius)) / 2);
            }
          }
          let winner = controls,
            winnerPath = points;
          for (const shift of [-2.5, 2.5, -0.5, 0.5]) {
            const trial = controls.slice();
            ids.forEach(
              (id, j) =>
                (trial[id] = clamp(
                  controls[id] + shift * weights[j],
                  -limits[id],
                  limits[id],
                )),
            );
            const p = path(trial);
            candidates++;
            if (envelopeOK(p, affected)) {
              const evaluation = evaluatePatch(p, station, reach),
                preciseTime = evaluation.time;
              if (preciseTime < denseBest - 0.0001) {
                evaluation.commit();
                denseBest = preciseTime;
                winner = trial;
                winnerPath = p;
                accepted++;
              }
            }
          }
          controls = winner;
          points = winnerPath;
        }
      }
      const feasibleTime = denseBest;
      currentProfile = profileFor(points);
      if (currentProfile.duration > oldProfile.duration + 1e-5) {
        controls = oldControls;
        points = oldPoints;
        currentProfile = oldProfile;
        accepted = oldAccepted;
      }
      timeHistory.push({
        before: oldProfile.duration,
        after: currentProfile.duration,
        feasibleTime,
      });
      runningSpeed = currentProfile.speed.slice();
      runningDs = currentProfile.ds.slice();
      denseBest = currentProfile.duration;
      if (oldProfile.duration - currentProfile.duration < 0.002) break;
    }
  }
  if (!envelopeOK(points))
    throw Error("Time refinement failed the final vehicle-envelope check");
  let profile = profileFor(points);
  if (profile.duration > seed.duration) {
    controls = seedControls;
    points = seedPoints;
    profile = seed;
    accepted = 0;
  }
  const centerProfile = profileFor(centerPoints);
  return {
    points,
    profile,
    diagnostics: {
      method: "bounded-lap-time-refinement-v2",
      timeHistory,
      controlStepM: ((closed ? n : n - 1) * ds) / spans,
      controls: count,
      iterations: history.length,
      qpConverged,
      converged:
        maxChange < 0.005 ||
        (history.length > 1 &&
          Math.abs(history.at(-1)!.cost - history.at(-2)!.cost) /
            history.at(-2)!.cost <
            1e-6),
      history,
      centerCost,
      minimumCurvatureCost: curvatureCost(seedPoints),
      finalCost: curvatureCost(points),
      centerDurationS: centerProfile.duration,
      minimumCurvatureDurationS: seed.duration,
      durationS: profile.duration,
      timeCandidates: candidates,
      timeAccepted: accepted,
      envelopeRetreatFactor: retreat,
      maximumOffsetM: controls.reduce((s, v) => Math.max(s, Math.abs(v)), 0),
      elapsedMs: performance.now() - started,
    },
  };
}
