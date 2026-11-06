import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { imageryTilesSchema } from "../schemas/imagery-tiles";
import {
  borderInferenceSchema,
  type BorderInference,
} from "../schemas/border-inference";
import type { Raster } from "./infer-image-borders";
const SIZE = 512,
  WORLD = 2 * Math.PI * 6378137;
const tileSchema = z.strictObject({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  zoom: imageryTilesSchema.shape.zoom,
  bounds: imageryTilesSchema.shape.bounds,
  tiles: z.array(tileSchema).min(1).max(4096),
});
export type TileManifest = z.infer<typeof manifestSchema>;
export const bytesHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
function checkedManifest(input: TileManifest) {
  const manifest = manifestSchema.parse(input);
  imageryTilesSchema.parse({
    provider: "maptiler-satellite-v4",
    zoom: manifest.zoom,
    bounds: manifest.bounds,
  });
  manifest.tiles.sort((a, b) => a.x - b.x || a.y - b.y);
  const seen = new Set<string>(),
    [x0, y0, x1, y1] = manifest.bounds;
  for (const tile of manifest.tiles) {
    const key = `${tile.x},${tile.y}`;
    if (
      seen.has(key) ||
      tile.x < x0 ||
      tile.x > x1 ||
      tile.y < y0 ||
      tile.y > y1
    )
      throw new Error("Invalid tile manifest coverage");
    seen.add(key);
  }
  return manifest;
}
export function tileManifestHash(input: TileManifest) {
  return bytesHash(JSON.stringify(checkedManifest(input)));
}
function checkedImage(
  input: BorderInference["imagery"],
  manifest: TileManifest,
) {
  const info = borderInferenceSchema.shape.imagery.parse(input),
    [x0, y0, x1, y1] = manifest.bounds,
    span = WORLD / 2 ** manifest.zoom;
  const extent = [
    x0 * span - WORLD / 2,
    WORLD / 2 - (y1 + 1) * span,
    (x1 + 1) * span - WORLD / 2,
    WORLD / 2 - y0 * span,
  ];
  if (
    info.encoding !== "xyz-jpeg-manifest-v1" ||
    info.tiles?.zoom !== manifest.zoom ||
    JSON.stringify(info.tiles.bounds) !== JSON.stringify(manifest.bounds) ||
    info.width !== (x1 - x0 + 1) * SIZE ||
    info.height !== (y1 - y0 + 1) * SIZE ||
    info.extent3857.some((v, i) => Math.abs(v - extent[i]) > 1e-6) ||
    tileManifestHash(manifest) !== info.sha256
  )
    throw new Error("Tile raster metadata or manifest hash mismatch");
  return info;
}
function decode(bytes: Buffer, expected: string) {
  if (bytesHash(bytes) !== expected)
    throw new Error("Cached imagery tile hash mismatch");
  const image = jpeg.decode(bytes, { useTArray: true });
  if (image.width !== SIZE || image.height !== SIZE)
    throw new Error("Unexpected satellite tile dimensions");
  return image.data;
}
/** A virtual raster; only a small LRU of decoded tiles is retained, irrespective of bounding area. */
export function createTiledRaster(
  input: BorderInference["imagery"],
  inputManifest: TileManifest,
  readTile: (x: number, y: number) => Buffer,
  capacity = 8,
) {
  const manifest = checkedManifest(inputManifest),
    info = checkedImage(input, manifest),
    tiles = new Map(manifest.tiles.map((t) => [`${t.x},${t.y}`, t])),
    cache = new Map<string, Uint8Array>();
  if (!Number.isInteger(capacity) || capacity < 1)
    throw new Error("Tile cache capacity must be positive");
  let peak = 0;
  const image: Raster = {
    width: info.width,
    height: info.height,
    extent: info.extent3857,
    sample(x, y) {
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= info.width ||
        y >= info.height
      )
        return [0, 0, 0, 0];
      const tx = manifest.bounds[0] + Math.floor(x / SIZE),
        ty = manifest.bounds[1] + Math.floor(y / SIZE),
        key = `${tx},${ty}`,
        tile = tiles.get(key);
      if (!tile) return [0, 0, 0, 0];
      let data = cache.get(key);
      if (data) cache.delete(key);
      else {
        if (cache.size >= capacity) cache.delete(cache.keys().next().value!);
        data = decode(readTile(tx, ty), tile.sha256);
      }
      cache.set(key, data);
      peak = Math.max(peak, cache.size * SIZE * SIZE * 4);
      const offset = ((y % SIZE) * SIZE + (x % SIZE)) * 4;
      return [
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
      ];
    },
  };
  return {
    image,
    retainedPixelBytes: () => cache.size * SIZE * SIZE * 4,
    peakDecodedPixelBytes: () => peak,
  };
}
export async function loadTiledRaster(sidecar: string) {
  const info = borderInferenceSchema.shape.imagery.parse(
      JSON.parse(await readFile(sidecar, "utf8")),
    ),
    manifest = checkedManifest(
      JSON.parse(
        await readFile(sidecar.replace(/\.json$/, ".manifest.json"), "utf8"),
      ),
    ),
    root = dirname(sidecar);
  checkedImage(info, manifest);
  // Validate the entire pinned evidence, including corridor tiles not sampled by this detector run.
  for (const tile of manifest.tiles) {
    const bytes = await readFile(
      `${root}/${manifest.zoom}-${tile.x}-${tile.y}.jpg`,
    );
    if (bytesHash(bytes) !== tile.sha256)
      throw new Error("Pinned imagery tile hash mismatch");
  }
  return {
    info,
    image: createTiledRaster(info, manifest, (x, y) =>
      readFileSync(`${root}/${manifest.zoom}-${x}-${y}.jpg`),
    ).image,
  };
}
/** Review thumbnail only. Inference always reads the original pixels, never this downsample. */
export async function writeTiledPreview(
  file: string,
  info: BorderInference["imagery"],
  manifest: TileManifest,
  readTile: (x: number, y: number) => Buffer,
) {
  checkedImage(info, checkedManifest(manifest));
  const scale = Math.min(1, 2048 / info.width, 2048 / info.height),
    width = Math.max(1, Math.floor(info.width * scale)),
    height = Math.max(1, Math.floor(info.height * scale)),
    png = new PNG({ width, height });
  for (const tile of manifest.tiles) {
    const data = decode(readTile(tile.x, tile.y), tile.sha256),
      dx = (tile.x - manifest.bounds[0]) * SIZE,
      dy = (tile.y - manifest.bounds[1]) * SIZE;
    for (
      let y = Math.max(0, Math.floor(dy * scale));
      y < Math.min(height, Math.ceil((dy + SIZE) * scale));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(dx * scale));
        x < Math.min(width, Math.ceil((dx + SIZE) * scale));
        x++
      ) {
        const sx = Math.floor((x + 0.5) / scale) - dx,
          sy = Math.floor((y + 0.5) / scale) - dy;
        if (sx < 0 || sy < 0 || sx >= SIZE || sy >= SIZE) continue;
        const from = (sy * SIZE + sx) * 4,
          to = (y * width + x) * 4;
        png.data.set(data.subarray(from, from + 4), to);
      }
  }
  await writeFile(file, PNG.sync.write(png));
}
