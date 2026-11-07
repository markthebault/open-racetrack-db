import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { BorderInference } from "../schemas/border-inference";
import { plane, type Position } from "../src/geo";
import { inferImageBorders, type Raster } from "../scripts/infer-image-borders";
import {
  bytesHash,
  createTiledRaster,
  tileManifestHash,
  loadTiledRaster,
  writeTiledPreview,
  type TileManifest,
} from "../scripts/tiled-raster";
const WORLD = 2 * Math.PI * 6378137;
function infoFor(manifest: TileManifest): BorderInference["imagery"] {
  const [x0, y0, x1, y1] = manifest.bounds,
    span = WORLD / 2 ** manifest.zoom;
  return {
    sourceId: "fixture-imagery",
    url: "https://example.com/tiles.json",
    license: "LicenseRef-MapTiler-Derived-Borders",
    rightsBasis: "source-specific-agreement",
    attribution: "Fixture imagery",
    retrievedAt: "2026-11-06T00:00:00.000Z",
    sha256: tileManifestHash(manifest),
    encoding: "xyz-jpeg-manifest-v1",
    width: (x1 - x0 + 1) * 512,
    height: (y1 - y0 + 1) * 512,
    extent3857: [
      x0 * span - WORLD / 2,
      WORLD / 2 - (y1 + 1) * span,
      (x1 + 1) * span - WORLD / 2,
      WORLD / 2 - y0 * span,
    ],
    groundPixelSizeM: span / 512,
    tiles: {
      provider: "maptiler-satellite-v4",
      zoom: manifest.zoom,
      bounds: manifest.bounds,
    },
  };
}
function fixture() {
  const manifest: TileManifest = {
      schemaVersion: 1,
      zoom: 17,
      bounds: [65535, 65535, 65536, 65536],
      tiles: [],
    },
    images = new Map<string, Buffer>(),
    dense = new Uint8Array(1024 * 1024 * 4),
    span = WORLD / 2 ** 17;
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const data = Buffer.alloc(512 * 512 * 4);
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
          const mx = ((tx * 512 + x + 0.5) / 1024) * 2 * span - span,
            my = span - ((ty * 512 + y + 0.5) / 1024) * 2 * span,
            r = Math.hypot(mx, my),
            offset = (y * 512 + x) * 4;
          data.set(
            r >= 94 && r <= 106 ? [95, 95, 95, 255] : [45, 150, 50, 255],
            offset,
          );
        }
      const bytes = jpeg.encode({ data, width: 512, height: 512 }, 90).data,
        x = 65535 + tx,
        y = 65535 + ty;
      images.set(`${x},${y}`, bytes);
      manifest.tiles.push({ x, y, sha256: bytesHash(bytes) });
      const decoded = jpeg.decode(bytes, { useTArray: true });
      for (let row = 0; row < 512; row++)
        dense.set(
          decoded.data.subarray(row * 512 * 4, (row + 1) * 512 * 4),
          ((ty * 512 + row) * 1024 + tx * 512) * 4,
        );
    }
  return { manifest, images, dense, info: infoFor(manifest) };
}
test("tile-backed and dense imagery infer identical boundaries across JPEG tile seams", () => {
  const { manifest, images, dense, info } = fixture(),
    tiled = createTiledRaster(
      info,
      manifest,
      (x, y) => images.get(`${x},${y}`)!,
      2,
    );
  const denseImage: Raster = {
      width: 1024,
      height: 1024,
      data: dense,
      extent: info.extent3857,
    },
    local = plane([0, 0]),
    trace: Position[] = Array.from({ length: 80 }, (_, i) =>
      local.from([
        100 * Math.cos((i / 80) * Math.PI * 2),
        100 * Math.sin((i / 80) * Math.PI * 2),
      ]),
    );
  trace.push(trace[0]);
  const expected = inferImageBorders(trace, denseImage, {
      method: "road-appearance-v3",
    }),
    actual = inferImageBorders(trace, tiled.image, {
      method: "road-appearance-v3",
    });
  assert.deepEqual(actual, expected);
  assert.ok(tiled.peakDecodedPixelBytes() <= 2 * 512 * 512 * 4);
});
test("large virtual rasters allocate pixels only for requested corridor tiles and reject missing coverage", () => {
  const { images, manifest } = fixture(),
    first = manifest.tiles[0],
    last = { ...manifest.tiles[1], x: 66534, y: 66534 },
    large: TileManifest = {
      schemaVersion: 1,
      zoom: 17,
      bounds: [65535, 65535, 66534, 66534],
      tiles: [first, last],
    },
    info = infoFor(large),
    tiled = createTiledRaster(
      info,
      large,
      (x, y) =>
        images.get(
          x === first.x && y === first.y
            ? `${first.x},${first.y}`
            : `${manifest.tiles[1].x},${manifest.tiles[1].y}`,
        )!,
      1,
    );
  assert.equal(tiled.retainedPixelBytes(), 0);
  assert.equal(info.width * info.height, 262144000000);
  assert.equal(tiled.image.sample!(0, 0)[3], 255);
  assert.equal(tiled.image.sample!(info.width - 1, info.height - 1)[3], 255);
  assert.deepEqual(tiled.image.sample!(1024, 1024), [0, 0, 0, 0]);
  assert.ok(tiled.peakDecodedPixelBytes() <= 512 * 512 * 4);
  const local = plane([0, 0]),
    trace: Position[] = Array.from({ length: 40 }, (_, i) =>
      local.from([
        100 * Math.cos((i / 40) * Math.PI * 2),
        100 * Math.sin((i / 40) * Math.PI * 2),
      ]),
    );
  trace.push(trace[0]);
  assert.throws(
    () =>
      inferImageBorders(trace, tiled.image, { method: "road-appearance-v3" }),
    /cover|coverage/,
  );
});
test("pinned tile evidence verifies the full manifest and every file; previews do not change inference evidence", async () => {
  const { manifest, images, info } = fixture(),
    root = await mkdtemp(join(tmpdir(), "track-tiles-")),
    sidecar = join(root, "raster.json");
  try {
    await writeFile(sidecar, JSON.stringify(info));
    await writeFile(
      join(root, "raster.manifest.json"),
      JSON.stringify(manifest),
    );
    for (const tile of manifest.tiles)
      await writeFile(
        join(root, `${manifest.zoom}-${tile.x}-${tile.y}.jpg`),
        images.get(`${tile.x},${tile.y}`)!,
      );
    const loaded = await loadTiledRaster(sidecar);
    assert.equal(loaded.image.sample!(0, 0)[3], 255);
    const preview = join(root, "preview.png");
    await writeTiledPreview(preview, info, manifest, (x, y) =>
      images.get(`${x},${y}`)!,
    );
    const { readFile } = await import("node:fs/promises"),
      png = PNG.sync.read(await readFile(preview));
    assert.ok(png.width <= 2048 && png.height <= 2048);
    const corrupt = structuredClone(manifest);
    corrupt.tiles[0].sha256 = "a".repeat(64);
    assert.throws(
      () => createTiledRaster(info, corrupt, () => Buffer.alloc(0)),
      /manifest hash/,
    );
    await writeFile(
      join(
        root,
        `${manifest.zoom}-${manifest.tiles.at(-1)!.x}-${manifest.tiles.at(-1)!.y}.jpg`,
      ),
      Buffer.from("changed"),
    );
    await assert.rejects(() => loadTiledRaster(sidecar), /tile hash/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
