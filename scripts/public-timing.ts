import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  geometryPaths,
  timingGpsSchema,
  validateTrack,
  validateLayout,
  type Layout,
} from "../schemas/data";
import { nearestEdge } from "../src/geo";

export const timingDatabaseSchema = z.record(
  z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  timingGpsSchema,
);
export type TimingDatabase = z.infer<typeof timingDatabaseSchema>;

export function withTiming(data: Layout, database: TimingDatabase): Layout {
  const timing = database[`${data.metadata.trackId}/${data.metadata.layoutId}`];
  if (!timing) return data;
  return {
    ...data,
    metadata: {
      ...data.metadata,
      timing,
      timingStatus: timing.start && timing.finish ? "estimated" : "partial",
    },
  };
}

async function publish() {
  const input = process.argv[process.argv.indexOf("--input") + 1];
  if (!process.argv.includes("--input") || !input)
    throw new Error("Use --input /path/to/timing.json");
  const records = JSON.parse(await readFile(input, "utf8"));
  const index = JSON.parse(await readFile("data/index.json", "utf8"));
  const output: TimingDatabase = {};
  const skipped: Record<string, number> = {};
  const skip = (reason: string) =>
    (skipped[reason] = (skipped[reason] ?? 0) + 1);
  for (const entry of index.tracks) {
    const track = validateTrack(
      JSON.parse(await readFile(`data/${entry.file}`, "utf8")),
    );
    for (const layout of track.layouts) {
      const key = `${track.id}/${layout.id}`,
        record = records[key];
      if (!record) {
        skip("missing");
        continue;
      }
      if (record.association === "proximity-only") {
        skip("proximity-only");
        continue;
      }
      if (!layout.file || !layout.referenceId?.endsWith(`/${record.name}`)) {
        skip("identity-or-geometry");
        continue;
      }
      const data = validateLayout(
        JSON.parse(
          await readFile(
            `data/${entry.file.replace(/track.json$/, "")}${layout.file}`,
            "utf8",
          ),
        ),
        track,
        layout.id,
      );
      const expected =
        data.metadata.timingMode === "shared"
          ? ["start_finish"]
          : ["finish", "start"];
      if (
        record.gates
          .map((gate: { role: string }) => gate.role)
          .sort()
          .join() !== expected.join()
      ) {
        skip("roles");
        continue;
      }
      const paths = geometryPaths(
        data.features.find((f) => f.properties.role === "trace")!.geometry,
      );
      const timing: z.infer<typeof timingGpsSchema> = {};
      for (const gate of record.gates) {
        const point = timingGpsSchema.parse({ start: gate.point }).start!;
        if (
          Math.min(
            ...paths.map((path) => nearestEdge(point, path).displacementM),
          ) > 50
        )
          continue;
        if (gate.role === "start_finish") {
          timing.start = point;
          timing.finish = point;
        } else if (gate.role === "start") timing.start = point;
        else if (gate.role === "finish") timing.finish = point;
      }
      if (!timing.start && !timing.finish) {
        skip("alignment");
        continue;
      }
      output[key] = timing;
      validateLayout(
        withTiming(
          { ...data, metadata: { ...data.metadata, timing: undefined } },
          output,
        ),
        track,
        layout.id,
      );
    }
  }
  const ordered = Object.fromEntries(
    Object.entries(timingDatabaseSchema.parse(output)).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  await writeFile("data/timing.json", JSON.stringify(ordered, null, 2) + "\n");
  console.log(
    `Published GPS positions for ${Object.keys(ordered).length} layouts. Omitted: ${JSON.stringify(skipped)}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await publish();
