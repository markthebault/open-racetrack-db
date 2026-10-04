import * as THREE from "three";

type Point = { x: number; z: number };
const cross = (a: Point, b: Point, p: Point) =>
  (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);

function clip(polygon: Point[], triangle: Point[]) {
  const orientation = Math.sign(cross(triangle[0], triangle[1], triangle[2]));
  for (let edge = 0; edge < 3 && polygon.length; edge++) {
    const a = triangle[edge],
      b = triangle[(edge + 1) % 3];
    const result: Point[] = [];
    let previous = polygon.at(-1)!;
    let previousDistance = orientation * cross(a, b, previous);
    for (const current of polygon) {
      const currentDistance = orientation * cross(a, b, current);
      if (currentDistance >= 0 !== previousDistance >= 0) {
        const t = previousDistance / (previousDistance - currentDistance);
        result.push({
          x: previous.x + (current.x - previous.x) * t,
          z: previous.z + (current.z - previous.z) * t,
        });
      }
      if (currentDistance >= 0) result.push(current);
      previous = current;
      previousDistance = currentDistance;
    }
    polygon = result;
  }
  return polygon;
}

// Split the road footprint at terrain triangle boundaries. Each resulting face
// is parallel to the rendered ground, rather than bridging over raster peaks.
export class TerrainDrape {
  private positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  private faces: Set<string>;
  private width: number;
  private height: number;
  private columns: number;
  private rows: number;

  constructor(surface: THREE.PlaneGeometry) {
    this.positions = surface.getAttribute("position");
    this.faces = new Set<string>();
    const indices = surface.getIndex()!.array;
    for (let i = 0; i < indices.length; i += 3)
      this.faces.add(`${indices[i]},${indices[i + 1]},${indices[i + 2]}`);
    const { width, height, widthSegments, heightSegments } = surface.parameters;
    this.width = width;
    this.height = height;
    this.columns = widthSegments;
    this.rows = heightSegments;
  }

  private cell(x: number, z: number) {
    return [
      Math.min(
        this.columns - 1,
        Math.max(0, Math.floor((x / this.width + 0.5) * this.columns)),
      ),
      Math.min(
        this.rows - 1,
        Math.max(0, Math.floor((z / this.height + 0.5) * this.rows)),
      ),
    ];
  }

  private triangles(x: number, z: number) {
    const a = z * (this.columns + 1) + x,
      b = a + this.columns + 1;
    return [
      [a, b, a + 1],
      [b, b + 1, a + 1],
    ]
      .filter((indices) => this.faces.has(indices.join(",")))
      .map((indices) =>
        indices.map((i) => ({
          x: this.positions.getX(i),
          y: this.positions.getY(i),
          z: this.positions.getZ(i),
        })),
      );
  }

  private heightOn(
    point: Point,
    triangle: { x: number; y: number; z: number }[],
  ) {
    const [a, b, c] = triangle;
    const area = cross(a, b, c);
    const wa = cross(b, c, point) / area,
      wb = cross(c, a, point) / area;
    return a.y * wa + b.y * wb + c.y * (1 - wa - wb);
  }

  heightAt(x: number, z: number): number | null {
    if (Math.abs(x) > this.width / 2 || Math.abs(z) > this.height / 2)
      return null;
    const [column, row] = this.cell(x, z),
      point = { x, z };
    for (const triangle of this.triangles(column, row)) {
      const area = cross(triangle[0], triangle[1], triangle[2]);
      const wa = cross(triangle[1], triangle[2], point) / area;
      const wb = cross(triangle[2], triangle[0], point) / area;
      if (wa >= -1e-6 && wb >= -1e-6 && wa + wb <= 1 + 1e-6)
        return this.heightOn(point, triangle);
    }
    return null;
  }

  drape(road: THREE.BufferGeometry, clearance: number) {
    const points = road.getAttribute("position"),
      indices = road.getIndex()!.array;
    const vertices: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const footprint = Array.from({ length: 3 }, (_, j) => ({
        x: points.getX(indices[i + j]),
        z: points.getZ(indices[i + j]),
      }));
      const [left, top] = this.cell(
        Math.min(...footprint.map((p) => p.x)),
        Math.min(...footprint.map((p) => p.z)),
      );
      const [right, bottom] = this.cell(
        Math.max(...footprint.map((p) => p.x)),
        Math.max(...footprint.map((p) => p.z)),
      );
      for (let row = top; row <= bottom; row++)
        for (let column = left; column <= right; column++)
          for (const terrain of this.triangles(column, row)) {
            const polygon = clip(footprint, terrain);
            for (let j = 1; j < polygon.length - 1; j++) {
              const face = [polygon[0], polygon[j], polygon[j + 1]];
              if (Math.abs(cross(face[0], face[1], face[2])) < 1e-10)
                continue;
              for (const point of face)
                vertices.push(
                  point.x,
                  this.heightOn(point, terrain) + clearance,
                  point.z,
                );
            }
          }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    result.computeVertexNormals();
    return result;
  }
}
