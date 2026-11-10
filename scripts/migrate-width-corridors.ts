/** One-way compact-data migration. Reads existing saved geometry only; never fetches imagery. */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { measureSavedWidth } from "../src/width-measurement";
import { remapWidthGrade } from "./width-grade";
import { bounds } from "../src/geo";
import { geometryPaths, type Layout } from "../schemas/data";
const root = ".local/width-rollout",
  report: any[] = [],
  failures: any[] = [];
const backup = async (file: string, bytes: string) => {
  const p = root + "/before/" + file;
  await mkdir(dirname(p), { recursive: true });
  try {
    await writeFile(p, bytes, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
};
function compactModel(m: any) {
  if (!m) return;
  delete m.preparation;
  delete m.sourceSequence;
  delete m.sharedGround;
  m.curbs = [];
  m.quality.borders = "width-estimated";
  m.quality.curbs = "geometry-estimated";
  m.quality.stationing = "mapped-trace";
  if (m.kind !== "surface") m.pathMethod = "constant-width-trace-v1";
}
for (const country of await readdir("data", { withFileTypes: true }))
  if (country.isDirectory()) {
    for (const folder of await readdir("data/" + country.name, {
      withFileTypes: true,
    }))
      if (folder.isDirectory()) {
        const dir = `data/${country.name}/${folder.name}`,
          trackFile = dir + "/track.json";
        let bytes: string;
        try {
          bytes = await readFile(trackFile, "utf8");
        } catch {
          continue;
        }
        const track = JSON.parse(bytes);
        let changed = false;
        for (const entry of track.layouts) {
          if (!entry.file || entry.lineUnavailableReason) continue;
          const file = dir + "/" + entry.file,
            original = await readFile(file, "utf8"),
            d = JSON.parse(original) as Layout;
          const borders = d.features.filter((f) =>
            ["inner", "outer"].includes(f.properties.role),
          );
          if (borders.length !== 2) continue;
          let measured;
          try {
            measured = measureSavedWidth(d);
          } catch (e) {
            failures.push({ file, reason: String(e) });
            continue;
          }
          const width = Math.max(
            3,
            Math.min(45, Math.round(measured.meanWidthM * 2) / 2),
          );
          await backup(file, original);
          if (!changed) await backup(trackFile, bytes);
          const licenses = [
            ...new Set(
              borders.flatMap((f: any) => [
                f.properties.license,
                ...(f.properties.sourceLicenses ?? []),
                ...(f.properties.imageCorrection
                  ? [f.properties.imageCorrection.license]
                  : []),
                ...(f.properties.imageCorrections ?? []).map(
                  (c: any) => c.license,
                ),
              ]),
            ),
          ];
          entry.roadWidthM = width;
          entry.roadWidthSource = {
            ...measured,
            roundingM: 0.5,
            borderSha256: createHash("sha256")
              .update(JSON.stringify(borders))
              .digest("hex"),
            licenses,
          };
          const mutable = d as any;
          const grade = remapWidthGrade(d, width);
          if (grade && mutable.metadata.model3d) mutable.metadata.model3d.gradeSeparation = grade;
          delete mutable.metadata.borderInference;
          compactModel(mutable.metadata.model3d);
          for (const component of mutable.metadata.borderComposition ?? []) {
            delete component.metadata.borderInference;
            compactModel(component.recipe);
          }
          mutable.features = mutable.features.filter(
            (f: any) =>
              !["inner", "outer", "ideal"].includes(f.properties.role),
          );
          mutable.bbox = bounds(
            mutable.features.flatMap((f: any) =>
              geometryPaths(f.geometry).flat(),
            ),
          );
          mutable.metadata.notes.push(
            "Estimated constant-width corridor: width is stored in track.json; inner, outer and ideal lines are calculated in the browser from the mapped trace. Local widening and earlier boundary corrections are not retained by this approximation.",
          );
          await writeFile(file, JSON.stringify(mutable) + "\n");
          report.push({
            file,
            trackFile,
            trackId: track.id,
            layoutId: entry.id,
            widthM: width,
            network: !!mutable.metadata.geometryKind,
            open: !mutable.metadata.closed,
            bytesBefore: Buffer.byteLength(original),
            bytesAfter: Buffer.byteLength(JSON.stringify(mutable) + "\n"),
            sourceTraceSha256: createHash("sha256")
              .update(
                JSON.stringify(
                  d.features.find((f) => f.properties.role === "trace")!
                    .geometry,
                ),
              )
              .digest("hex"),
          });
          changed = true;
        }
        if (changed)
          await writeFile(trackFile, JSON.stringify(track, null, 2) + "\n");
      }
  }
const coverageFile = "data/ideal-lines-coverage.json",
  coverage = JSON.parse(await readFile(coverageFile, "utf8"));
for (const r of coverage.records) {
  if (report.some((t) => t.file === r.file)) {
    r.status = "on-demand";
    delete r.reason;
  }
}
coverage.method = "trace-width-lap-time-v2";
coverage.widthLayouts = coverage.records.filter((r:any)=>r.status === "on-demand").length;
delete coverage.borderedLayouts;
coverage.unavailable = coverage.records.filter((r:any)=>r.status === "unavailable").length;
coverage.generated = coverage.records.filter(
  (r: any) => r.status === "generated",
).length;
coverage.computedOnDemand = coverage.records.filter(
  (r: any) => r.status === "on-demand",
).length;
await writeFile(coverageFile, JSON.stringify(coverage) + "\n");
await writeFile(
  root + "/migration.json",
  JSON.stringify(report, null, 2) + "\n",
);
await writeFile(
  root + "/failures.json",
  JSON.stringify(failures, null, 2) + "\n",
);
console.log({
  migrated: report.length,
  failures,
  bytesBefore: report.reduce((s, r) => s + r.bytesBefore, 0),
  bytesAfter: report.reduce((s, r) => s + r.bytesAfter, 0),
});
