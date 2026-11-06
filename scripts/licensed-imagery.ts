import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { geometryPaths, type Layout } from "../schemas/data";
import {
  borderInferenceSchema,
  type BorderInference,
} from "../schemas/border-inference";
import { decodeRaster } from "./infer-image-borders";

const WORLD = 2 * Math.PI * 6378137,
  SIZE = 512;
const sha = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const xy = (p: number[]) => [
  (p[0] / 360 + 0.5) * WORLD,
  (0.5 - Math.asinh(Math.tan((p[1] * Math.PI) / 180)) / (2 * Math.PI)) * WORLD,
];
export class ImageryQuotaError extends Error {
  constructor(public retryAt: string) {
    super(`Licensed imagery request quota reached; retry after ${retryAt}`);
  }
}

/** Only enable after the operator confirms a separate extraction/redistribution agreement. */
export function licensedImagery(
  key: string,
  timeoutMs = 25000,
  root = ".local/border-inference/maptiler",
) {
  if (!key)
    throw new Error(
      "Licensed satellite acquisition needs the configured MapTiler key",
    );
  const pending = new Map<string, Promise<Buffer>>();
  const cooldownFile = `${root}/quota-${sha(key).slice(0, 12)}.json`;
  const cooldown = readFile(cooldownFile, "utf8")
    .then((v) => JSON.parse(v).retryAt as string)
    .catch((e) => {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      return "";
    });
  let retryAt = "";
  let attribution: Promise<string> | undefined;
  async function request(path: string) {
    retryAt ||= await cooldown;
    if (Date.parse(retryAt) > Date.now()) throw new ImageryQuotaError(retryAt);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(
          `https://api.maptiler.com/${path}?key=${encodeURIComponent(key)}`,
          {
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
        if (response.status === 429) {
          const value = response.headers.get("retry-after") ?? "60";
          retryAt = new Date(
            /^\d+$/.test(value)
              ? Date.now() + Number(value) * 1000
              : Math.max(Date.now() + 1000, Date.parse(value) || 0),
          ).toISOString();
          await writeFile(cooldownFile, JSON.stringify({ retryAt }));
          throw new ImageryQuotaError(retryAt);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
      } catch (error) {
        if (error instanceof ImageryQuotaError) throw error;
        if (attempt) {
          // Fetch errors can contain request URLs. Never report a credential-bearing URL.
          const status =
            error instanceof Error && /^HTTP \d+$/.test(error.message)
              ? error.message
              : "network/timeout";
          throw new Error(`Licensed imagery acquisition failed: ${status}`);
        }
      }
    }
    throw new Error("Licensed imagery acquisition failed");
  }
  async function tile(z: number, x: number, y: number) {
    const name = `${z}-${x}-${y}`;
    if (!pending.has(name))
      pending.set(
        name,
        (async () => {
          const file = `${root}/${name}.jpg`;
          try {
            return await readFile(file);
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          }
          const bytes = await request(`maps/satellite-v4/${z}/${x}/${y}.jpg`);
          const decoded = jpeg.decode(bytes, { useTArray: true });
          if (decoded.width !== SIZE || decoded.height !== SIZE)
            throw new Error("Unexpected satellite tile dimensions");
          await writeFile(file, bytes);
          return bytes;
        })().finally(() => pending.delete(name)),
      );
    return pending.get(name)!;
  }
  return async (layout: Pick<Layout, "bbox" | "features">) => {
    await mkdir(root, { recursive: true });
    const paths = layout.features
        .filter((f) => f.properties.role === "trace")
        .flatMap((f) => geometryPaths(f.geometry)),
      points = paths.flat().map(xy),
      latitude = (layout.bbox[1] + layout.bbox[3]) / 2,
      cosine = Math.cos((latitude * Math.PI) / 180),
      pad = 80 / cosine;
    let zoom = Math.ceil(Math.log2((WORLD * cosine) / (SIZE * 0.75)));
    const extent = [
      Math.min(...points.map((p) => p[0])) - pad,
      Math.min(...points.map((p) => p[1])) - pad,
      Math.max(...points.map((p) => p[0])) + pad,
      Math.max(...points.map((p) => p[1])) + pad,
    ];
    let span: number,
      bounds: [number, number, number, number],
      width: number,
      height: number;
    do {
      span = WORLD / 2 ** zoom;
      bounds = [
        Math.floor(extent[0] / span),
        Math.floor(extent[1] / span),
        Math.floor(extent[2] / span),
        Math.floor(extent[3] / span),
      ];
      width = (bounds[2] - bounds[0] + 1) * SIZE;
      height = (bounds[3] - bounds[1] + 1) * SIZE;
      if (width * height <= 64_000_000) break;
      zoom--;
    } while (zoom > 0);
    if ((span! / SIZE) * cosine > 1.5)
      throw new Error(
        "Track extent needs a segmented high-resolution imagery pass",
      );
    const cache = `${root}/mosaic-${sha(JSON.stringify({ zoom, bounds, paths })).slice(0, 24)}`;
    try {
      const info = JSON.parse(
          await readFile(cache + ".json", "utf8"),
        ) as BorderInference["imagery"],
        bytes = await readFile(cache + ".png");
      borderInferenceSchema.shape.imagery.parse(info);
      if (sha(bytes) !== info.sha256)
        throw new Error("Cached satellite mosaic hash mismatch");
      return { image: decodeRaster(bytes, info.extent3857), info };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const credit = await (attribution ??= (async () => {
      // Reuse attribution from a validated cached mosaic before making a metadata request.
      for (const name of await readdir(root))
        if (name.startsWith("mosaic-") && name.endsWith(".json")) {
          const info = borderInferenceSchema.shape.imagery.parse(
            JSON.parse(await readFile(`${root}/${name}`, "utf8")),
          );
          if (info.tiles?.provider === "maptiler-satellite-v4")
            return info.attribution;
        }
      const bytes = await request("maps/satellite-v4/tiles.json"),
        json = JSON.parse(bytes.toString());
      return String(json.attribution || "© MapTiler")
        .replace(/<[^>]+>/g, "")
        .replace(/&copy;/g, "©")
        .replace(/&amp;/g, "&");
    })().catch((error) => {
      attribution = undefined;
      throw error;
    }));
    // Request only tiles touched by the road search corridor, with transparent cells elsewhere.
    const needed = new Set<string>();
    for (const path of paths)
      for (let i = 1; i < path.length; i++) {
        const a = xy(path[i - 1]),
          b = xy(path[i]),
          count = Math.max(
            1,
            Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (50 / cosine)),
          );
        for (let j = 0; j <= count; j++) {
          const x = a[0] + ((b[0] - a[0]) * j) / count,
            y = a[1] + ((b[1] - a[1]) * j) / count;
          for (
            let tx = Math.floor((x - pad) / span!);
            tx <= Math.floor((x + pad) / span!);
            tx++
          )
            for (
              let ty = Math.floor((y - pad) / span!);
              ty <= Math.floor((y + pad) / span!);
              ty++
            )
              if (
                tx >= bounds![0] &&
                tx <= bounds![2] &&
                ty >= bounds![1] &&
                ty <= bounds![3]
              )
                needed.add(`${tx},${ty}`);
        }
      }
    const png = new PNG({ width: width!, height: height! }),
      cells = [...needed].sort();
    let cursor = 0;
    await Promise.all(
      [0, 1, 2].map(async () => {
        while (cursor < cells.length) {
          const [x, y] = cells[cursor++].split(",").map(Number),
            bytes = await tile(zoom, x, y),
            decoded = jpeg.decode(bytes, { useTArray: true });
          const dx = (x - bounds![0]) * SIZE,
            dy = (y - bounds![1]) * SIZE;
          for (let row = 0; row < SIZE; row++)
            png.data.set(
              decoded.data.subarray(row * SIZE * 4, (row + 1) * SIZE * 4),
              ((dy + row) * width! + dx) * 4,
            );
        }
      }),
    );
    const bytes = PNG.sync.write(png),
      info: BorderInference["imagery"] = {
        sourceId: "maptiler-licensed-border-imagery",
        url: "https://api.maptiler.com/maps/satellite-v4/tiles.json",
        license: "LicenseRef-MapTiler-Derived-Borders",
        rightsBasis: "source-specific-agreement",
        termsUrl: "https://www.maptiler.com/copyright/",
        tiles: { provider: "maptiler-satellite-v4", zoom, bounds: bounds! },
        attribution: credit,
        retrievedAt: new Date().toISOString(),
        sha256: sha(bytes),
        width: width!,
        height: height!,
        extent3857: [
          bounds![0] * span! - WORLD / 2,
          WORLD / 2 - (bounds![3] + 1) * span!,
          (bounds![2] + 1) * span! - WORLD / 2,
          WORLD / 2 - bounds![1] * span!,
        ],
        groundPixelSizeM: Number(((span! / SIZE) * cosine).toFixed(4)),
      };
    await writeFile(cache + ".png", bytes);
    await writeFile(cache + ".json", JSON.stringify(info, null, 2));
    return {
      image: {
        width: width!,
        height: height!,
        data: png.data,
        extent: info.extent3857,
      },
      info,
    };
  };
}
