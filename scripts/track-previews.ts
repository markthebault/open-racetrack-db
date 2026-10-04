import { readFile, writeFile, mkdir } from "node:fs/promises";
import { indexSchema, geometryPaths, type Layout } from "../schemas/data";
import { previewPath } from "../src/track-preview";

const catalogue = indexSchema.parse(
  JSON.parse(await readFile("data/index.json", "utf8")),
);
const previews: Record<string, string> = {};
for (const entry of catalogue.tracks) {
  const track = JSON.parse(await readFile(`data/${entry.file}`, "utf8"));
  const layout =
    track.layouts.find(
      (l: { id: string; file: string | null }) =>
        l.id === track.defaultLayoutId && l.file,
    ) ?? track.layouts.find((l: { file: string | null }) => l.file);
  if (!layout) continue;
  const data: Layout = JSON.parse(
    await readFile(
      `data/${entry.file.replace(/track\.json$/, "")}${layout.file}`,
      "utf8",
    ),
  );
  const trace = data.features.find((f) => f.properties.role === "trace");
  if (trace) previews[entry.id] = previewPath(geometryPaths(trace.geometry));
}
await mkdir("src/assets", { recursive: true });
await writeFile(
  "src/assets/track-previews.json",
  JSON.stringify(previews) + "\n",
);
console.log(`Generated ${Object.keys(previews).length} track silhouettes.`);
