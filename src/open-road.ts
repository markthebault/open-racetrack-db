import { geometryPaths, type Layout } from "../schemas/data";
import type { LapModel3D } from "../schemas/track-model";
import { pairedBorderMidline } from "./border-midline";
import { plane } from "./geo";
import { roadHeight, type Road, type RoadPoint } from "./lap-simulation";

/** Point-to-point path from matching saved edge stations. No artificial return segment. */
export function buildOpenRoad(layout: Layout, recipe: LapModel3D): Road {
  const trace = pairedBorderMidline(layout),
    origin = trace[0],
    projection = plane(origin);
  const edges = ["inner", "outer"].map((role) =>
    geometryPaths(
      layout.features.find((f) => f.properties.role === role)!.geometry,
    )[0].map((p) => {
      const [x, y] = projection.to(p);
      return { x, z: -y };
    }),
  );
  const mid = trace.map((p) => {
      const [x, y] = projection.to(p);
      return { x, z: -y };
    }),
    stations = [0];
  for (let i = 1; i < mid.length; i++)
    stations.push(
      stations[i - 1] +
        Math.hypot(mid[i].x - mid[i - 1].x, mid[i].z - mid[i - 1].z),
    );
  const planarLength = stations.at(-1)!;
  if (planarLength <= 0) throw new Error("Open road has no length");
  const count = Math.max(2, Math.ceil(planarLength / 3)),
    points: RoadPoint[] = [];
  let segment = 0;
  for (let i = 0; i <= count; i++) {
    const s = (planarLength * i) / count;
    while (segment < mid.length - 2 && stations[segment + 1] < s) segment++;
    const t =
      (s - stations[segment]) /
      Math.max(1e-9, stations[segment + 1] - stations[segment]);
    const lerp = (a: number, b: number) => a + (b - a) * t;
    points.push({
      x: lerp(mid[segment].x, mid[segment + 1].x),
      z: lerp(mid[segment].z, mid[segment + 1].z),
      y: roadHeight(
        recipe.elevation,
        (i / count) * recipe.referenceLengthM,
        false,
      ),
      s,
      ds: 0,
      left: 0,
      right: 0,
      nx: 0,
      nz: 0,
      curvature: 0,
      grade: 0,
    });
    // Saved corresponding edge points remain the width authority.
    for (const [j, key] of ["left", "right"].entries()) {
      const e = edges[j],
        x = lerp(e[segment].x, e[segment + 1].x),
        z = lerp(e[segment].z, e[segment + 1].z);
      points[i][key as "left" | "right"] = Math.hypot(
        x - points[i].x,
        z - points[i].z,
      );
      points[i][j === 0 ? "leftEdge" : "rightEdge"] = [x, z];
    }
  }
  const at = (i: number) => points[Math.max(0, Math.min(count, i))];
  let length = 0;
  for (let i = 0; i <= count; i++) {
    const p = points[i],
      a = at(i - 2),
      b = at(i + 2),
      d = Math.hypot(b.x - a.x, b.z - a.z);
    p.nx = (b.z - a.z) / Math.max(d, 1e-9);
    p.nz = -(b.x - a.x) / Math.max(d, 1e-9);
    p.s = length;
    if (i < count) {
      const q = points[i + 1];
      p.ds = Math.hypot(q.x - p.x, q.z - p.z, q.y - p.y);
      length += p.ds;
    }
    const u = at(i - 4),
      v = at(i + 4),
      ab = Math.hypot(p.x - u.x, p.z - u.z),
      bc = Math.hypot(v.x - p.x, v.z - p.z),
      ac = Math.hypot(v.x - u.x, v.z - u.z);
    p.curvature =
      (2 * ((p.x - u.x) * (v.z - u.z) - (p.z - u.z) * (v.x - u.x))) /
      Math.max(1e-6, ab * bc * ac);
    if (p.left + p.right < 3)
      throw new Error("Open-road edge interval is too narrow");
  }
  for (let i = 0; i <= count; i++) {
    const a = at(i - 1),
      b = at(i + 1);
    points[i].grade = (b.y - a.y) / Math.max(1e-9, b.s - a.s);
  }
  return {
    points,
    length,
    step: length / count,
    origin,
    recipe,
    interpolatedSections: 0,
  };
}
