import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geometryPaths, type Layout } from "../schemas/data";
import { plane, project, type Position } from "../src/geo";
import { pathCrossings } from "../src/path-crossings";

type SourceWay = {
  type: string;
  id: number;
  version?: number;
  nodes?: number[];
  tags?: Record<string, string>;
  geometry?: readonly { lon: number; lat: number }[];
};
type Segment = {
  wayId: number;
  wayVersion: number;
  fromIndex?: number;
  toIndex?: number;
};
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

/** A source bridge match is evidence for review, never permission to accept a crossing. */
export function auditGradeCrossings(
  trace: Position[],
  closed: boolean,
  sourceWays: readonly SourceWay[] = [],
  routeSegments: readonly Segment[] = [],
) {
  if (!trace.length) return [];
  const projection = plane(trace[0]),
    planar = trace.map(projection.to),
    hits = pathCrossings(planar, closed),
    bridges = sourceWays.filter(
      (w) =>
        w.type === "way" &&
        w.tags?.bridge &&
        !["no", "0", "false"].includes(w.tags.bridge) &&
        (w.tags.highway === "raceway" ||
          w.tags["disused:highway"] === "raceway") &&
        w.geometry &&
        routeSegments.some(
          (s) => s.wayId === w.id && s.wayVersion === w.version,
        ),
    );
  return hits.map((hit) => {
    const coordinate = projection.from(hit.point),
      candidates: {
        wayId: number;
        wayVersion: number;
        bridge: string;
        layer: string | null;
        branch: number;
        url: string;
      }[] = [];
    if (hit.kind !== "overlap")
      for (const bridge of bridges) {
        const geometry = bridge.geometry!.map((p): Position => [p.lon, p.lat]),
          branches = new Set<number>();
        for (let i = 0; i < geometry.length - 1; i++) {
          const a = geometry[i],
            b = geometry[i + 1];
          if (a[0] === b[0] && a[1] === b[1]) continue;
          const match = project(coordinate, a, b);
          if (match.displacementM > 0.25) continue;
          hit.segments.forEach((segment, branch) => {
            const p = planar[segment],
              q = planar[(segment + 1) % planar.length],
              dx = q[0] - p[0],
              dy = q[1] - p[1],
              length = Math.hypot(dx, dy),
              alignment =
                Math.abs(dx * match.tangent[0] + dy * match.tangent[1]) /
                length;
            if (alignment >= Math.cos((5 * Math.PI) / 180))
              branches.add(branch);
          });
        }
        // Two matching branches are a retrace, not evidence of a separated crossing.
        if (branches.size === 1)
          candidates.push({
            wayId: bridge.id,
            wayVersion: bridge.version!,
            bridge: bridge.tags!.bridge,
            layer: bridge.tags!.layer ?? null,
            branch: [...branches][0],
            url: `https://www.openstreetmap.org/way/${bridge.id}/history/${bridge.version}`,
          });
      }
    return {
      kind: hit.kind,
      segments: hit.segments,
      fractions: hit.fractions.map((v) => Number(v.toFixed(8))),
      stationsM: hit.stations.map((v) => Number(v.toFixed(3))),
      coordinate,
      bridgeCandidates: candidates,
      status:
        candidates.length === 1 ? "source-bridge-needs-profile" : "unexplained",
    };
  });
}

/** Sharp turns are review hints: a real hairpin can be equally sharp. */
export function auditSharpSourceTurns(
  trace: Position[],
  closed: boolean,
  sourceWays: readonly SourceWay[] = [],
  routeSegments: readonly Segment[] = [],
) {
  if (trace.length < 3) return [];
  const projection = plane(trace[0]),
    points = trace.map(projection.to),
    count = closed && trace[0][0] === trace.at(-1)![0] && trace[0][1] === trace.at(-1)![1]
      ? trace.length - 1 : trace.length,
    events = [];
  for (let i = closed ? 0 : 1; i < count - (closed ? 0 : 1); i++) {
    const p = points[i];
    if (i > 0 && Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) <= 0.01) continue;
    const distinct = (direction: number) => {
      for (let step = 1; step < count; step++) {
        const index = i + direction * step;
        if (!closed && (index < 0 || index >= count)) break;
        const j = (index + count) % count;
        if (Math.hypot(points[j][0] - p[0], points[j][1] - p[1]) > 0.01) return j;
      }
      return undefined;
    };
    const before = distinct(-1),
      after = distinct(1);
    if (before === undefined || after === undefined) continue;
    const a = [p[0] - points[before][0], p[1] - points[before][1]],
      b = [points[after][0] - p[0], points[after][1] - p[1]],
      turnDeg = Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1]) * 180 / Math.PI;
    if (turnDeg >= 145) events.push({
      vertex: i, coordinate: trace[i], previousVertex: before, nextVertex: after,
      turnDeg: Number(turnDeg.toFixed(2)),
      incomingM: Number(Math.hypot(...a).toFixed(2)),
      outgoingM: Number(Math.hypot(...b).toFixed(2)),
      status: "needs-identity-and-image-review",
      sourceOccurrences: sourceWays.flatMap(way => (way.geometry ?? []).flatMap((point, wayIndex) => {
        if (point.lon !== trace[i][0] || point.lat !== trace[i][1] || !routeSegments.some(segment =>
          segment.wayId === way.id && segment.wayVersion === way.version &&
          (segment.fromIndex === undefined || segment.toIndex === undefined ||
            (wayIndex >= Math.min(segment.fromIndex, segment.toIndex) && wayIndex <= Math.max(segment.fromIndex, segment.toIndex))))) return [];
        return [{wayId: way.id, wayVersion: way.version, wayIndex, ...(way.nodes?.[wayIndex] === undefined ? {} : {nodeId: way.nodes[wayIndex]})}];
      })),
    });
  }
  return events;
}

async function main() {
  const outputIndex = process.argv.indexOf("--output"),
    output = outputIndex < 0 ? undefined : process.argv[outputIndex + 1];
  if (!output || output.startsWith("--"))
    throw new Error("Use --output /path/to/crossing-audit.json");
  const ledgerBytes = await readFile("data/border-inference-coverage.json"),
    ledger = JSON.parse(ledgerBytes.toString()),
    missing = ledger.records.filter((r: { status: string }) =>
      ["needs-imagery-review", "needs-route-review"].includes(r.status),
    ),
    records = [],
    summary = {
      missingLayouts: 0,
      singlePathsAudited: 0,
      networksSkipped: 0,
      layoutsWithCrossings: 0,
      layoutsWithSharpSourceTurns: 0,
      sharpSourceTurnEvents: 0,
      layoutsWithSourceBridgeCandidates: 0,
      unexplainedCrossings: 0,
    };
  const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
  for (const row of missing) {
    summary.missingLayouts++;
    if (!row.file) continue;
    const layout = (await read(row.file)) as Layout,
      trace = layout.features.find((f) => f.properties.role === "trace")!,
      paths = geometryPaths(trace.geometry);
    if (["inner", "outer"].every(role => layout.features.some(feature => feature.properties.role === role)))
      throw new Error(`Coverage ledger marks bordered layout as missing: ${row.trackId}/${row.layoutId}`);
    if (paths.length !== 1) {
      summary.networksSkipped++;
      continue;
    }
    summary.singlePathsAudited++;
    const recipeFile = `sources/${row.trackId}/layouts/${row.layoutId}.json`;
    let evidence:
        | {
            recipeFile: string;
            recipeSha256: string;
            snapshotFile: string;
            snapshotSha256: string;
          }
        | undefined,
      ways: SourceWay[] = [],
      segments: Segment[] = [];
    try {
      const recipeBytes = await readFile(recipeFile),
        recipe = JSON.parse(recipeBytes.toString()),
        snapshotFile = resolve(
          dirname(recipeFile),
          "..",
          recipe.snapshotFile ?? "osm.json",
        ),
        snapshotBytes = await readFile(snapshotFile);
      if (hash(snapshotBytes) !== recipe.snapshotSha256)
        throw new Error(`Source snapshot hash mismatch: ${recipeFile}`);
      ways = JSON.parse(snapshotBytes.toString()).elements ?? [];
      segments = recipe.segments ?? [];
      evidence = {
        recipeFile,
        recipeSha256: hash(recipeBytes),
        snapshotFile: snapshotFile.slice(process.cwd().length + 1),
        snapshotSha256: hash(snapshotBytes),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const crossings = auditGradeCrossings(
      paths[0],
      layout.metadata.closed,
      ways,
      segments,
    );
    const sharpSourceTurns = auditSharpSourceTurns(paths[0], layout.metadata.closed, ways, segments);
    if (!crossings.length && !sharpSourceTurns.length) continue;
    if (crossings.length) summary.layoutsWithCrossings++;
    if (sharpSourceTurns.length) summary.layoutsWithSharpSourceTurns++;
    summary.sharpSourceTurnEvents += sharpSourceTurns.length;
    if (crossings.some((c) => c.bridgeCandidates.length))
      summary.layoutsWithSourceBridgeCandidates++;
    summary.unexplainedCrossings += crossings.filter(
      (c) => c.status === "unexplained",
    ).length;
    records.push({
      trackId: row.trackId,
      layoutId: row.layoutId,
      file: row.file,
      traceSha256: hash(JSON.stringify(trace.geometry)),
      ...(evidence ? { source: evidence } : {}),
      crossings,
      sharpSourceTurns,
    });
  }
  const report =
    JSON.stringify(
      {
        schemaVersion: 1,
        missingLayoutSetSha256: hash(
          JSON.stringify(
            missing.map(
              (r: {
                trackId: string;
                layoutId: string;
                file: string;
                status: string;
              }) => ({
                trackId: r.trackId,
                layoutId: r.layoutId,
                file: r.file,
                status: r.status,
              }),
            ),
          ),
        ),
        note: "Diagnostic source-topology audit only. No boundaries, elevation profiles or models are accepted or changed. Explicit source bridge matches still require imagery review, separate road levels and crossing-aware runtime reconstruction. Collinear retraces and unexplained intersections stay unresolved. Source turns of at least 145 degrees flag possible needle joins before image authoring; real hairpins can also trigger this diagnostic. They require identity and image review, never automatic route replacement, border acceptance or rejection. Coordinates come only from public mapped traces; no timing data is read.",
        summary,
        records,
      },
      null,
      2,
    ) + "\n";
  if (process.argv.includes("--check")) {
    if ((await readFile(output, "utf8")) !== report)
      throw new Error(
        "Crossing audit is stale; regenerate it before publishing",
      );
  } else await writeFile(output, report);
  console.log(summary);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
