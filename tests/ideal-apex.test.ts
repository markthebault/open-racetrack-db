import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateTraceWidth } from "../src/trace-width-calculation";
import { widthCalculationInputs } from "../src/trace-width-runtime";
import { traceWidthReference } from "../src/trace-width-geometry";
import { widthCorridor } from "../src/width-corridor";
import { plane, type Position } from "../src/geo";
import { pathCurvatures } from "../src/path-curvature";
for(const {root,id} of [
 {root:"data/russia/smolensk-ring-136054940",id:"main"},
 {root:"data/russia/smolensk-ring-136054940",id:"smolensk"},
 {root:"data/finland/ahveniston-moottorirata-20303307",id:"main"},
])
  test(
    "reported west-side apex uses the inside and respects paired edges: " +
      root+"/"+id,
    () => {
      const track = JSON.parse(readFileSync(root + "/track.json", "utf8")),
        raw = JSON.parse(readFileSync(root + "/layouts/"+id+".geojson", "utf8"));
      const input = widthCalculationInputs(raw, track)[0],
        ref = traceWidthReference(input.trace, input.closed, input.widthM),
        n = ref.frames.length,
        project = plane(ref.origin),
        result = calculateTraceWidth(input);
      const planar = (p: Position): Position => {
        const q = project.to(p);
        return [q[0], -q[1]];
      };
      const points = result.features
        .find((f) => f.properties.role === "ideal")!
        .geometry.coordinates.slice(0, n)
        .map((p) => {
          const q = planar(p);
          return { x: q[0], z: q[1], y: 0 };
        });
      const edges = ["inner", "outer"].map((role) =>
        result.features
          .find((f) => f.properties.role === role)!
          .geometry.coordinates.slice(0, n)
          .map(planar),
      );
      const centres = ref.frames.map((p) => ({ x: p.x, z: -p.y })),
        corridor = widthCorridor(
          edges[0],
          edges[1],
          centres,
          input.closed,
          ref.step,
          input.widthM,
        );
      const focus = ref.frames.reduce(
          (best, p, i) => (p.x < ref.frames[best].x ? i : best),
          0,
        ),
        k = pathCurvatures(centres, input.closed, 20);
      const inside =
        -Math.sign(k[focus]) *
        ((points[focus].x - centres[focus].x) * ref.frames[focus].nx -
          (points[focus].z - centres[focus].z) * ref.frames[focus].ny);
      assert.ok(
        inside > 2,
        `The reported apex must move inward; got ${inside} m`,
      );
      assert.ok(
        result.optimization.durationS <
          result.optimization.minimumCurvatureDurationS - 0.5,
      );
      const ix = (i: number) => (i + n) % n;
      for (let i = 0; i < n; i++) {
        assert.ok(
          corridor.feasible(i, points[i], points[ix(i - 1)], points[ix(i + 1)]),
          "body envelope at " + i,
        );
        const a = points[i],
          b = points[ix(i + 1)];
        for (const t of [0.25, 0.5, 0.75])
          assert.ok(
            corridor.feasible(
              i,
              { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z), y: 0 },
              a,
              b,
            ),
            "intermediate body envelope at " + i,
          );
      }
      assert.deepEqual(
        raw.features.filter((f: any) =>
          ["inner", "outer", "ideal"].includes(f.properties.role),
        ),
        [],
      );
    },
  );
