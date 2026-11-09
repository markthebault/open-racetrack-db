import { test } from "node:test";
import assert from "node:assert/strict";
import { type Position } from "../src/geo";
import { assertSeparateSimpleRings } from "../src/boundary-path";
import { assertIdealSeparation } from "../scripts/ideal-separation";
const square = (r: number): Position[] => [[-r,-r],[r,-r],[r,r],[-r,r],[-r,-r]];
const path = (ring: Position[]) => ring.slice(0,-1).map(([x,y])=>({x,z:-y,y:0}));
test("a simple ideal cycle can enclose a raw boundary with a local self-touch while preserving every source edge", () => {
  const inner: Position[] = [[-50,-50],[50,-50],[50,50],[0,50],[3,53],[-3,53],[0,50],[-50,50],[-50,-50]];
  const rings = [inner, square(60)], original = structuredClone(rings);
  assert.throws(()=>assertSeparateSimpleRings(rings));
  assert.doesNotThrow(()=>assertIdealSeparation(path(square(56)),rings));
  assert.deepEqual(rings,original);
});
test("the source anchor alone cannot validate a shortcut or an outer-boundary excursion", () => {
  const rings = [square(50),square(60)];
  assert.throws(()=>assertIdealSeparation(path([[-56,-56],[0,-56],[0,0],[-56,0],[-56,-56]]),rings));
  assert.throws(()=>assertIdealSeparation(path(square(65)),rings));
  assert.throws(()=>assertIdealSeparation(path([[-56,-56],[56,56],[-56,56],[56,-56],[-56,-56]]),rings));
});
