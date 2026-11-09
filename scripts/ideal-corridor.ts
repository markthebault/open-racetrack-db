import { boundaryNormalMidline, insideRing } from "../src/boundary-path";
import { plane, type Position } from "../src/geo";
import { borderSection, indexBorders } from "../src/border-sections";
import type { Layout } from "../schemas/data";
import { edgeChecker } from "./ideal-clearance";
import type { Station } from "./ideal-line-solver";
/** Direct source-boundary sampling avoids spline shortcuts in tight corners. */
export function idealCorridor(layout: Layout, a: Position[], b: Position[]) {
  const mid = boundaryNormalMidline(layout),
    origin = mid[0],
    project = plane(origin),
    rings = [a, b].map((r) => r.map(project.to));
  const paths = rings.map((r) => r.map(([x, y]) => [x, -y] as Position));
  const index = indexBorders(paths),
    clearance = edgeChecker(rings),
    points = mid
      .slice(0, -1)
      .map(project.to)
      .map(([x, y]) => [x, -y] as Position),
    n = points.length;
  const stations: Station[] = points.map((p, i) => {
    const u = points[(i - 2 + n) % n],
      v = points[(i + 2) % n],
      dx = v[0] - u[0],
      dz = v[1] - u[1],
      norm = Math.hypot(dx, dz),
      nx = dz / norm,
      nz = -dx / norm;
    const section = borderSection(index, p[0], p[1], nx, nz);
    let x = p[0],
      z = p[1];
    if (section) {
      x += (nx * (section[0] - section[1])) / 2;
      z += (nz * (section[0] - section[1])) / 2;
    }
    let width = clearance([x, -z]);
    for (let shift = -2; shift <= 2; shift += 0.25) {
      const cx = p[0] + nx * shift,
        cz = p[1] + nz * shift,
        c = clearance([cx, -cz]);
      if (
        c > width &&
        insideRing([cx, -cz], rings[0]) !== insideRing([cx, -cz], rings[1])
      ) {
        x = cx;
        z = cz;
        width = c;
      }
    }
    return { x, z, y: 0, nx, nz, halfWidth: width };
  });
  return { stations, origin, rings, clearance };
}
