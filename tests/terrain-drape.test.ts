import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TerrainDrape } from "../src/terrain-drape";

function surface() {
  const geometry = new THREE.PlaneGeometry(8, 8, 4, 4);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++)
    positions.setY(
      i,
      8 - 2 * Math.abs(positions.getX(i)) + positions.getZ(i) * 0.5,
    );
  return geometry;
}

test("a sparse road crossing a terrain peak stays above every rendered face, including its width", () => {
  const terrain = new TerrainDrape(surface());
  const road = new THREE.PlaneGeometry(7.5, 2, 1, 1);
  road.rotateX(-Math.PI / 2);
  const original = Array.from(road.getAttribute("position").array);
  const draped = terrain.drape(road, 0.2);
  const positions = draped.getAttribute("position");
  assert.ok(positions.count > road.getAttribute("position").count);
  // Interior samples catch a ground peak inside a road triangle, which vertex-only
  // height sampling misses. Cross-width samples also catch buried road edges.
  for (let i = 0; i < positions.count; i += 3) {
    const face = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(positions, i + j),
    );
    const samples = [
      ...face,
      face[0]
        .clone()
        .add(face[1])
        .add(face[2])
        .multiplyScalar(1 / 3),
    ];
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ])
      samples.push(face[a].clone().lerp(face[b], 0.5));
    for (const point of samples) {
      const height = terrain.heightAt(point.x, point.z);
      assert.notEqual(height, null);
      assert.ok(Math.abs(point.y - height! - 0.2) < 1e-5);
    }
  }
  assert.deepEqual(Array.from(road.getAttribute("position").array), original);
});

test("draping respects missing terrain faces instead of filling holes", () => {
  const geometry = surface();
  geometry.setIndex(Array.from(geometry.getIndex()!.array).slice(6));
  const terrain = new TerrainDrape(geometry);
  assert.equal(terrain.heightAt(-3.5, -3.5), null);
  const road = new THREE.PlaneGeometry(8, 8);
  road.rotateX(-Math.PI / 2);
  const positions = terrain.drape(road, 0.2).getAttribute("position");
  for (let i = 0; i < positions.count; i += 3) {
    const center = new THREE.Vector3();
    for (let j = 0; j < 3; j++)
      center.add(new THREE.Vector3().fromBufferAttribute(positions, i + j));
    center.multiplyScalar(1 / 3);
    assert.notEqual(terrain.heightAt(center.x, center.z), null);
  }
  assert.equal(terrain.heightAt(10, 0), null);
});
