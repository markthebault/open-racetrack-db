import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { borderInferenceSchema } from "../schemas/border-inference";
import {
  indexSchema,
  validateTrack,
  validateLayout,
  type Layout,
} from "../schemas/data";
import { decodeRaster } from "./infer-image-borders";

const projects = z.enum([
  "current",
  "2008",
  "2009",
  "2010",
  "2011",
  "2012",
  "2013",
  "2014",
  "2015",
  "2016",
  "2017",
  "2018",
  "2019",
  "2020",
  "2021",
  "2022",
  "2023",
  "2024",
]);
const layerFor = (project: z.infer<typeof projects>) =>
  project === "current" ? "ni_dop20" : `ni_dop20h_rgb_${project}`;
const serviceFor = (project: z.infer<typeof projects>) =>
  "https://opendata.lgln.niedersachsen.de/doorman/noauth/" +
  (project === "current" ? "dop_wms" : "doph_wms");
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));

/** Acquire one explicitly selected LGLN DOP20 collection; no historical-year fallback. Never substitute another project. */
export async function niedersachsenImagery(
  layout: Pick<Layout, "bbox">,
  options: {
    project: z.infer<typeof projects>;
    root?: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  },
) {
  const project = projects.parse(options.project),
    [west, south, east, north] = layout.bbox;
  if (
    ![west, south, east, north].every(Number.isFinite) ||
    west >= east ||
    south >= north ||
    west < 6.5 ||
    east > 11.7 ||
    south < 51.3 ||
    north > 54.1
  )
    throw new Error(
      "Niedersachsen imagery requires a bounded route within Niedersachsen's region",
    );
  const root = options.root ?? ".local/border-inference/niedersachsen",
    fetcher = options.fetcher ?? fetch;
  const cosine = Math.cos(((south + north) * Math.PI) / 360),
    mercator = (lon: number, lat: number) => [
      (6378137 * lon * Math.PI) / 180,
      6378137 * Math.asinh(Math.tan((lat * Math.PI) / 180)),
    ];
  const a = mercator(west, south),
    b = mercator(east, north),
    pad = 60 / cosine;
  const bbox: [number, number, number, number] = [
    a[0] - pad,
    a[1] - pad,
    b[0] + pad,
    b[1] + pad,
  ];
  const widthM = (bbox[2] - bbox[0]) * cosine,
    heightM = (bbox[3] - bbox[1]) * cosine;
  const pixelM = Math.max(
    0.2,
    widthM / 6000,
    heightM / 6000,
    Math.sqrt((widthM * heightM) / 36_000_000),
  );
  if (pixelM > 1.5)
    throw new Error(
      "Niedersachsen imagery extent is too large for road-edge extraction",
    );
  const size = [
    Math.min(6000, Math.ceil(widthM / pixelM)),
    Math.min(6000, Math.ceil(heightM / pixelM)),
  ];
  const request = new URL(serviceFor(project));
  request.search = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layerFor(project),
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: bbox.join(","),
    WIDTH: String(size[0]),
    HEIGHT: String(size[1]),
    FORMAT: "image/png",
    TRANSPARENT: "TRUE",
  }).toString();
  const base = resolve(root, hash(request.href)),
    cachedImage = base + ".json";
  await mkdir(root, { recursive: true });
  try {
    const info = borderInferenceSchema.shape.imagery.parse(
        await json(cachedImage),
      ),
      bytes = await readFile(base + ".png");
    if (
      info.url !== request.href ||
      hash(bytes) !== info.sha256 ||
      info.width !== size[0] ||
      info.height !== size[1] ||
      info.extent3857.some((value, i) => value !== bbox[i])
    )
      throw new Error(
        "Niedersachsen cached evidence does not match its georeferenced request or image hash",
      );
    const image = decodeRaster(bytes, info.extent3857);
    if (image.width !== info.width || image.height !== info.height)
      throw new Error("Niedersachsen cached image dimensions changed");
    return { image, info, cachedImage };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const response = await fetcher(request.href, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 120000),
    headers: { "user-agent": "OpenRacetrackDB imagery acquisition" },
  });
  if (!response.ok) throw new Error(`Niedersachsen imagery HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()),
    image = decodeRaster(bytes, bbox);
  if (image.width !== size[0] || image.height !== size[1])
    throw new Error(
      "Niedersachsen export dimensions differ from its request; no collection fallback was used",
    );
  const pixels = image.data,
    firstAlpha = pixels?.findIndex((value, i) => i % 4 === 3 && value >= 128) ?? -1;
  if (
    !pixels ||
    firstAlpha < 0 ||
    !pixels.some(
      (value, i) =>
        i % 4 !== 3 &&
        pixels[i - (i % 4) + 3] >= 128 &&
        Math.abs(value - pixels[firstAlpha - 3 + (i % 4)]) > 3,
    )
  )
    throw new Error(
      "Niedersachsen collection has no contrasting image coverage in the requested extent; no fallback was used",
    );
  const actual = bbox;
  const info = borderInferenceSchema.shape.imagery.parse({
    sourceId: `lgln-ni-dop20-${project}-border-imagery`,
    url: request.href,
    reuseEvidenceUrl:
      serviceFor(project) + "?SERVICE=WMS&REQUEST=GetCapabilities",
    termsUrl: "https://creativecommons.org/licenses/by/4.0/",
    license: "CC-BY-4.0",
    attribution: `LGLN (${new Date().getUTCFullYear()}), CC BY 4.0. DOP20 ${project}. Modifications: estimated road borders.`,
    retrievedAt: new Date().toISOString(),
    sha256: hash(bytes),
    width: image.width,
    height: image.height,
    extent3857: actual,
    groundPixelSizeM: Number(
      (
        Math.max(
          (actual[2] - actual[0]) / image.width,
          (actual[3] - actual[1]) / image.height,
        ) * cosine
      ).toFixed(4),
    ),
  });
  await writeFile(base + ".png", bytes);
  await writeFile(cachedImage, JSON.stringify(info, null, 2) + "\n");
  return { image, info, cachedImage };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2),
    option = (name: string) => {
      const i = args.indexOf(name);
      return i < 0 ? undefined : args[i + 1];
    };
  const trackId = option("--track"),
    layoutId = option("--layout"),
    project = projects.parse(option("--project"));
  if (!trackId || !layoutId)
    throw new Error(
      "Use --track <id> --layout <id> --project current|2008..2024",
    );
  const index = indexSchema.parse(await json("data/index.json")),
    entry = index.tracks.find((t) => t.id === trackId);
  if (!entry) throw new Error("Unknown track");
  const track = validateTrack(await json("data/" + entry.file)),
    item = track.layouts.find((l) => l.id === layoutId);
  if (track.country.code !== "DE" || !item?.file)
    throw new Error("Select a mapped German layout");
  const layout = validateLayout(
      await json("data/" + dirname(entry.file) + "/" + item.file),
      track,
      item.id,
    ),
    result = await niedersachsenImagery(layout, { project });
  console.log(
    JSON.stringify({
      cachedImage: result.cachedImage,
      sha256: result.info.sha256,
      pixelM: result.info.groundPixelSizeM,
      width: result.info.width,
      height: result.info.height,
    }),
  );
}
