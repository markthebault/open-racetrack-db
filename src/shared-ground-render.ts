import { BufferGeometry, Color, Float32BufferAttribute } from "three";
import type { Road } from "./lap-simulation";
import { plane, type Position } from "./geo";
import { sampleElevation } from "./elevation";
import { triangulateGroundFootprint } from "./ribbon-surface";

/** Only physical exterior/hole boundaries get paint and illustrative curbs, never internal overlaps. */
export function sharedGroundMeshes(road: Road) {
  if (!road.ground) throw new Error("Shared-ground rendering needs its derived physical footprint");
  const projection = plane(road.origin), height = ([x, z]: Position) => {
    const value = sampleElevation(road.recipe.terrain, projection.from([x, -z]));
    if (value === null) throw new Error("Terrain does not cover a shared-ground boundary");
    return value;
  }, asphalt = triangulateGroundFootprint(road.ground.footprint, height, 0.08),
    lines: number[] = [], curbs: number[] = [], colors: number[] = [];
  let curbSections = 0;
  for (const polygon of road.ground.footprint) for (const ring of polygon) {
    const lengths = [0];
    for (let i = 1; i < ring.length; i++)
      lengths.push(lengths[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
    const total = lengths.at(-1)!, n = Math.max(3, Math.ceil(total / 3)), points: Position[] = [];
    let edge = 0;
    for (let i = 0; i < n; i++) {
      const s = total * i / n;
      while (edge < ring.length - 2 && lengths[edge + 1] < s) edge++;
      const t = (s - lengths[edge]) / (lengths[edge + 1] - lengths[edge]);
      points.push([ring[edge][0] + (ring[edge + 1][0] - ring[edge][0]) * t,
        ring[edge][1] + (ring[edge + 1][1] - ring[edge][1]) * t]);
    }
    const at = (i: number) => points[(i + n) % n], normals = points.map((_, i): Position => {
      const a = at(i - 1), b = at(i + 1), dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      return [-dz / length, dx / length];
    });
    const curved = points.map((b, i) => {
      const a = at(i - 2), c = at(i + 2),
        denominator = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]) * Math.hypot(c[0] - a[0], c[1] - a[1]);
      return Math.abs(2 * ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))) / Math.max(1e-6, denominator) > 1 / 250;
    });
    const curb = new Set<number>();
    for (let i = 0; i < n; i++) if (curved[i]) {
      const first = i; while (i < n && curved[i]) i++;
      if ((i - first) * total / n >= 12) { curbSections++; for (let j = first; j < i; j++) curb.add(j); }
    }
    const append = (vertices: number[], i: number, lo: number, hi: number, lift: number, color?: Color) => {
      const corners = [i, (i + 1) % n].flatMap((j) => [lo, hi].map((offset) => {
        const p: Position = [points[j][0] + normals[j][0] * offset, points[j][1] + normals[j][1] * offset];
        return [p[0], height(p) + lift, p[1]];
      }));
      for (const j of [0, 2, 1, 1, 2, 3]) {
        vertices.push(...corners[j]);
        if (color) colors.push(color.r, color.g, color.b);
      }
    };
    for (let i = 0; i < n; i++) {
      append(lines, i, 0.1, 0.25, 0.1);
      if (curb.has(i)) append(curbs, i, -1, 0, 0.16,
        new Color(road.recipe.curbStyle.colors[Math.floor(i * total / n / road.recipe.curbStyle.stripeLengthM) % 2]));
    }
  }
  const geometry = (vertices: number[]) => {
    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    result.computeVertexNormals(); return result;
  };
  const outlines = geometry(lines), curbGeometry = geometry(curbs);
  curbGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return { asphalt: asphalt.geometry, triangles: asphalt.triangles, outlines, curbs: curbGeometry, curbSections };
}
