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
  const edgePoint = (p: RoadPoint, d: number) => {
    const edge = d >= 0 ? p.leftEdge : p.rightEdge;
    if (!edge) return [p.x + p.nx * d, p.y + lift, p.z + p.nz * d];
    const fraction = Math.abs(d) / (d >= 0 ? p.left : p.right);
    return [
      p.x + (edge[0] - p.x) * fraction,
      p.y + lift,
      p.z + (edge[1] - p.z) * fraction,
    ];
  };
  for (let i = 0; i < (road.renderSegmentCount ?? (road.recipe.kind === "run" ? n - 1 : n)); i++) {
    const a = road.points[i],
      b = road.points[(i + 1) % n];
    const station = (a.s / road.length) * road.recipe.referenceLengthM;
    if (range && (station < range[0] || station > range[1])) continue;
    const corners = [
      ...offsets(a).map((d) => edgePoint(a, d)),
      ...offsets(b).map((d) => edgePoint(b, d)),
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
