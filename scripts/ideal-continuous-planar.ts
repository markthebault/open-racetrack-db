import type { Layout } from "../schemas/data";
import { roadRings } from "../src/boundary-path";
import type { Position } from "../src/geo";
import { groundFootprintFromRings, groundSegmentClearanceM } from "../src/ribbon-surface";
import { IDEAL_CAR } from "../src/ideal-line-model";
import { alignClosedBorders } from "./ideal-ordered-corridor";
import { edgeChecker } from "./ideal-clearance";
import { assertIdealSeparation } from "./ideal-separation";
import { optimizeLine } from "./ideal-line-solver";

/** A smaller recorded edge margin never reduces the fixed vehicle width. */
export function continuousPlanarIdealLine(layout: Layout, edgeMarginM = 0.01) {
  const { inner, outer } = roadRings(layout);
  const allowance = edgeMarginM + 0.005;
  const required = IDEAL_CAR.widthM / 2 + allowance;
  const toInner = edgeChecker([inner]), toOuter = edgeChecker([outer]);
  let borderGap = Infinity;
  for (const p of inner) borderGap = Math.min(borderGap, toOuter(p));
  for (const p of outer) borderGap = Math.min(borderGap, toInner(p));
  if (borderGap < 2 * required)
    throw new Error("Saved annulus is too narrow for the vehicle and recorded margin");
  const corridor = alignClosedBorders(layout, 2 * required, 64000000);
  const footprint = groundFootprintFromRings([outer], [inner]);
  const points = corridor.pairs.map(p => [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2] as Position);
  const originals = points.map(p => [...p] as Position), n = points.length;
  const segment = (i: number) => groundSegmentClearanceM(footprint, points[(i+n)%n], points[(i+1+n)%n]);
  const clearances = points.map((_, i) => segment(i));
  const score = (i: number, p: Position) => {
    const a = groundSegmentClearanceM(footprint, points[(i+n-1)%n], p);
    const b = groundSegmentClearanceM(footprint, p, points[(i+1)%n]);
    return Math.max(0, required-a)**2 + Math.max(0, required-b)**2;
  };
  // Move only reference points adjacent to failing complete segments. Every
  // candidate is tested against the unchanged full annulus, including all edges.
  refine: for (const step of [0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001]) {
    for (let pass = 0; pass < 6; pass++) {
      const bad = new Set<number>();
      clearances.forEach((c,i) => { if (c < required) { bad.add(i); bad.add((i+1)%n); } });
      if (!bad.size) break refine;
      if (bad.size > 64) throw new Error("Too many invalid reference segments for local refinement");
      let changes = 0;
      for (const i of bad) {
        const original = points[i]; let best = original, cost = score(i, original);
        for (let k = 0; k < 16; k++) {
          const angle = 2*Math.PI*k/16;
          const p: Position = [original[0]+step*Math.cos(angle), original[1]+step*Math.sin(angle)];
          if (Math.hypot(p[0]-originals[i][0],p[1]-originals[i][1]) > 2) continue;
          const next = score(i,p);
          if (next < cost-1e-14) { best=p; cost=next; }
        }
        if (best !== original) {
          points[i]=best; changes++;
          clearances[(i+n-1)%n]=segment(i-1); clearances[i]=segment(i);
        }
      }
      if (!changes) break;
    }
  }
  if (clearances.some(c => c < required))
    throw new Error("Reference route cannot fit the complete vehicle envelope");
  // Adjacent whole-segment clearances bound the complete interpolation tube,
  // rather than merely checking the distance at each sampled station.
  const stations = points.map((p,i) => {
    const { a,b }=corridor.pairs[i], width=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return { x:p[0],z:-p[1],y:0,nx:(b[0]-a[0])/width,nz:-(b[1]-a[1])/width,
      halfWidth:Math.min(clearances[i],clearances[(i+n-1)%n]) };
  });
  const result = optimizeLine(stations, true, IDEAL_CAR, 100, allowance);
  let minimumClearanceM = Infinity;
  for (const [i,p] of result.points.entries()) {
    const q=result.points[(i+1)%n];
    minimumClearanceM=Math.min(minimumClearanceM,groundSegmentClearanceM(footprint,[p.x,-p.z],[q.x,-q.z]));
  }
  if (minimumClearanceM < IDEAL_CAR.widthM/2 + edgeMarginM + 0.002)
    throw new Error("Ideal route fails continuous vehicle-width clearance");
  assertIdealSeparation(result.points,[inner,outer]);
  return { ...result, ...corridor, footprint, minimumClearanceM };
}
