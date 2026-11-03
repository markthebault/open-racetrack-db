import { readFile } from "node:fs/promises";
import { layoutSchema, type Layout } from "../schemas/data";

export async function existingBorders(file: string, allowMissing = false): Promise<Layout["features"]> {
  let bytes: string;
  try {
    bytes = await readFile(file, "utf8");
  } catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const data = layoutSchema.parse(JSON.parse(bytes));
  return data.features.filter(feature => feature.properties.role === "inner" || feature.properties.role === "outer");
}
