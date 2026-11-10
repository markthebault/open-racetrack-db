import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { traceWidthReference, widthEdges } from "../src/trace-width-geometry";
import { calculateTraceWidth } from "../src/trace-width-calculation";
import { plane } from "../src/geo";
import { validateLayout, trackSchema, geometryPaths } from "../schemas/data";
import { buildPlaybackRoad } from "../src/ideal-playback";
import { simulateLap } from "../src/lap-simulation";
import { gradeForLayout, gradeProfileHeight } from "../src/grade-separation";
const local = plane([7, 50]),
  geo = (x: number, y: number) => local.from([x, y]);
test("normal offsets keep the full stored width and never edit the original trace", () => {
  const trace = Array.from({ length: 25 }, (_, i) =>
    geo(
      60 * Math.cos((i / 24) * 2 * Math.PI),
      60 * Math.sin((i / 24) * 2 * Math.PI),
    ),
  );
  trace[trace.length - 1] = trace[0];
  const before = structuredClone(trace),
    r = traceWidthReference(trace, true, 10),
    edges = widthEdges(r, 10, true);
  assert.deepEqual(trace, before);
  const project = plane(r.origin);
  for (let i = 0; i < r.frames.length; i++) {
    const a = project.to(edges.left[i]),
      b = project.to(edges.right[i]);
    assert.ok(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - 10) < 0.0001);
  }
  assert.deepEqual(edges.left[0], edges.left.at(-1));
});
test("open width corridors preserve ends and compute an open ideal path", () => {
  const trace = [geo(0, 0), geo(40, 0), geo(80, 15), geo(120, 15)],
    copy = structuredClone(trace),
    out = calculateTraceWidth({
      trace,
      closed: false,
      widthM: 10,
      leftRight: true,
      sourceLicenses: ["ODbL-1.0"],
    }),
    ideal = out.features.find((f) => f.properties.role === "ideal")!;
  assert.deepEqual(trace, copy);
  assert.notDeepEqual(
    ideal.geometry.coordinates[0],
    ideal.geometry.coordinates.at(-1),
  );
  assert.deepEqual(ideal.geometry.coordinates[0], trace[0]);
  assert.deepEqual(ideal.geometry.coordinates.at(-1), trace.at(-1));
});
test("compact prototype data stores width in track metadata, without persisted border or ideal coordinates", () => {
  for (const root of [
    "data/belgium/spa-francorchamps",
    "data/japan/suzuka-circuit-175231434",
    "data/germany/nurburgring",
  ]) {
    const track = trackSchema.parse(
      JSON.parse(readFileSync(root + "/track.json", "utf8")),
    );
    for (const e of track.layouts) {
      if (!e.file) continue;
      assert.ok(e.roadWidthM);
      assert.equal(
        e.roadWidthM,
        Math.round(e.roadWidthSource!.meanWidthM * 2) / 2,
      );
      const d = validateLayout(
        JSON.parse(readFileSync(root + "/" + e.file, "utf8")),
        track,
        e.id,
      );
      assert.ok(
        d.features.every(
          (f) => !["inner", "outer", "ideal"].includes(f.properties.role),
        ),
      );
      assert.equal(d.metadata.borderInference, undefined);
      assert.equal(
        d.metadata.model3d?.kind !== "surface" &&
          d.metadata.model3d?.pathMethod,
        "constant-width-trace-v1",
      );
    }
  }
});
for (const [root, id] of [
  ["data/belgium/spa-francorchamps", "grand-prix"],
  ["data/japan/suzuka-circuit-175231434", "suzuka"],
  ["data/germany/nurburgring", "nordschleife-btg"],
])
  test("runtime reconstruction and playback: " + id, () => {
    const track = trackSchema.parse(
        JSON.parse(readFileSync(root + "/track.json", "utf8")),
      ),
      e = track.layouts.find((l) => l.id === id)!,
      raw = validateLayout(
        JSON.parse(readFileSync(root + "/" + e.file, "utf8")),
        track,
        id,
      ),
      original = structuredClone(raw),
      source = raw.features.find((f) => f.properties.role === "trace")!;
    const out = calculateTraceWidth({
        trace: geometryPaths(source.geometry)[0],
        closed: raw.metadata.closed,
        widthM: e.roadWidthM!,
        leftRight: !!gradeForLayout(raw),
        sourceLicenses: e.roadWidthSource!.licenses,
        ...(raw.metadata.model3d && raw.metadata.model3d.kind !== "surface"
          ? {
              elevation: {
                anchors: raw.metadata.model3d.elevation,
                referenceLengthM: raw.metadata.model3d.referenceLengthM,
                start: raw.metadata.timing?.start,
                startOffsetM: raw.metadata.model3d.startOffsetM,
                gradeSeparation: raw.metadata.model3d.gradeSeparation,
              },
            }
          : {}),
      }),
      d = structuredClone(raw);
    d.features.push(...out.features);
    assert.deepEqual(raw, original);
    assert.ok(
      out.optimization.qpConverged,
      "Final QP primal and dual residuals must converge",
    );
    assert.ok(out.optimization.converged, "Curvature objective must converge");
    assert.ok(
      out.optimization.minimumCurvatureCost <
        0.85 * out.optimization.centerCost,
    );
    assert.ok(out.optimization.durationS < out.optimization.centerDurationS);
    assert.ok(
      out.optimization.durationS <= out.optimization.minimumCurvatureDurationS,
    );
    assert.ok(out.optimization.maximumOffsetM > 1);
    assert.ok(out.optimization.timeCandidates > 0);
    const road = buildPlaybackRoad(d),
      lap = simulateLap(road);
    assert.equal(road.pathSource, "ideal");
    assert.ok(Number.isFinite(lap.duration) && lap.duration > 0);
    assert.ok(
      road.surfaceRoad!.points.every(
        (p) => Math.abs(p.left + p.right - e.roadWidthM!) < 1e-10,
      ),
    );
    if (id === "suzuka") {
      const grade = gradeForLayout(d)!;
      assert.ok(road.points.some((p) => p.elevated));
      for (const c of grade.crossings) {
        const upper = (c.upper[0] + c.upper[1]) / 2,
          lower = (c.lower[0] + c.lower[1]) / 2;
        assert.ok(
          gradeProfileHeight(grade, upper) - gradeProfileHeight(grade, lower) >
            3,
          "Bridge levels must remain separated",
        );
      }
    }
  });
