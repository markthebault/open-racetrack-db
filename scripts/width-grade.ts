import type { Layout } from "../schemas/data";
import { geometryPaths } from "../schemas/data";
import { plane } from "../src/geo";
import { traceWidthReference } from "../src/trace-width-geometry";
import { gradeProfileHeight } from "../src/grade-separation";
/** Reindex a preserved paired-origin profile onto the unchanged source-trace origin. */
export function remapWidthGrade(layout: Layout, widthM: number) {
  const old = layout.metadata.borderInference?.gradeSeparation;
  if (!old) return;
  const trace = geometryPaths(
      layout.features.find((f) => f.properties.role === "trace")!.geometry,
    )[0],
    ref = traceWidthReference(trace, layout.metadata.closed, widthM),
    count = ref.frames.length,
    project = plane(ref.origin),
    offset = old.sourceStationOffset ?? 0;
  const edges = ["inner", "outer"].map(
    (role) =>
      geometryPaths(
        layout.features.find((f) => f.properties.role === role)!.geometry,
      )[0],
  );
  const station = (s: number) => {
    const j = Math.round(s) % old.stationCount,
      a = edges[0][j],
      b = edges[1][j],
      p = project.to([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    const expected =
        (((s + offset) % old.stationCount) / old.stationCount) * count,
      reach = Math.ceil(180 / ref.step);
    let best = { score: Infinity, i: Math.round(expected) % count };
    for (let d = -reach; d <= reach; d++) {
      const i = (Math.round(expected) + d + count) % count,
        q = ref.frames[i],
        score =
          (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (d * ref.step) ** 2 * 1e-6;
      if (score < best.score) best = { score, i };
    }
    return best.i;
  };
  const grade = structuredClone(old),
    anchors = new Map<number, number>();
  for (const [s, h] of old.elevation.anchors.slice(0, -1))
    anchors.set(station(s), h);
  const seam = gradeProfileHeight(
    old,
    (old.stationCount - offset) % old.stationCount,
  );
  anchors.set(0, seam);
  anchors.set(count, seam);
  grade.stationCount = count;
  delete grade.sourceStationOffset;
  grade.crossings = grade.crossings.map((c) => ({
    ...c,
    upper: c.upper.map(station) as [number, number],
    lower: c.lower.map(station) as [number, number],
  }));
  const inside = (s: number, r: [number, number]) =>
    r[0] < r[1] ? s > r[0] && s < r[1] : s > r[0] || s < r[1];
  for (const c of grade.crossings)
    for (const r of grade.elevation.crossingInterpolation
      ? [c.upper, c.lower]
      : [c.upper]) {
      for (const s of anchors.keys())
        if (s !== 0 && s !== count && inside(s, r)) anchors.delete(s);
      if (r[0] > r[1]) {
        const a = anchors.get(r[0])!,
          b = anchors.get(r[1])!,
          h = a + ((b - a) * (count - r[0])) / (count - r[0] + r[1]);
        anchors.set(0, h);
        anchors.set(count, h);
      }
    }
  grade.elevation.anchors = [...anchors].sort((a, b) => a[0] - b[0]);
  grade.elevation.note +=
    " Source-aligned constant-width grid; seam-spanning ranges remain cyclic.";
  return { ...grade, cyclicRanges: true as const };
}
