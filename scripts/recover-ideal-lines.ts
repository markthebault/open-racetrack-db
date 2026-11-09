import { removeIdealLoops } from "./ideal-path-topology";
import { groundIdealLine } from "./ideal-ground-line";
import { readFile, writeFile } from "node:fs/promises";
import { geometryPaths, type Layout } from "../schemas/data";
import { buildRoad } from "../src/lap-simulation";
import { plane, R, rad, type Position } from "../src/geo";
import { insideRing } from "../src/boundary-path";
import { IDEAL_CAR } from "../src/ideal-line-model";
import { optimizeLine } from "./ideal-line-solver";
import { edgeChecker } from "./ideal-clearance";
import { serializeLayout } from "./layout-borders";
const narrow = process.argv.includes("--narrow");
const [shard, count] = (process.argv[2] ?? "0/1").split("/").map(Number),
  files = JSON.parse(
    await readFile(".local/ideal-generation/final-unavailable.json", "utf8"),
  );
const report = [];
await writeFile(
  `.local/ideal-generation/${narrow ? "narrow" : "recovery"}-${shard}.json`,
  "[]",
);
for (const [i, item] of files.entries()) {
  if (i % count !== shard) continue;
  const file = item.file,
    layout = JSON.parse(await readFile(file, "utf8")) as Layout;
  try {
    const road = buildRoad(layout),
      project = plane(road.origin),
      closed = layout.metadata.model3d?.kind !== "run";
    const borders = layout.features.filter(
      (f) => f.properties.role === "inner" || f.properties.role === "outer",
    );
    const paths = borders.flatMap((f) => geometryPaths(f.geometry)),
      rings = paths.map((p) => p.map(project.to));
    if (rings.length !== 2)
      throw new Error("Unordered multi-surface boundaries");

    if (!narrow && road.interpolatedSections)
      throw new Error("Source corridor has missing measured cross-sections");
    const layered = !!layout.metadata.borderInference?.gradeSeparation;
    const clearance = edgeChecker(rings);
    const stations = road.points.map((p) => {
      const x = p.x + (p.nx * (p.left - p.right)) / 2,
        z = p.z + (p.nz * (p.left - p.right)) / 2;
      return {
        x,
        z,
        y: p.y,
        nx: p.nx,
        nz: p.nz,
        halfWidth: layered
          ? (p.left + p.right) / 2
          : Math.min((p.left + p.right) / 2, clearance([x, -z])),
      };
    });
    let { points } = road.ground ? groundIdealLine(road, narrow ? 0.1 : 0.5) : optimizeLine(
      stations,
      closed,
      IDEAL_CAR,
      100,
      narrow ? 0.35 : 1.15,
    );
    if (closed && !layered && !road.ground) {
      const inner = insideRing(rings[0][0], rings[1]) ? rings[0] : rings[1];
      points = removeIdealLoops(points, [inner[0][0], -inner[0][1]]);
    }
    for (let j = 0; j < (closed ? points.length : points.length - 1); j++) {
      const u = points[j],
        v = points[(j + 1) % points.length],
        steps = Math.ceil(Math.hypot(u.x - v.x, u.z - v.z));
      for (let t = 0; t <= steps; t++) {
        const f = t / steps,
          p: Position = [u.x * (1 - f) + v.x * f, -u.z * (1 - f) - v.z * f];
        if (!layered && !road.ground) {
          if (clearance(p) < IDEAL_CAR.widthM / 2 + (narrow ? 0.12 : 0.52))
            throw new Error("Insufficient car-width clearance");
          if (closed && insideRing(p, rings[0]) === insideRing(p, rings[1]))
            throw new Error("Line leaves saved road surface");
        }
      }
    }
    const coordinates = points.map(
      (p) =>
        [
          Number(
            (
              road.origin[0] +
              p.x / (R * rad * Math.cos(road.origin[1] * rad))
            ).toFixed(10),
          ),
          Number((road.origin[1] - p.z / (R * rad)).toFixed(10)),
        ] as Position,
    );
    if (closed) coordinates.push(coordinates[0]);
    layout.features = layout.features.filter(
      (f) => f.properties.role !== "ideal",
    );
    layout.features.push({
      type: "Feature",
      id: "ideal",
      properties: {
        role: "ideal",
        sourceIds: [],
        estimated: true,
        method: "bounded-minimum-curvature-local-time-v1",
        edgeMarginM: narrow ? 0.1 : 0.5,
        ...(road.ground ? { boundaryModel: "shared-ground-v1" as const } : {}),
        borderLicenses: [
          ...new Set(
            [...borders.map((b) => (b.properties as { license: string }).license),
              ...(road.ground && road.recipe.sharedGround ? [road.recipe.sharedGround.imagery.license] : [])],
          ),
        ],
      },
      geometry: { type: "LineString", coordinates },
    });
    await writeFile(file, serializeLayout(layout));
    report.push({ file, status: "generated" });
  } catch (e) {
    layout.features = layout.features.filter(
      (f) => f.properties.role !== "ideal",
    );
    await writeFile(file, serializeLayout(layout));
    report.push({ file, status: "unavailable", reason: String(e) });
  }
  await writeFile(
    `.local/ideal-generation/${narrow ? "narrow" : "recovery"}-${shard}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(file, report.at(-1)!.status);
}
