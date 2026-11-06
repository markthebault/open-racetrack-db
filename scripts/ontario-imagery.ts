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

const projects = z.enum(["SWOOP2020", "SCOOP2023", "DRAPE2024", "SWOOP2025"]);
const serviceFor = (project: z.infer<typeof projects>) =>
  `https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/AerialImagery/GEO_Imagery_Data_Service_${project === "SWOOP2020" ? "2018to2022" : "2023to2027"}/ImageServer`;
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));

/** Acquire one explicitly selected, openly licensed Ontario orthophoto collection. Never substitute another project. */
export async function ontarioImagery(
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
    west < -95.3 ||
    east > -74.2 ||
    south < 41.5 ||
    north > 57
  )
    throw new Error(
      "Ontario imagery requires a bounded route within Ontario's region",
    );
  const root = options.root ?? ".local/border-inference/ontario",
    fetcher = options.fetcher ?? fetch;
  const cosine = Math.cos(((south + north) * Math.PI) / 360),
    mercator = (lon: number, lat: number) => [
      (6378137 * lon * Math.PI) / 180,
      6378137 * Math.asinh(Math.tan((lat * Math.PI) / 180)),
    ];
  const a = mercator(west, south),
    b = mercator(east, north),
    pad = 60 / cosine;
  const bbox = [a[0] - pad, a[1] - pad, b[0] + pad, b[1] + pad];
  const widthM = (bbox[2] - bbox[0]) * cosine,
    heightM = (bbox[3] - bbox[1]) * cosine;
  const pixelM = Math.max(
    0.2,
    widthM / 8192,
    heightM / 8192,
    Math.sqrt((widthM * heightM) / 24_000_000),
  );
  if (pixelM > 1.5)
    throw new Error(
      "Ontario imagery extent is too large for road-edge extraction",
    );
  const size = [Math.ceil(widthM / pixelM), Math.ceil(heightM / pixelM)];
  const request = new URL(serviceFor(project) + "/exportImage");
  request.search = new URLSearchParams({
    f: "json",
    bbox: bbox.join(","),
    bboxSR: "3857",
    imageSR: "3857",
    size: size.join(","),
    format: "png",
    mosaicRule: JSON.stringify({
      mosaicMethod: "esriMosaicAttribute",
      where: `Project='${project}'`,
      sortField: "LowPS",
      sortValue: 0,
      ascending: true,
    }),
  }).toString();
  const base = resolve(root, hash(request.href)),
    cachedImage = base + ".json";
  await mkdir(root, { recursive: true });
  try {
    const info = borderInferenceSchema.shape.imagery.parse(
        await json(cachedImage),
      ),
      bytes = await readFile(base + ".png");
    if (info.url !== request.href || hash(bytes) !== info.sha256)
      throw new Error(
        "Ontario cached evidence does not match its pinned request or image hash",
      );
    const image = decodeRaster(bytes, info.extent3857);
    if (image.width !== info.width || image.height !== info.height)
      throw new Error("Ontario cached image dimensions changed");
    return { image, info, cachedImage };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const get = async (url: string) => {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 120000),
      headers: {
        "accept-encoding": "identity",
        connection: "close",
        "user-agent": "OpenRacetrackDB imagery acquisition",
      },
    });
    if (!response.ok)
      throw new Error(`Ontario imagery HTTP ${response.status}`);
    return response;
  };
  const exported = await (await get(request.href)).json();
  if (exported.error || !exported.href || !exported.extent)
    throw new Error(
      "Ontario imagery export did not return an image; no collection fallback was used",
    );
  const href = new URL(exported.href);
  if (href.protocol !== "https:" || href.host !== request.host)
    throw new Error("Ontario imagery returned an unexpected download host");
  const extent = exported.extent,
    sr = extent.spatialReference?.latestWkid ?? extent.spatialReference?.wkid;
  const actual: [number, number, number, number] = [
    extent.xmin,
    extent.ymin,
    extent.xmax,
    extent.ymax,
  ];
  if (
    ![3857, 102100].includes(sr) ||
    !actual.every(Number.isFinite) ||
    actual[0] >= actual[2] ||
    actual[1] >= actual[3] ||
    actual[0] > bbox[0] + 0.01 ||
    actual[1] > bbox[1] + 0.01 ||
    actual[2] < bbox[2] - 0.01 ||
    actual[3] < bbox[3] - 0.01
  )
    throw new Error(
      "Ontario export does not cover the requested georeferenced extent",
    );
  const bytes = Buffer.from(await (await get(href.href)).arrayBuffer()),
    image = decodeRaster(bytes, actual);
  if (
    image.width !== exported.width ||
    image.height !== exported.height ||
    image.width !== size[0] ||
    image.height !== size[1]
  )
    throw new Error("Ontario export dimensions differ from its request");
  const info = borderInferenceSchema.shape.imagery.parse({
    sourceId: `ontario-${project.toLowerCase()}-border-imagery`,
    url: request.href,
    reuseEvidenceUrl: "https://data.ontario.ca/en/dataset/open-ontario-imagery",
    termsUrl: "https://www.ontario.ca/page/open-government-licence-ontario",
    license: "OGL-ON-1.0",
    attribution: `Contains information licensed under the Open Government Licence – Ontario. Geospatial Ontario ${project} orthophotography.`,
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
      "Use --track <id> --layout <id> --project SWOOP2020|SCOOP2023|DRAPE2024|SWOOP2025",
    );
  const index = indexSchema.parse(await json("data/index.json")),
    entry = index.tracks.find((t) => t.id === trackId);
  if (!entry) throw new Error("Unknown track");
  const track = validateTrack(await json("data/" + entry.file)),
    item = track.layouts.find((l) => l.id === layoutId);
  if (track.country.code !== "CA" || !item?.file)
    throw new Error("Select a mapped Canadian layout");
  const layout = validateLayout(
      await json("data/" + dirname(entry.file) + "/" + item.file),
      track,
      item.id,
    ),
    result = await ontarioImagery(layout, { project });
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
