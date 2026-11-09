import { readFile, writeFile } from "node:fs/promises";
import type { Layout } from "../schemas/data";
import { R, rad, type Position } from "../src/geo";
import { continuousPlanarIdealLine } from "./ideal-continuous-planar";
import { serializeLayout } from "./layout-borders";
const [shard, count] = (process.argv[2] ?? "0/1").split("/").map(Number);
const files: { file: string; reason?: string }[] = JSON.parse(await readFile(".local/ideal-generation/final-unavailable.json", "utf8"));
const report: { file: string; status: string; reason?: string }[] = [];
const output = `.local/ideal-generation/continuous-${shard}.json`;
await writeFile(output, "[]");
for (const [i, row] of files.entries()) {
  if (i % count !== shard) continue;
  const layout = JSON.parse(await readFile(row.file, "utf8")) as Layout;
  try {
    const result = continuousPlanarIdealLine(layout);
    const coordinates = result.points.map(p => [
      Number((result.origin[0]+p.x/(R*rad*Math.cos(result.origin[1]*rad))).toFixed(10)),
      Number((result.origin[1]-p.z/(R*rad)).toFixed(10)),
    ] as Position);
    coordinates.push(coordinates[0]);
    layout.features = layout.features.filter(f => f.properties.role !== "ideal");
    layout.features.push({
      type: "Feature", id: "ideal",
      properties: { role: "ideal", sourceIds: [], estimated: true,
        method: "bounded-minimum-curvature-local-time-v1", edgeMarginM: 0.01,
        boundaryModel: "continuous-planar-v1",
        borderLicenses: [...new Set(layout.features.filter(f => f.properties.role === "inner" || f.properties.role === "outer").map(f => "license" in f.properties ? f.properties.license : ""))],
      }, geometry: { type: "LineString", coordinates },
    });
    await writeFile(row.file, serializeLayout(layout));
    report.push({ file: row.file, status: "generated" });
  } catch (e) {
    if (layout.features.some(f => f.properties.role === "ideal")) {
      layout.features=layout.features.filter(f => f.properties.role !== "ideal");
      await writeFile(row.file,serializeLayout(layout));
    }
    report.push({ file: row.file, status: "unavailable", reason: row.reason ?? String(e) });
  }
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(row.file, report.at(-1)!.status);
}
