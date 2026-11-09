import { assertSeparateSimpleRings, insideRing } from "../src/boundary-path";
import type { Position } from "../src/geo";
import type { PathPoint } from "./ideal-line-solver";

/** A planar circuit must enclose the entire inner edge and none of the outer edge. */
export function assertIdealSeparation(points: PathPoint[], rings: Position[][]) {
  const path: Position[] = points.map((p) => [p.x, -p.z]);
  path.push(path[0]);
  assertSeparateSimpleRings([path]);
  const [inner, outer] = rings;
  if (inner.some((p) => !insideRing(p, path)) ||
    outer.some((p) => insideRing(p, path)))
    throw new Error("Ideal cycle does not separate the complete source boundaries");
}
