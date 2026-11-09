import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { geometryPaths, layoutSchema } from "../schemas/data";
import { plane, equal, type Position } from "../src/geo";
import { assertSeparateSimpleRings, insideRing } from "../src/boundary-path";
import { IDEAL_CAR } from "../src/ideal-line-model";
import { edgeChecker } from "./ideal-clearance";

const output = "sources/research/ideal-line-gaps.json";
const coverage = JSON.parse(await readFile("data/ideal-lines-coverage.json", "utf8"));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const records = [];
for (const row of coverage.records.filter((r: { status: string }) => r.status === "unavailable")) {
  const layout = layoutSchema.parse(JSON.parse(await readFile(row.file, "utf8"))),
    borders = ["inner", "outer"].map(role => layout.features.find(f => f.properties.role === role)!),
    paths = borders.map(f => geometryPaths(f.geometry)),
    project = plane(layout.bbox.slice(0, 2) as Position),
    components = [];
  for (let index = 0; index < Math.min(paths[0].length, paths[1].length); index++) {
    const [a, b] = paths.map(p => p[index].map(project.to)),
      closed = [a, b].every(p => equal(p[0], p.at(-1)!));
    let topologyReason: string | undefined;
    try { assertSeparateSimpleRings([a, b], closed); }
    catch (error) { topologyReason = error instanceof Error ? error.message : String(error); }
    const nested = closed && !topologyReason && (insideRing(a[0], b) || insideRing(b[0], a));
    let minimumGapM: number | undefined,
      bottleneckVertex: { role: string; index: number } | undefined;
    // For disjoint nested polygon rings, the closest pair includes a vertex.
    // A simple loop enclosing the inner ring must traverse this separating gap.
    if (nested) {
      const checks = [edgeChecker([b]), edgeChecker([a])];
      for (const [edge, points] of [a, b].entries()) for (const [vertex, point] of points.entries()) {
        const gap = checks[edge](point);
        if (minimumGapM === undefined || gap < minimumGapM) {
          minimumGapM = gap;
          bottleneckVertex = { role: edge === 0 ? "inner" : "outer", index: vertex };
        }
      }
    }
    components.push({
      index,
      ...(layout.metadata.borderComposition?.[index]
        ? { sourceLayoutId: layout.metadata.borderComposition[index].sourceLayoutId } : {}),
      closed, nested,
      ...(topologyReason ? { topologyReason } : {}),
      ...(minimumGapM !== undefined ? {
        minimumGapM: Math.round(minimumGapM * 1000) / 1000,
        belowVehicleWidth: minimumGapM < IDEAL_CAR.widthM,
        bottleneckVertex,
      } : {}),
    });
  }
  const classification = paths[0].length !== paths[1].length || !components.every(c => c.nested)
    ? "topology-or-order-review"
    : components.some(c => c.belowVehicleWidth) ? "insufficient-width" : "solver-candidate";
  records.push({
    file: row.file, classification,
    borderFeaturesSha256: hash(borders),
    traceGeometrySha256: hash(layout.features.find(f => f.properties.role === "trace")!.geometry),
    borderPathCounts: paths.map(p => p.length), components,
  });
}
const report = {
  schemaVersion: 1,
  vehicleWidthM: IDEAL_CAR.widthM,
  note: "Diagnostics of saved geometry, not measured physical track widths or barriers. Insufficient-width cases have a closed nested polygon corridor with an opposing-edge gap below the vehicle width, before adding clearance margins. Projected crossings may be grade separated and require route/layer interpretation. Topology cases are not a proof that no alternative solver can recover them. No geometry is changed. Vertex indices refer to the hashed source border features.",
  summary: {
    unavailableLayouts: records.length,
    insufficientWidth: records.filter(r => r.classification === "insufficient-width").length,
    topologyOrOrderReview: records.filter(r => r.classification === "topology-or-order-review").length,
    solverCandidates: records.filter(r => r.classification === "solver-candidate").length,
  },
  records,
};
const serialized = JSON.stringify(report, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (await readFile(output, "utf8") !== serialized) throw new Error("Ideal-line gap audit is stale; regenerate it");
} else await writeFile(output, serialized);
console.log(JSON.stringify(report.summary));
