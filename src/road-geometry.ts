import * as THREE from "three";
import type { Road, RoadPoint } from "./lap-simulation";

export function roadStrip(
  road: Road,
  offsets: (p: RoadPoint) => [number, number],
  lift: number,
  range?: [number, number],
  colored = false,
) {
  const vertices: number[] = [],
    uv: number[] = [],
    colors: number[] = [];
  const n = road.points.length;
  for (let i = 0; i < n; i++) {
    const a = road.points[i],
      b = road.points[(i + 1) % n];
    const station = (a.s / road.length) * road.recipe.referenceLengthM;
    if (range && (station < range[0] || station > range[1])) continue;
    const corners = [
      ...offsets(a).map((d) => [a.x + a.nx * d, a.y + lift, a.z + a.nz * d]),
      ...offsets(b).map((d) => [b.x + b.nx * d, b.y + lift, b.z + b.nz * d]),
    ];
    const color = new THREE.Color(
      road.recipe.curbStyle.colors[
        Math.floor(a.s / road.recipe.curbStyle.stripeLengthM) % 2
      ],
    );
    for (const j of [0, 2, 1, 1, 2, 3]) {
      vertices.push(...corners[j]);
      uv.push(j % 2, ((i + (j >= 2 ? 1 : 0)) * road.step) / 4);
      if (colored) colors.push(color.r, color.g, color.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (colored)
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
