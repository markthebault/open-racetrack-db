import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  geometryPaths,
  validateTrack,
  validateLayout,
  type Layout,
} from "../schemas/data";
import { layoutContentHash } from "./reviewed-network-borders";
import { serializeLayout } from "./layout-borders";
const check = process.argv.includes("--check"),
  index = JSON.parse(await readFile("data/index.json", "utf8"));
let count = 0;
for (const e of index.tracks) {
  const track = validateTrack(
      JSON.parse(await readFile("data/" + e.file, "utf8")),
    ),
    dir = "data/" + dirname(e.file);
  for (const entry of track.layouts) {
    if (!entry.file || !entry.roadWidthM) continue;
    const file = dir + "/" + entry.file,
      raw = JSON.parse(await readFile(file, "utf8")) as Layout;
    if (!raw.metadata.borderComposition) continue;
    const updated = structuredClone(raw),
      paths = geometryPaths(
        raw.features.find((f) => f.properties.role === "trace")!.geometry,
      );
    for (const [i, c] of updated.metadata.borderComposition!.entries()) {
      const source = track.layouts.find((l) => l.id === c.sourceLayoutId);
      if (!source?.file || !source.roadWidthM)
        throw Error("Missing width component " + c.sourceLayoutId);
      const child = validateLayout(
        JSON.parse(await readFile(dir + "/" + source.file, "utf8")),
        track,
        source.id,
      );
      if (
        !isDeepStrictEqual(
          paths[i],
          geometryPaths(
            child.features.find((f) => f.properties.role === "trace")!.geometry,
          )[0],
        )
      )
        throw Error("Component trace changed " + file);
      const { model3d, ...metadata } = child.metadata;
      if (!model3d) throw Error("Missing component model");
      const { terrain: _, ...recipe } = model3d;
      void _;
      c.metadata = metadata;
      c.recipe = recipe;
      c.sourceSha256 = layoutContentHash(child);
      c.timingFeatures = child.features.filter((f) =>
        ["start", "finish", "start_finish"].includes(f.properties.role),
      ) as typeof c.timingFeatures;
    }
    if (check) {
      if (!isDeepStrictEqual(raw, updated))
        throw Error("Stale compact network " + file);
    } else await writeFile(file, serializeLayout(updated));
    count++;
  }
}
console.log(`${count} compact networks ${check ? "verified" : "synchronized"}`);
