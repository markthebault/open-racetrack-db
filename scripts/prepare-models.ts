import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  indexSchema,
  validateTrack,
  validateLayout,
  type Layout,
  type Track,
} from "../schemas/data";
import { elevationSchema, type ElevationGrid } from "../src/elevation";
import { prepareModel, PREPARATION_VERSION } from "../src/model-preparation";
import { isLapModel } from "../schemas/track-model";
import { buildRoad, simulateLap } from "../src/lap-simulation";
import { serializeLayout } from "./layout-borders";
import { popularModels } from "./popular-models";
const args = process.argv.slice(2),
  flag = (name: string) => args.includes(name),
  option = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
if (
  !flag("--popular") &&
  !option("--track") &&
  !flag("--all") &&
  !flag("--bordered")
)
  throw new Error(
    "Use --bordered, --popular or --track <id> [--layout <id>]. --check validates without writing; --refresh rebuilds generated models.",
  );
if (flag("--boundary-path") && (!option("--track") || !option("--layout")))
  throw new Error(
    "Use --boundary-path only with an individually reviewed --track and --layout",
  );
if (flag("--all") && !flag("--check"))
  throw new Error(
    "--all checks existing models; use --bordered to prepare every bordered layout.",
  );
const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const catalogue = indexSchema.parse(await json("data/index.json"));
const tracks = new Map<string, Track>(),
  layouts = new Map<string, Layout>(),
  terrains = new Map<string, ElevationGrid>();
async function readTrack(file: string) {
  if (!tracks.has(file)) tracks.set(file, validateTrack(await json(file)));
  return tracks.get(file)!;
}
async function readLayout(file: string, track: Track, id: string) {
  if (!layouts.has(file))
    layouts.set(file, validateLayout(await json(file), track, id));
  return layouts.get(file)!;
}
let selections: readonly { trackId: string; layoutId?: string }[] = flag(
  "--popular",
)
  ? popularModels
  : [{ trackId: option("--track")!, layoutId: option("--layout") }];
const started = performance.now();
if (flag("--all") || flag("--bordered")) {
  const discovered: { trackId: string; layoutId: string }[] = [];
  for (const entry of catalogue.tracks) {
    const file = `data/${entry.file}`,
      track = await readTrack(file);
    for (const item of track.layouts)
      if (item.file) {
        const layout = await readLayout(
          `${dirname(file)}/${item.file}`,
          track,
          item.id,
        );
        const roles = new Set(layout.features.map((f) => f.properties.role));
        if (
          flag("--bordered")
            ? roles.has("inner") && roles.has("outer")
            : !!layout.metadata.model3d
        )
          discovered.push({ trackId: entry.id, layoutId: item.id });
      }
  }
  selections = discovered;
}
type ReportRow = {
  track: string;
  trackId: string;
  layoutId: string;
  status: string;
  modelKind?: string;
  reason?: string;
  [key: string]: unknown;
};
const report: ReportRow[] = [],
  changedTracks = new Set<string>();
for (const selection of selections) {
  const entry = catalogue.tracks.find((t) => t.id === selection.trackId);
  if (!entry) throw new Error(`Unknown track: ${selection.trackId}`);
  const trackFile = `data/${entry.file}`,
    track = await readTrack(trackFile),
    layoutId = selection.layoutId ?? track.defaultLayoutId,
    item = track.layouts.find((l) => l.id === layoutId);
  const row: ReportRow = {
    track: track.name,
    trackId: track.id,
    layoutId,
    status: "pending",
  };
  try {
    if (!item?.file) throw new Error("No mapped layout");
    const file = `${dirname(trackFile)}/${item.file}`,
      layout = await readLayout(file, track, layoutId),
      old = layout.metadata.model3d;
    row.file = file;
    row.modelKind = old?.kind ?? "lap";
    if (old) {
      row.curbSections = old.curbs.length;
      row.modelBytes = Buffer.byteLength(JSON.stringify(old));
      if (old.kind === "surface") row.reason = old.reason;
    }
    if (old && (!old.preparation || old.quality.curbs === "imagery-reviewed")) {
      row.status = "hand-authored-preserved";
      report.push(row);
      continue;
    }
    let terrain = old?.terrain ?? terrains.get(track.id);
    if (!terrain) {
      terrain = elevationSchema.parse(
        await json(`data/elevation/${track.id}.json`),
      );
      terrains.set(track.id, terrain);
    }
    const boundaryPath =
      flag("--boundary-path") ||
      (old?.kind !== "surface" &&
        old?.pathMethod === "boundary-normal-midpoints-v1");
    const inputSha256 = createHash("sha256")
      .update(
        JSON.stringify({
          version: PREPARATION_VERSION,
          ...(boundaryPath
            ? { pathMethod: "boundary-normal-midpoints-v1" }
            : {}),
          features: layout.features,
          ...(layout.metadata.borderComposition
            ? { borderComposition: layout.metadata.borderComposition }
            : {}),
          timing: layout.metadata.timing,
          lengthM: layout.metadata.lengthM,
          terrain,
          ...(layout.metadata.borderInference
            ? { borderInference: layout.metadata.borderInference }
            : {}),
        }),
      )
      .digest("hex");
    const current =
      old?.preparation?.version === PREPARATION_VERSION &&
      old.preparation.inputSha256 === inputSha256;
    if (flag("--check")) {
      if (!current) throw new Error("Model missing or stale");
      row.status = "current";
      report.push(row);
      continue;
    }
    if (current && !flag("--refresh")) {
      row.status = "cached";
      report.push(row);
      continue;
    }
    const begin = performance.now(),
      model = prepareModel(layout, terrain, inputSha256, boundaryPath),
      updated = validateLayout(
        { ...layout, metadata: { ...layout.metadata, model3d: model } },
        track,
        layoutId,
      );
    delete row.reason;
    row.modelKind = model.kind ?? "lap";
    row.curbSections = model.curbs.length;
    if (isLapModel(model)) {
      const road = buildRoad(updated),
        lap = simulateLap(road),
        widths = road.points.map((p) => p.left + p.right);
      if (
        Math.min(...widths) < 3 ||
        !Number.isFinite(lap.duration) ||
        lap.duration <= 0
      )
        throw new Error("Runtime geometry audit failed");
      Object.assign(row, {
        profileAnchors: model.elevation.length,
        interpolatedSections: road.interpolatedSections,
        widthM: [Math.min(...widths), Math.max(...widths)],
        lapSeconds: lap.duration,
        peakKph: Math.max(...lap.speed) * 3.6,
      });
    } else row.reason = model.reason;
    if (!flag("--dry-run")) {
      await writeFile(file, serializeLayout(updated));
      layouts.set(file, updated);
      changedTracks.add(track.id);
    }
    Object.assign(row, {
      status: flag("--dry-run") ? "ready" : "prepared",
      file,
      modelBytes: Buffer.byteLength(JSON.stringify(model)),
      elapsedMs: performance.now() - begin,
    });
  } catch (error) {
    row.status = "failed";
    row.reason = error instanceof Error ? error.message : String(error);
    console.error(`${track.id}/${layoutId}: ${row.reason}`);
  }
  report.push(row);
  if (report.length % 50 === 0)
    console.log(
      `${report.length}/${selections.length} layouts checked; ${report.filter((r) => r.status === "failed").length} failures`,
    );
}
// A venue grid is removed only after every mapped layout is self-contained. Never remove it mid-batch.
if (!flag("--check") && !flag("--dry-run"))
  for (const id of changedTracks) {
    const entry = catalogue.tracks.find((t) => t.id === id)!,
      trackFile = `data/${entry.file}`,
      track = await readTrack(trackFile);
    const all = await Promise.all(
      track.layouts
        .filter((l) => l.file)
        .map((l) => readLayout(`${dirname(trackFile)}/${l.file}`, track, l.id)),
    );
    if (all.every((l) => l.metadata.model3d))
      await rm(`data/elevation/${id}.json`, { force: true });
  }
await mkdir(".local/model3d", { recursive: true });
const output = {
  version: 2,
  elapsedMs: performance.now() - started,
  circuits: new Set(report.map((r) => r.trackId)).size,
  laps: report.filter((r) => r.modelKind === "lap").length,
  runs: report.filter((r) => r.modelKind === "run").length,
  surfaces: report.filter((r) => r.modelKind === "surface").length,
  tracks: report,
};
await writeFile(
  `.local/model3d/${flag("--bordered") ? "bordered-" : ""}${flag("--check") ? "check" : flag("--refresh") ? "refresh" : flag("--dry-run") ? "dry-run" : "prepare"}-report.json`,
  JSON.stringify(output, null, 2) + "\n",
);
const failed = report.filter((r) => r.status === "failed").length;
console.log(
  `${report.length} layouts / ${output.circuits} circuits: ${report.filter((r) => r.status === "prepared").length} prepared, ${report.filter((r) => r.status === "cached" || r.status === "current").length} current, ${failed} failures; ${output.elapsedMs.toFixed(1)} ms.`,
);
if (failed)
  throw new Error(`${failed} model preparations failed; see the report.`);
