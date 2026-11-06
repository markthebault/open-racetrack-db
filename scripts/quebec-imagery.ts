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

const projects = z.enum(["IEQM2025", "IEQM2024", "CHAUDIERE2020"]);
const layerFor = (project: z.infer<typeof projects>) =>
  project === "CHAUDIERE2020"
    ? "Orthomosaique_2020_2020_Partenariat_Chaudiere-Appalaches_15cm_RVB"
    : `Orthomosaique_${project.slice(-4)}_${project.slice(-4)}_Inv_Ecofor_20cm_RVB`;
const service =
  "https://servicesmatriciels.mern.gouv.qc.ca/erdas-iws/ogc/wms/Imagerie";
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));

/** Acquire one explicitly selected, openly licensed Québec orthophoto collection. Never substitute another project. */
export async function quebecImagery(
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
    west < -80 ||
    east > -57 ||
    south < 44.9 ||
    north > 63
  )
    throw new Error(
      "Québec imagery requires a bounded route within Québec's region",
    );
  const root = options.root ?? ".local/border-inference/quebec",
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
    project === "CHAUDIERE2020" ? 0.15 : 0.2,
    widthM / 4000,
    heightM / 4000,
    Math.sqrt((widthM * heightM) / 16_000_000),
  );
  if (pixelM > 1.5)
    throw new Error(
      "Québec imagery extent is too large for road-edge extraction",
    );
  const size = [
    Math.min(4000, Math.ceil(widthM / pixelM)),
    Math.min(4000, Math.ceil(heightM / pixelM)),
  ];
  const request = new URL(service);
  request.search = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layerFor(project),
    STYLES: "default",
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
        "Québec cached evidence does not match its georeferenced request or image hash",
      );
    const image = decodeRaster(bytes, info.extent3857);
    if (image.width !== info.width || image.height !== info.height)
      throw new Error("Québec cached image dimensions changed");
    return { image, info, cachedImage };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const response = await fetcher(request.href, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 120000),
    headers: { "user-agent": "OpenRacetrackDB imagery acquisition" },
  });
  if (!response.ok) throw new Error(`Québec imagery HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()),
    image = decodeRaster(bytes, bbox);
  if (image.width !== size[0] || image.height !== size[1])
    throw new Error(
      "Québec export dimensions differ from its request; no collection fallback was used",
    );
  if (!image.data?.some((value, i) => i % 4 === 3 && value >= 128))
    throw new Error(
      "Québec collection has no image coverage in the requested extent; no fallback was used",
    );
  const actual = bbox;
  const info = borderInferenceSchema.shape.imagery.parse({
    sourceId: `quebec-${project.toLowerCase()}-border-imagery`,
    url: request.href,
    reuseEvidenceUrl:
      "https://www.donneesquebec.ca/recherche/dataset/imagerie-orthorectifiee-du-quebec",
    termsUrl: "https://www.donneesquebec.ca/licence",
    license: "CC-BY-4.0",
    attribution: `© Gouvernement du Québec — ${project} orthophotography, CC BY 4.0. Modifications: estimated road borders.`,
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
      "Use --track <id> --layout <id> --project IEQM2025|IEQM2024|CHAUDIERE2020",
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
    result = await quebecImagery(layout, { project });
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
