import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import type { GradeSeparation } from "../schemas/grade-separation";
import type { Position } from "../src/geo";

/** GSI's signed 24-bit centimetre encoding; 0x800000 and transparent pixels are missing. */
export function decodeGsiHeight(r: number, g: number, b: number, alpha = 255) {
  const value = 65536 * r + 256 * g + b;
  return alpha < 128 || value === 2 ** 23
    ? null
    : (value > 2 ** 23 ? value - 2 ** 24 : value) * 0.01;
}

/** Four pixel centres, including neighbouring XYZ tiles. Missing data never becomes zero. */
export async function bilinearGsiHeight(
  pixelX: number,
  pixelY: number,
  pixel: (x: number, y: number) => Promise<number | null>,
) {
  const x = pixelX - 0.5,
    y = pixelY - 0.5,
    a = Math.floor(x),
    b = Math.floor(y),
    u = x - a,
    v = y - b;
  let height = 0;
  for (const [dx, dy, weight] of [
    [0, 0, (1 - u) * (1 - v)],
    [1, 0, u * (1 - v)],
    [0, 1, (1 - u) * v],
    [1, 1, u * v],
  ]) {
    if (weight < 1e-12) continue;
    const value = await pixel(a + dx, b + dy);
    if (value === null)
      throw new Error("GSI DEM5A has missing coverage on this road");
    height += value * weight;
  }
  return height;
}

export async function createBridgeElevation(
  midline: Position[],
  crossings: GradeSeparation["crossings"],
  cache: string,
): Promise<GradeSeparation["elevation"]> {
  const zoom = 15 as const,
    world = 2 ** zoom * 256,
    decoded = new Map<string, PNG>(),
    tiles = new Map<string, GradeSeparation["elevation"]["tiles"][number]>();
  await mkdir(cache, { recursive: true });
  const pixel = async (x: number, y: number) => {
    const tx = Math.floor(x / 256),
      ty = Math.floor(y / 256),
      key = `${tx}-${ty}`;
    if (!decoded.has(key)) {
      const file = `${cache}/${key}.png`;
      let bytes: Buffer;
      try {
        bytes = await readFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const url = `https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/${zoom}/${tx}/${ty}.png`,
          response = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok)
          throw new Error(`GSI DEM5A acquisition failed: ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
        await writeFile(file, bytes);
      }
      const image = PNG.sync.read(bytes);
      if (image.width !== 256 || image.height !== 256)
        throw new Error("Invalid GSI tile dimensions");
      if (decoded.size >= 8) decoded.delete(decoded.keys().next().value!);
      decoded.set(key, image);
      tiles.set(key, {
        zoom,
        x: tx,
        y: ty,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    const image = decoded.get(key)!,
      k = ((((y % 256) + 256) % 256) * 256 + (((x % 256) + 256) % 256)) * 4;
    return decodeGsiHeight(
      image.data[k],
      image.data[k + 1],
      image.data[k + 2],
      image.data[k + 3],
    );
  };
  const samples: [number, number][] = [];
  for (let i = 0; i < midline.length - 1; i++) {
    const [lon, lat] = midline[i],
      x = (lon / 360 + 0.5) * world,
      y =
        (0.5 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / (2 * Math.PI)) *
        world;
    samples.push([
      i,
      Number((await bilinearGsiHeight(x, y, pixel)).toFixed(3)),
    ]);
  }
  samples.push([midline.length - 1, samples[0][1]]);
  for (const c of crossings) {
    const [a, b] = c.upper;
    for (let i = a + 1; i < b; i++)
      samples[i][1] =
        samples[a][1] + ((samples[b][1] - samples[a][1]) * (i - a)) / (b - a);
  }
  // Linear compression pins every bridge endpoint and never inserts terrain underneath a deck.
  const keep = new Set([
      0,
      samples.length - 1,
      ...crossings.flatMap((c) => c.upper),
    ]),
    toleranceM = 0.25;
  const simplify = (start: number, end: number) => {
    let worst = toleranceM,
      index = -1;
    for (let i = start + 1; i < end; i++) {
      const t = (i - start) / (end - start),
        error = Math.abs(
          samples[i][1] - (samples[start][1] * (1 - t) + samples[end][1] * t),
        );
      if (error > worst) {
        worst = error;
        index = i;
      }
    }
    if (index >= 0) {
      keep.add(index);
      simplify(start, index);
      simplify(index, end);
    }
  };
  const pinned = [...keep].sort((a, b) => a - b);
  for (let i = 1; i < pinned.length; i++) simplify(pinned[i - 1], pinned[i]);
  return {
    source: "GSI DEM5A",
    url: "https://maps.gsi.go.jp/development/ichiran.html#dem",
    attribution: "Geospatial Information Authority of Japan (GSI)",
    reuseEvidenceUrl:
      "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html",
    sampling: "bilinear-pixel-centres",
    toleranceM,
    tiles: [...tiles.values()].sort((a, b) => a.x - b.x || a.y - b.y),
    anchors: [...keep].sort((a, b) => a - b).map((i) => samples[i]),
    note: "Edited from GSI elevation tiles: bilinear ground elevations along paired road stations, compressed within 0.25 m of those samples. Each bridge deck is linearly interpolated only between its sampled approach endpoints; ground samples under the bridge are excluded from that deck. Road levels and clearance are estimates, not a road or bridge survey. No capture date is supplied by these tile responses.",
  };
}
