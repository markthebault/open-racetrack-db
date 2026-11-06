import { readFile, writeFile, mkdir, rename, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import {
  indexSchema,
  validateTrack,
  validateLayout,
  geometryPaths,
  type Layout,
  type Track,
} from "../schemas/data";
import {
  borderInferenceSchema,
  type BorderInference,
} from "../schemas/border-inference";
import { bounds, type Position } from "../src/geo";
import {
  inferImageBorders,
  decodeRaster,
  type Raster,
} from "./infer-image-borders";
import { serializeLayout } from "./layout-borders";
const args = process.argv.slice(2),
  option = (s: string) => {
    const i = args.indexOf(s);
    return i < 0 ? undefined : args[i + 1];
  },
  write = args.includes("--write"),
  check = args.includes("--check");
if (check && write) throw new Error("--check cannot be combined with --write");
if (!args.includes("--all") && !option("--track"))
  throw new Error(
    "Use --all or --track <id>; --write saves supported estimated borders in each existing GeoJSON.",
  );
const read = async (p: string) => JSON.parse(await readFile(p, "utf8")),
  sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const root = ".local/border-inference";
await mkdir(root, { recursive: true });
const catalogue = indexSchema.parse(await read("data/index.json"));
type ImageInfo = BorderInference["imagery"];
type Acquired = { image: Raster; info: ImageInfo };
const imagery = new Map<string, Promise<Acquired>>();
const providers = {
  US: {
    id: "usgs-naip-border-imagery",
    url: "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer",
    rights:
      "https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip",
    license: "public-domain" as const,
    credit: "USGS, USDA, The National Map: NAIP orthoimagery",
  },
  FR: {
    id: "ign-bd-ortho-border-imagery",
    url: "https://data.geopf.fr/wms-r",
    rights: "https://www.data.gouv.fr/datasets/bd-ortho-r",
    license: "Etalab-2.0" as const,
    credit: "IGN BD ORTHO, Licence Ouverte 2.0",
  },
  ES: {
    id: "ign-pnoa-border-imagery",
    url: "https://www.ign.es/wms-inspire/pnoa-ma",
    rights:
      "https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN_eng.pdf",
    license: "CC-BY-4.0" as const,
    credit: "Obra derivada de PNOA maxima actualidad, CC-BY 4.0, IGN / scne.es",
  },
};
async function fetchBytes(url: string) {
  let failure = "";
  for (let i = 0; i < 2; i++)
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(
          Math.min(60000, Number(option("--timeout-ms") ?? 25000)),
        ),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
  throw new Error(`Imagery acquisition failed: ${failure}`);
}
async function acquire(track: Track, layout: Layout): Promise<Acquired> {
  const country = track.country.code as keyof typeof providers,
    provider = providers[country];
  // Prefer pinned, reusable high-resolution sources at this venue before requesting new imagery.
  if (!provider) {
    for (const name of await readdir(`sources/${track.id}`))
      if (name.endsWith(".json")) {
        const p = `sources/${track.id}/${name}`,
          d = await read(p);
        if (
          d?.sourceKind !== "georeferenced-imagery" ||
          !d.imageryFile ||
          !d.extent ||
          ![
            "public-domain",
            "OGL-3.0",
            "DL-DE-BY-2.0",
            "CC-BY-4.0",
            "LicenseRef-GUGiK-open-data",
          ].includes(d.license)
        )
          continue;
        const bytes = await readFile(`sources/${track.id}/${d.imageryFile}`);
        if (sha(bytes) !== d.imagerySha256)
          throw new Error("Pinned raster hash mismatch");
        const e = d.extent,
          image = decodeRaster(bytes, [e.xmin, e.ymin, e.xmax, e.ymax]),
          latitude = (layout.bbox[1] + layout.bbox[3]) / 2,
          c = Math.cos((latitude * Math.PI) / 180),
          groundPixelSizeM =
            Math.max(
              (e.xmax - e.xmin) / image.width,
              (e.ymax - e.ymin) / image.height,
            ) * c;
        if (groundPixelSizeM > 1.5) continue;
        return {
          image,
          info: {
            sourceId: `pinned-border-${sha(bytes).slice(0, 12)}`,
            url: d.sourceUrl,
            reuseEvidenceUrl: d.reuseEvidenceUrl,
            license: d.license,
            attribution: d.attribution,
            retrievedAt: d.retrievedAt,
            sha256: sha(bytes),
            width: image.width,
            height: image.height,
            extent3857: image.extent,
            groundPixelSizeM,
          },
        };
      }
    throw new Error(
      "No registered high-resolution imagery source with documented reusable terms",
    );
  }
  const R = 6378137,
    xy = (p: Position): Position => [
      (R * p[0] * Math.PI) / 180,
      R * Math.asinh(Math.tan((p[1] * Math.PI) / 180)),
    ],
    b = layout.bbox,
    c = Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180),
    a = xy([b[0], b[1]]),
    z = xy([b[2], b[3]]),
    pad = 65 / c;
  const extent: [number, number, number, number] = [
    a[0] - pad,
    a[1] - pad,
    z[0] + pad,
    z[1] + pad,
  ];
  let width = Math.ceil(((extent[2] - extent[0]) * c) / 0.75),
    height = Math.ceil(((extent[3] - extent[1]) * c) / 0.75);
  if (Math.max(width, height) > 3500) {
    const scale = 3500 / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const resolution =
    Math.max(
      (extent[2] - extent[0]) / width,
      (extent[3] - extent[1]) / height,
    ) * c;
  if (resolution > 1.5)
    throw new Error(
      "Venue extent exceeds the supported high-resolution export; needs tiled imagery",
    );
  const request = new URL(
    country === "US" ? provider.url + "/exportImage" : provider.url,
  );
  const params =
    country === "US"
      ? {
          bbox: extent.join(","),
          bboxSR: "3857",
          imageSR: "3857",
          size: `${width},${height}`,
          format: "png",
          f: "json",
          renderingRule: JSON.stringify({ rasterFunction: "NaturalColor" }),
        }
      : {
          SERVICE: "WMS",
          VERSION: "1.3.0",
          REQUEST: "GetMap",
          LAYERS:
            country === "ES"
              ? "OI.OrthoimageCoverage"
              : "ORTHOIMAGERY.ORTHOPHOTOS",
          STYLES: "",
          FORMAT: "image/png",
          CRS: "EPSG:3857",
          BBOX: extent.join(","),
          WIDTH: String(width),
          HEIGHT: String(height),
        };
  for (const [k, v] of Object.entries(params)) request.searchParams.set(k, v);
  const key = sha(request.href),
    file = join(root, key + ".png"),
    metadata = join(root, key + ".json");
  let info: ImageInfo, bytes: Buffer;
  try {
    info = await read(metadata);
    bytes = await readFile(file);
    if (sha(bytes) !== info.sha256)
      throw new Error("Cached raster hash mismatch");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    let actual = extent;
    if (country === "US") {
      const response = JSON.parse((await fetchBytes(request.href)).toString());
      if (response.error || !response.href)
        throw new Error("NAIP export unavailable");
      bytes = await fetchBytes(response.href);
      actual = [
        response.extent.xmin,
        response.extent.ymin,
        response.extent.xmax,
        response.extent.ymax,
      ];
    } else bytes = await fetchBytes(request.href);
    const decoded = decodeRaster(bytes, actual);
    info = {
      sourceId: provider.id,
      url: request.href,
      reuseEvidenceUrl: provider.rights,
      license: provider.license,
      attribution: provider.credit,
      retrievedAt: new Date().toISOString(),
      sha256: sha(bytes),
      width: decoded.width,
      height: decoded.height,
      extent3857: actual,
      groundPixelSizeM: Number(
        (
          Math.max(
            (actual[2] - actual[0]) / decoded.width,
            (actual[3] - actual[1]) / decoded.height,
          ) * c
        ).toFixed(4),
      ),
    };
    if (info.groundPixelSizeM > 1.5)
      throw new Error("Export resolution is too coarse to infer road edges");
    await writeFile(file, bytes);
    await writeFile(metadata, JSON.stringify(info, null, 2));
  }
  return { image: decodeRaster(bytes!, info!.extent3857), info: info! };
}
type RecordRow = {
  trackId: string;
  layoutId: string;
  status: string;
  reason?: string;
  file?: string;
  [key: string]: unknown;
};
const report: RecordRow[] = [];
let saving = Promise.resolve();
function saveProgress() {
  const bytes =
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        records: [...report],
      },
      null,
      2,
    ) + "\n";
  saving = saving.then(async () => {
    await writeFile(join(root, "report.json.next"), bytes);
    await rename(join(root, "report.json.next"), join(root, "report.json"));
  });
  return saving;
}

async function processEntry(entry: (typeof catalogue.tracks)[number]) {
  if (option("--track") && entry.id !== option("--track")) return;
  const trackFile = `data/${entry.file}`,
    track = validateTrack(await read(trackFile));
  let changed = false;
  for (const item of track.layouts) {
    if (!item.file) {
      report.push({
        trackId: track.id,
        layoutId: item.id,
        status: "unmapped",
        reason: item.missingGeometryReason,
      });
      continue;
    }
    const file = `${dirname(trackFile)}/${item.file}`,
      layout = validateLayout(await read(file), track, item.id),
      old = layout.metadata.borderInference;
    if (!old && layout.features.some((f) => f.properties.role === "inner"))
      continue;
    const row: RecordRow = {
        trackId: track.id,
        layoutId: item.id,
        file,
        status: "pending",
      },
      trace = layout.features.find((f) => f.properties.role === "trace")!,
      inputHash = sha(JSON.stringify(trace.geometry));
    if (check) {
      if (old)
        report.push({
          ...row,
          status:
            old.traceSha256 === inputHash
              ? "current-estimate"
              : "stale-estimate",
        });
      continue;
    }
    if (
      old &&
      old.method === "rgb-cross-sections-v2" &&
      !args.includes("--refresh")
    ) {
      row.status =
        old.traceSha256 === inputHash ? "cached-estimate" : "stale-estimate";
      report.push(row);
      continue;
    }
    if (old) {
      layout.features = layout.features.filter(
        (f) => f.properties.role !== "inner" && f.properties.role !== "outer",
      );
      if (write && layout.metadata.model3d) {
        try {
          await writeFile(
            `data/elevation/${track.id}.json`,
            JSON.stringify(layout.metadata.model3d.terrain) + "\n",
            { flag: "wx" },
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
      delete layout.metadata.borderInference;
      delete layout.metadata.model3d;
      delete layout.metadata.licenseScope;
      layout.bbox = bounds(
        layout.features.flatMap((f) => geometryPaths(f.geometry).flat()),
      );
      if (write) {
        await writeFile(file + ".next", serializeLayout(layout));
        await rename(file + ".next", file);
      }
    }
    if (!layout.metadata.closed || layout.metadata.geometryKind === "network") {
      report.push({
        ...row,
        status: "needs-route-review",
        reason:
          "Open routes and branch networks need left/right edge semantics and a reviewed driving order.",
      });
      continue;
    }
    try {
      const key = track.id + ":" + JSON.stringify(layout.bbox);
      if (!imagery.has(key)) imagery.set(key, acquire(track, layout));
      const acquired = await imagery.get(key)!,
        result = inferImageBorders(
          geometryPaths(trace.geometry)[0],
          acquired.image,
        );
      const evidence = borderInferenceSchema.parse({
        schemaVersion: 1,
        method: "rgb-cross-sections-v2",
        status: "estimated",
        reviewedAt: null,
        traceSha256: inputHash,
        imagery: acquired.info,
        evidence: {
          strongEdgeFraction: result.evidence.map((e) => e.strong),
          medianInteriorDifference: result.evidence.map((e) => e.interior),
          samplingStepM: result.step,
          searchRangeM: [2, 25],
        },
        note: "Automatically inferred from RGB differences along cross-sections of the existing trace. Evidence scores are not calibrated positional confidence. Borders are estimates and have not been manually reviewed; shadows, trees, aprons, paint and imagery age can move the detected edge. Imagery resolution is not survey accuracy.",
      });
      const source = {
        id: evidence.imagery.sourceId,
        type: "imagery" as const,
        title: "Reusable aerial imagery for estimated road borders",
        url: evidence.imagery.url,
        license: evidence.imagery.license,
        retrievedAt: evidence.imagery.retrievedAt,
        evidenceNote: `Derived edge coordinates; reusable imagery evidence: ${evidence.imagery.reuseEvidenceUrl}. Image hashes, extents and extraction evidence are stored in the layout. Estimates remain unreviewed.`,
      };
      const candidateTrack = structuredClone(track);
      if (!candidateTrack.sources.some((s) => s.id === source.id))
        candidateTrack.sources.push(source);
      const candidate = structuredClone(layout);
      candidate.metadata.borderInference = evidence;
      candidate.metadata.licenseScope = "trace-and-timing";
      for (const role of ["inner", "outer"] as const)
        candidate.features.push({
          type: "Feature",
          id: role,
          properties: {
            role,
            sourceIds: [source.id],
            license: source.license,
            borderStatus: "estimated",
          },
          geometry: { type: "LineString", coordinates: result[role] },
        });
      candidate.bbox = bounds(
        candidate.features.flatMap((f) => geometryPaths(f.geometry).flat()),
      );
      const checked = validateLayout(candidate, candidateTrack, item.id);
      if (write) {
        Object.assign(track, candidateTrack);
        await writeFile(
          trackFile + ".next",
          JSON.stringify(track, null, 2) + "\n",
        );
        await rename(trackFile + ".next", trackFile);
        await writeFile(file + ".next", serializeLayout(checked));
        await rename(file + ".next", file);
        changed = true;
        row.status = "inferred-estimate";
      } else row.status = "candidate";
      row.evidence = evidence.evidence;
      row.source = source.url;
      row.imageSha256 = evidence.imagery.sha256;
    } catch (error) {
      row.reason = error instanceof Error ? error.message : String(error);
      row.status = row.reason.includes("No registered high-resolution")
        ? "needs-reusable-imagery"
        : row.reason.includes("acquisition failed")
          ? "acquisition-failed"
          : "needs-imagery-review";
    }
    report.push(row);
    console.log(
      `${row.trackId}/${row.layoutId}: ${row.status}${row.reason ? " - " + row.reason : ""}`,
    );
  }
  if (changed) {
    await writeFile(trackFile + ".next", JSON.stringify(track, null, 2) + "\n");
    await rename(trackFile + ".next", trackFile);
  }
  // Save progress after every venue so the same batch is resumable.
  for (const key of imagery.keys())
    if (key.startsWith(track.id + ":")) imagery.delete(key);
  if (!check) await saveProgress();
}
let cursor = 0;
await Promise.all(
  [0, 1, 2].map(async () => {
    while (cursor < catalogue.tracks.length) {
      const entry = catalogue.tracks[cursor++];
      await processEntry(entry);
    }
  }),
);
console.log(
  JSON.stringify({
    layouts: report.length,
    statuses: report.reduce(
      (c, r) => ((c[r.status] = (c[r.status] ?? 0) + 1), c),
      {} as Record<string, number>,
    ),
  }),
);

if (check && report.some((r) => r.status === "stale-estimate"))
  throw new Error("Inferred borders are stale after a trace change");
if (write) {
  let records = [...report];
  if (option("--track")) {
    try {
      const prior = await read("data/border-inference-coverage.json");
      records = [
        ...prior.records.filter(
          (r: RecordRow) => r.trackId !== option("--track"),
        ),
        ...records,
      ];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    note: "Image-derived borders are unreviewed estimates. Remaining layouts need suitable reusable imagery, image review or route identification. Existing borders are preserved.",
    records: records.sort((a, b) =>
      (a.trackId + "/" + a.layoutId).localeCompare(
        b.trackId + "/" + b.layoutId,
      ),
    ),
  };
  await writeFile(
    "data/border-inference-coverage.json",
    JSON.stringify(result, null, 2) + "\n",
  );
}
