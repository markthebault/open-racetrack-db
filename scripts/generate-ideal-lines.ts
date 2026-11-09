import { removeIdealLoops } from "./ideal-path-topology";
import { repairIdealPath } from "./ideal-path-repair";
import { serializeLayout } from "./layout-borders";
import { idealCorridor } from "./ideal-corridor";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { geometryPaths, type Layout } from "../schemas/data";
import { buildRoad } from "../src/lap-simulation";
import { plane, R, rad, equal, length, type Position } from "../src/geo";
import { insideRing } from "../src/boundary-path";
import { IDEAL_CAR } from "../src/ideal-line-model";
import { optimizeLine } from "./ideal-line-solver";
import { edgeChecker } from "./ideal-clearance";
const [shard, count] = (process.argv[2] ?? "0/1").split("/").map(Number);
const index = JSON.parse(await readFile("data/index.json", "utf8"));
const files: string[] = [];
for (const entry of index.tracks) {
  const track = JSON.parse(await readFile("data/" + entry.file, "utf8"));
  for (const l of track.layouts)
    if (l.file)
      files.push("data/" + entry.file.replace(/track.json$/, "") + l.file);
}
const retry = process.argv.includes("--retry");
const retryFiles = new Set<string>();
if (retry) {
  for (let j = 0; j < count; j++) {
    const r = JSON.parse(
      await readFile(`.local/ideal-generation/shard-${j}.json`, "utf8"),
    );
    r.filter((x: any) => x.status === "unavailable").forEach((x: any) =>
      retryFiles.add(x.file),
    );
  }
}
const report: { file: string; status: string; reason?: string }[] = [];
await mkdir(".local/ideal-generation", { recursive: true });
for (const [i, file] of files.entries()) {
  if (i % count !== shard || (retry && !retryFiles.has(file))) continue;
  const raw = await readFile(file, "utf8"),
    data = JSON.parse(raw) as Layout;
  const features = data.features.filter((f) => f.properties.role !== "ideal");
  const borders = ["inner", "outer"].map((role) =>
    features.find((f) => f.properties.role === role),
  );
  if (borders.some((b) => !b)) continue;
  try {
    const paths = borders.map((b) => geometryPaths(b!.geometry)),
      traces = geometryPaths(
        features.find((f) => f.properties.role === "trace")!.geometry,
      );
    if (paths[0].length !== paths[1].length)
      throw new Error("Boundary components cannot be paired");
    const output: Position[][] = [];
    for (let k = 0; k < paths[0].length; k++) {
      const a = paths[0][k],
        b = paths[1][k],
        trace = traces[Math.min(k, traces.length - 1)];
      const closed = equal(a[0], a.at(-1)!) && equal(b[0], b.at(-1)!);
      const child = structuredClone(data);
      child.features = structuredClone(
        features.filter(
          (f) =>
            f.properties.role === "trace" ||
            f.properties.role === "inner" ||
            f.properties.role === "outer",
        ),
      );
      for (const f of child.features)
        f.geometry = {
          type: "LineString",
          coordinates:
            f.properties.role === "inner"
              ? a
              : f.properties.role === "outer"
                ? b
                : trace,
        };
      delete child.metadata.geometryKind;
      delete child.metadata.borderComposition;
      if (closed) {
        child.metadata.closed = true;
        const len = length(trace);
        child.metadata.model3d = {
          ...child.metadata.model3d,
          kind: undefined,
          pathMethod: "boundary-normal-midpoints-v1",
          startOffsetM: 0,
          referenceLengthM: len,
          elevation: [
            [0, 0],
            [len, 0],
          ],
        } as any;
      } else if (child.metadata.model3d?.kind !== "run")
        throw new Error("Open borders need an ordered paired route");
      const direct = retry && closed ? idealCorridor(child, a, b) : undefined;
      const road = direct
          ? { origin: direct.origin, points: [] }
          : buildRoad(child),
        project = plane(road.origin),
        rings = direct?.rings ?? [a, b].map((r) => r.map(project.to)),
        clearance = direct?.clearance ?? edgeChecker(rings);
      const stations =
        direct?.stations ??
        road.points
          .filter(
            (_, j) => j % 3 === 0 || (!closed && j === road.points.length - 1),
          )
          .map((p) => {
            const x = p.x + (p.nx * (p.left - p.right)) / 2,
              z = p.z + (p.nz * (p.left - p.right)) / 2;
            return {
              x,
              z,
              y: p.y,
              nx: p.nx,
              nz: p.nz,
              halfWidth: Math.min((p.left + p.right) / 2, clearance([x, -z])),
            };
          });
      const car = IDEAL_CAR,
        result = optimizeLine(stations, closed, car, 100),
        points =
          direct && closed
            ? repairIdealPath(
                result.points,
                closed,
                rings,
                clearance,
                car.widthM / 2 + 0.52,
              )
            : result.points;
      for (let j = 0; j < (closed ? points.length : points.length - 1); j++) {
        const u = points[j],
          v = points[(j + 1) % points.length],
          steps = Math.ceil(Math.hypot(u.x - v.x, u.z - v.z));
        for (let t = 0; t <= steps; t++) {
          const f = t / steps,
            p: Position = [u.x * (1 - f) + v.x * f, -u.z * (1 - f) - v.z * f];
          if (clearance(p) < car.widthM / 2 + 0.52)
            throw new Error("Insufficient car-width clearance");
          if (closed && insideRing(p, rings[0]) === insideRing(p, rings[1]))
            throw new Error("Line leaves saved road surface");
        }
      }
      const inner = insideRing(rings[0][0], rings[1]) ? rings[0] : rings[1];
      const cleaned = closed
        ? removeIdealLoops(points, [inner[0][0], -inner[0][1]])
        : points;
      const path = cleaned.map(
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
      if (closed) path.push(path[0]);
      output.push(path);
    }
    const ideal = {
      type: "Feature",
      id: "ideal",
      properties: {
        role: "ideal",
        sourceIds: [],
        estimated: true,
        method: "bounded-minimum-curvature-local-time-v1",
        edgeMarginM: 0.5,
        borderLicenses: [
          ...new Set(
            borders.map((b) => (b!.properties as { license: string }).license),
          ),
        ],
      },
      geometry:
        output.length === 1
          ? { type: "LineString", coordinates: output[0] }
          : { type: "MultiLineString", coordinates: output },
    };
    data.features = [...features, ideal] as Layout["features"];
    await writeFile(file, serializeLayout(data));
    report.push({ file, status: "generated" });
  } catch (e) {
    report.push({ file, status: "unavailable", reason: String(e) });
  }
  await writeFile(
    `.local/ideal-generation/${retry ? "retry" : "shard"}-${shard}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(`${shard}: ${report.length} ${file}: ${report.at(-1)!.status}`);
}
