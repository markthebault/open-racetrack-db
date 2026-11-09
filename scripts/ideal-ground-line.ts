import type { Road } from "../src/lap-simulation";
import { groundSegmentClearanceM } from "../src/ribbon-surface";
import { IDEAL_CAR, type CarProfile } from "../src/ideal-line-model";
import { optimizeLine } from "./ideal-line-solver";

/** Optimize in source order inside the already saved shared-ground reconstruction. */
export function groundIdealLine(road: Road, edgeMarginM: number, car: CarProfile = IDEAL_CAR) {
  if (!road.ground) throw new Error("Ideal ground line requires a saved ground footprint");
  const { footprint } = road.ground, n = road.points.length;
  const clearances = road.points.map((p, i) => {
    const q = road.points[(i + 1) % n];
    return groundSegmentClearanceM(footprint, [p.x, p.z], [q.x, q.z]);
  });
  // Bounds at both ends use the complete original segment's clearance. Every
  // intermediate offset then stays inside that source segment's free tube.
  const stations = road.points.map((p, i) => ({
    x: p.x, y: p.y, z: p.z, nx: p.nx, nz: p.nz,
    halfWidth: Math.min(p.left, p.right, clearances[i], clearances[(i + n - 1) % n]),
  }));
  const result = optimizeLine(stations, true, car, 100);
  for (const [i, p] of result.points.entries()) {
    const q = result.points[(i + 1) % n];
    if (groundSegmentClearanceM(footprint, [p.x, p.z], [q.x, q.z]) < car.widthM / 2 + edgeMarginM + 0.02)
      throw new Error("Ideal ground segment has insufficient car-width clearance");
  }
  return result;
}
