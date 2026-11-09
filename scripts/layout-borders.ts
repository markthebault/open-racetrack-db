import { readFile } from "node:fs/promises";
import { layoutSchema, type Layout } from "../schemas/data";
import type { TrackModel3D } from "../schemas/track-model";
import { prepareModel } from "../src/model-preparation";
import { modelInputHash } from "./model-input";

/** Border refreshes invalidate road geometry, but not an explicitly pinned display source. */
export function preserveDisplayImageryOnBorderRefresh(
  layout: Layout,
  previous?: TrackModel3D,
): Layout {
  layout = {...layout, features: layout.features.filter(f=>f.properties.role!=="ideal")};
  if (!previous?.preparation?.preserveImageryReference) return layout;
  const input = { ...layout, metadata: { ...layout.metadata, model3d: previous } },
    model3d = prepareModel(input, previous.terrain, modelInputHash(input, previous.terrain));
  return { ...layout, metadata: { ...layout.metadata, model3d } };
}

export async function existingLayoutExtras(
  file: string,
  allowMissing = false,
): Promise<{
  borders: Layout["features"];
  ideal?: Layout["features"][number];
  model3d?: Layout["metadata"]["model3d"];
  borderInference?: Layout["metadata"]["borderInference"];
  borderComposition?: Layout["metadata"]["borderComposition"];
}> {
  let bytes: string;
  try {
    bytes = await readFile(file, "utf8");
  } catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT")
      return { borders: [] };
    throw error;
  }
  const data = layoutSchema.parse(JSON.parse(bytes));
  return {
    borders: data.features.filter(
      (feature) =>
        feature.properties.role === "inner" ||
        feature.properties.role === "outer",
    ),
    ideal: data.features.find(f=>f.properties.role === "ideal"),
    model3d: data.metadata.model3d,
    borderInference: data.metadata.borderInference,
    borderComposition: data.metadata.borderComposition,
  };
}

export async function existingBorders(file: string, allowMissing = false) {
  return (await existingLayoutExtras(file, allowMissing)).borders;
}

// Preserve existing trace formatting; keep dense source borders and 3D parameters compact.
export function serializeLayout(data: Layout) {
  const supplemental = data.features.filter(
    (f) => f.properties.role === "inner" || f.properties.role === "outer" || f.properties.role === "ideal",
  );
  const primary = data.features.filter(
    (f) => f.properties.role !== "inner" && f.properties.role !== "outer" && f.properties.role !== "ideal",
  );
  const metadata = {
    ...data.metadata,
    ...(data.metadata.model3d ? { model3d: "__INLINE_MODEL3D__" } : {}),
    ...(data.metadata.borderComposition
      ? { borderComposition: "__INLINE_BORDER_COMPOSITION__" }
      : {}),
  };
  const text = JSON.stringify({ ...data, metadata, features: primary }, null, 2)
    .replace(
      '"borderComposition": "__INLINE_BORDER_COMPOSITION__"',
      () =>
        `"borderComposition": ${JSON.stringify(data.metadata.borderComposition)}`,
    )
    .replace(
      '"model3d": "__INLINE_MODEL3D__"',
      () => `"model3d": ${JSON.stringify(data.metadata.model3d)}`,
    );
  if (!supplemental.length) return text + "\n";
  const end = "\n  ]\n}";
  if (!text.endsWith(end)) throw new Error("Unexpected layout serialization");
  return (
    text.slice(0, -end.length) +
    ",\n" +
    supplemental.map((f) => "    " + JSON.stringify(f)).join(",\n") +
    end +
    "\n"
  );
}
