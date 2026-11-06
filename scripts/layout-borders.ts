import { readFile } from "node:fs/promises";
import { layoutSchema, type Layout } from "../schemas/data";

export async function existingLayoutExtras(
  file: string,
  allowMissing = false,
): Promise<{
  borders: Layout["features"];
  model3d?: Layout["metadata"]["model3d"];
  borderInference?: Layout["metadata"]["borderInference"];
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
    model3d: data.metadata.model3d,
    borderInference: data.metadata.borderInference,
  };
}

export async function existingBorders(file: string, allowMissing = false) {
  return (await existingLayoutExtras(file, allowMissing)).borders;
}

// Preserve existing trace formatting; keep dense source borders and 3D parameters compact.
export function serializeLayout(data: Layout) {
  const supplemental = data.features.filter(
    (f) => f.properties.role === "inner" || f.properties.role === "outer",
  );
  const primary = data.features.filter(
    (f) => f.properties.role !== "inner" && f.properties.role !== "outer",
  );
  const metadata = {
    ...data.metadata,
    ...(data.metadata.model3d ? { model3d: "__INLINE_MODEL3D__" } : {}),
  };
  const text = JSON.stringify(
    { ...data, metadata, features: primary },
    null,
    2,
  ).replace(
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
