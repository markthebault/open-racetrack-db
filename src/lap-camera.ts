import { Vector3 } from "three";
import type { Road } from "./lap-simulation";

export type FollowCamera = "chase" | "driver" | "above";
export interface CameraPose {
  position: Vector3;
  target: Vector3;
}

/** Continuous metre-based sampling of the actual driving midpoint, including across the seam. */
export class CameraCourse {
  private centres: Vector3[];
  constructor(private road: Road) {
    this.centres = road.points.map((p) => {
      const offset = (p.left - p.right) / 2;
      return new Vector3(p.x + p.nx * offset, p.y + 0.15, p.z + p.nz * offset);
    });
  }
  point(distance: number): Vector3 {
    const { points, length } = this.road,
      n = points.length;
    const open = this.road.recipe.kind === "run";
    const index = (i: number) =>
      open ? Math.max(0, Math.min(n - 1, i)) : (i + n) % n;
    const s = open
      ? Math.max(0, Math.min(length, distance))
      : ((distance % length) + length) % length;
    let lo = 0,
      hi = n - (open ? 2 : 1);
    while (lo < hi) {
      const m = Math.ceil((lo + hi) / 2);
      if (points[m].s <= s) lo = m;
      else hi = m - 1;
    }
    const i = lo,
      j = index(i + 1),
      prev = index(i - 1),
      next = index(i + 2);
    const h = points[i].ds,
      u = (s - points[i].s) / h;
    const tangentA = this.centres[j]
      .clone()
      .sub(this.centres[prev])
      .multiplyScalar(h / (points[prev].ds + h));
    const tangentB = this.centres[next]
      .clone()
      .sub(this.centres[i])
      .multiplyScalar(h / (h + points[j].ds));
    return this.centres[i]
      .clone()
      .multiplyScalar(2 * u ** 3 - 3 * u * u + 1)
      .addScaledVector(tangentA, u ** 3 - 2 * u * u + u)
      .addScaledVector(this.centres[j], -2 * u ** 3 + 3 * u * u)
      .addScaledVector(tangentB, u ** 3 - u * u);
  }
  /** Symmetric spatial filter suppresses digitisation noise without flattening real elevation. */
  smoothPoint(distance: number, radius = 12) {
    const result = new Vector3();
    let total = 0;
    for (let i = -3; i <= 3; i++) {
      const weight = Math.exp((-i * i) / 4);
      result.addScaledVector(this.point(distance + (i * radius) / 3), weight);
      total += weight;
    }
    return result.multiplyScalar(1 / total);
  }
  direction(distance: number, span = 20) {
    return this.smoothPoint(distance + span)
      .sub(this.smoothPoint(distance - span))
      .normalize();
  }
  desired(distance: number, mode: FollowCamera): CameraPose {
    const anchor = this.smoothPoint(distance);
    const forward = this.direction(distance);
    forward.y = 0;
    forward.normalize();
    if (mode === "above")
      return {
        position: anchor.clone().add(new Vector3(0, 170, 60)),
        target: anchor,
      };
    if (mode === "driver")
      return {
        position: this.point(distance).add(new Vector3(0, 1.3, 0)),
        target: (this.road.recipe.kind === "run"
          ? this.smoothPoint(distance).addScaledVector(forward, 40)
          : this.smoothPoint(distance + 40)
        ).add(new Vector3(0, 1.3, 0)),
      };
    return {
      position: anchor
        .clone()
        .addScaledVector(forward, -20)
        .add(new Vector3(0, 7.5, 0)),
      target: anchor
        .clone()
        .addScaledVector(forward, 12)
        .add(new Vector3(0, 1.4, 0)),
    };
  }
}

/** Exact critically damped spring for a linearly moving target, integrated in seconds. */
export function dampVector(
  position: Vector3,
  velocity: Vector3,
  target: Vector3,
  dt: number,
  smoothTime: number,
  previousTarget = target,
) {
  if (dt <= 0) return;
  const omega = 2 / smoothTime,
    decay = Math.exp(-omega * dt);
  const targetVelocity = target
    .clone()
    .sub(previousTarget)
    .multiplyScalar(1 / dt);
  const offset = position.clone().sub(previousTarget);
  const relativeVelocity = velocity.clone().sub(targetVelocity);
  const change = relativeVelocity.clone().addScaledVector(offset, omega);
  position
    .copy(target)
    .addScaledVector(offset, decay)
    .addScaledVector(change, dt * decay);
  velocity
    .copy(relativeVelocity)
    .addScaledVector(change, -omega * dt)
    .multiplyScalar(decay)
    .add(targetVelocity);
}

export class LapCameraRig {
  readonly course: CameraCourse;
  private pose?: CameraPose;
  private positionVelocity = new Vector3();
  private targetVelocity = new Vector3();
  private lastTime?: number;
  private mode?: FollowCamera;
  private previousDesired?: CameraPose;
  constructor(road: Road) {
    this.course = new CameraCourse(road);
  }
  reset() {
    this.pose = undefined;
    this.lastTime = undefined;
    this.positionVelocity.set(0, 0, 0);
    this.targetVelocity.set(0, 0, 0);
  }
  update(
    distance: number,
    elapsed: number,
    mode: FollowCamera,
    snap = false,
  ): CameraPose {
    const desired = this.course.desired(distance, mode);
    const dt = this.lastTime === undefined ? 0 : elapsed - this.lastTime;
    if (!this.pose || snap || mode !== this.mode || dt < 0 || dt > 0.5) {
      this.pose = desired;
      this.positionVelocity.set(0, 0, 0);
      this.targetVelocity.set(0, 0, 0);
    } else if (dt > 0) {
      // Keep the driver attached to the car. Chase/above mounts can absorb path noise.
      if (mode === "driver") this.pose.position.copy(desired.position);
      else
        dampVector(
          this.pose.position,
          this.positionVelocity,
          desired.position,
          dt,
          0.32,
          this.previousDesired?.position,
        );
      dampVector(
        this.pose.target,
        this.targetVelocity,
        desired.target,
        dt,
        mode === "driver" ? 0.2 : 0.38,
        this.previousDesired?.target,
      );
      // Guard against a trailing view falling below the road near a steep crest.
      this.pose.position.y = Math.max(
        this.pose.position.y,
        desired.position.y - 1.5,
      );
    }
    this.previousDesired = desired;
    this.lastTime = elapsed;
    this.mode = mode;
    return {
      position: this.pose.position.clone(),
      target: this.pose.target.clone(),
    };
  }
}
