import type { TrackModel3D } from "../schemas/track-model";
import type { ImageryTiles } from "../schemas/imagery-tiles";

/** Crop parent tiles to the exact extraction extent, bounded for mobile GPU memory. */
export function displayTilePlan(tiles: ImageryTiles, maxSize = 2048) {
  const [x0, y0, x1, y1] = tiles.bounds,
    tileSize = tiles.provider === "gsi-seamless-photo" ? 256 : 512,
    columns = x1 - x0 + 1,
    rows = y1 - y0 + 1,
    factor = Math.min(1, maxSize / (tileSize * Math.max(columns, rows))),
    zoom = Math.max(0, tiles.zoom + Math.floor(Math.log2(factor))),
    parent = 2 ** (tiles.zoom - zoom),
    width = Math.max(1, Math.round(columns * tileSize * factor)),
    height = Math.max(1, Math.round(rows * tileSize * factor)),
    cells: {
      x: number;
      y: number;
      left: number;
      top: number;
      width: number;
      height: number;
    }[] = [];
  for (let x = Math.floor(x0 / parent); x <= Math.floor(x1 / parent); x++)
    for (let y = Math.floor(y0 / parent); y <= Math.floor(y1 / parent); y++)
      cells.push({
        x,
        y,
        left: ((x * parent - x0) / columns) * width,
        top: ((y * parent - y0) / rows) * height,
        width: (parent / columns) * width,
        height: (parent / rows) * height,
      });
  return { zoom, width, height, cells };
}
export async function imageryBlob(
  image: TrackModel3D["imagery"],
  signal: AbortSignal,
): Promise<Blob> {
  if (!image.tiles) {
    const response = await fetch(image.url, { signal });
    if (!response.ok) throw new Error("Imagery unavailable");
    return response.blob();
  }
  const gsi = image.tiles.provider === "gsi-seamless-photo",
    key = gsi ? undefined : import.meta.env.VITE_MAPTILER_API_KEY?.trim();
  if (!gsi && !key) throw new Error("Satellite imagery key is not configured");
  const plan = displayTilePlan(image.tiles),
    canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext("2d")!;
  let cursor = 0;
  await Promise.all(
    [0, 1, 2, 3].map(async () => {
      while (cursor < plan.cells.length) {
        const cell = plan.cells[cursor++],
          response = await fetch(
            gsi
              ? `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${plan.zoom}/${cell.x}/${cell.y}.jpg`
              : `https://api.maptiler.com/maps/satellite-v4/${plan.zoom}/${cell.x}/${cell.y}.jpg?key=${encodeURIComponent(key!)}`,
            { signal },
          );
        if (!response.ok) throw new Error("Satellite imagery unavailable");
        const bitmap = await createImageBitmap(await response.blob());
        try {
          context.drawImage(
            bitmap,
            cell.left,
            cell.top,
            cell.width,
            cell.height,
          );
        } finally {
          bitmap.close();
        }
      }
    }),
  );
  if (signal.aborted) throw new Error("Imagery cancelled");
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not assemble satellite imagery")),
      "image/png",
    ),
  );
}
