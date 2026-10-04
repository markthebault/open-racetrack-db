import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PNG } from "pngjs";
import { indexSchema, geometryPaths, type Layout } from "../schemas/data";
import {
  elevationSchema,
  courseElevation,
  type ElevationGrid,
} from "../src/elevation";
import { planarCourse } from "../src/track-preview";
import { plane, type Position } from "../src/geo";

const args = process.argv.slice(2),
  validate = args.includes("--validate");
const catalogue = indexSchema.parse(
  JSON.parse(await readFile("data/index.json", "utf8")),
);
const zoom = 12,
  tileCount = 2 ** zoom,
  sampledAt = new Date().toISOString();
type Tile = {
  png: PNG;
  sha256: string;
  url: string;
  lastModified: string | null;
};
const decoded = new Map<string, Tile>();
const tilesUsed = new Map<string, Omit<Tile, "png">>();
const venues: {
  id: string;
  file: string;
  country: string;
  layouts: Layout[];
  points: Position[];
}[] = [];
for (const entry of catalogue.tracks) {
  if (!entry.traceCount) continue;
  const track = JSON.parse(await readFile(`data/${entry.file}`, "utf8"));
  const layouts: Layout[] = [];
  for (const l of track.layouts)
    if (l.file)
      layouts.push(
        JSON.parse(
          await readFile(
            `data/${entry.file.replace(/track\.json$/, "")}${l.file}`,
            "utf8",
          ),
        ),
      );
  venues.push({
    id: entry.id,
    file: `data/elevation/${entry.id}.json`,
    country: entry.country.code,
    layouts,
    points: layouts.flatMap((l) =>
      geometryPaths(
        l.features.find((f) => f.properties.role === "trace")!.geometry,
      ).flat(),
    ),
  });
}
if (validate) {
  let count = 0;
  for (const venue of venues) {
    const grid = elevationSchema.parse(
      JSON.parse(await readFile(venue.file, "utf8")),
    );
    if (grid.trackId !== venue.id)
      throw new Error(`${venue.id}: incorrect elevation identity`);
    for (const layout of venue.layouts) {
      if (!courseElevation(layout, grid))
        throw new Error(
          `${venue.id}/${layout.metadata.layoutId}: terrain coverage missing`,
        );
      count++;
    }
  }
  console.log(
    `Validated terrain elevation for ${venues.length} venues and ${count} mapped layouts.`,
  );
} else {
  function tileCoordinate(p: Position) {
    return [
      ((p[0] + 180) / 360) * tileCount,
      ((1 - Math.asinh(Math.tan((p[1] * Math.PI) / 180)) / Math.PI) / 2) *
        tileCount,
    ];
  }
  async function tile(x: number, y: number) {
    const id = `${zoom}/${x}/${y}`;
    if (decoded.has(id)) return decoded.get(id)!;
    const file = `.local/elevation-tiles/${id}.png`,
      url = `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${id}.png`;
    let bytes: Buffer,
      lastModified: string | null = null;
    try {
      bytes = await readFile(file);
    } catch {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          response = await fetch(url, { signal: AbortSignal.timeout(30000) });
          if (response.ok) break;
        } catch {
          /* Retry transient network failures. */
        }
        if (attempt === 3)
          throw new Error(`Terrain tile could not load: ${url}`);
        await delay(1000 * (attempt + 1));
      }
      bytes = Buffer.from(await response!.arrayBuffer());
      lastModified = response!.headers.get("last-modified");
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
    }
    const png = PNG.sync.read(bytes);
    if (png.width !== 256 || png.height !== 256)
      throw new Error(`Unexpected terrain raster dimensions: ${id}`);
    const result = {
      png,
      url,
      lastModified,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    decoded.set(id, result);
    return result;
  }
  function attribution(country: string) {
    const credits = [
      "Mapzen Terrain Tiles",
      "Global elevation data courtesy of the U.S. Geological Survey and NOAA.",
    ];
    const local: Record<string, string> = {
      AU: "© Commonwealth of Australia, Geoscience Australia 2017.",
      AT: "© offene Daten Österreichs, Digitales Geländemodell Österreich.",
      CA: "Contains information licensed under the Open Government Licence, Canada.",
      GB: "© Environment Agency copyright and/or database right 2015. All rights reserved.",
      MX: "Source: INEGI, Continental relief, 2016.",
      NZ: "Copyright 2011 Crown copyright © Land Information New Zealand and the New Zealand Government. All rights reserved.",
      NO: "© Kartverket.",
    };
    if (local[country]) credits.push(local[country]);
    if (["CA", "FI", "GL", "IS", "NO", "RU", "SE"].includes(country))
      credits.push(
        "ArcticDEM: DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736.",
      );
    // The provider blends sources at tile boundaries. Keep the EU source credit for European countries.
    if (
      [
        "AL",
        "AD",
        "AT",
        "BY",
        "BE",
        "BA",
        "BG",
        "HR",
        "CY",
        "CZ",
        "DK",
        "EE",
        "FI",
        "FR",
        "DE",
        "GR",
        "HU",
        "IS",
        "IE",
        "IT",
        "LV",
        "LI",
        "LT",
        "LU",
        "MT",
        "MD",
        "MC",
        "ME",
        "NL",
        "MK",
        "NO",
        "PL",
        "PT",
        "RO",
        "RU",
        "SM",
        "RS",
        "SK",
        "SI",
        "ES",
        "SE",
        "CH",
        "TR",
        "UA",
        "GB",
      ].includes(country)
    )
      credits.push(
        "Produced using Copernicus data and information funded by the European Union, EU-DEM layers.",
      );
    return credits;
  }
  let completed = 0;
  async function generate(venue: (typeof venues)[number]) {
    const local = planarCourse([venue.points]),
      projection = plane(local.origin),
      span = Math.max(local.width, local.height);
    const width = Math.max(span * 0.4375, local.width + span * 0.275),
      height = Math.max(span * 0.4375, local.height + span * 0.275);
    const sw = projection.from([-width / 2, -height / 2]),
      ne = projection.from([width / 2, height / 2]);
    const bounds: ElevationGrid["bounds"] = [sw[0], sw[1], ne[0], ne[1]];
    const columns = Math.max(16, Math.min(96, Math.ceil(width / 80) + 1)),
      rows = Math.max(16, Math.min(96, Math.ceil(height / 80) + 1));
    const positions: Position[] = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++)
        positions.push([
          bounds[0] + (x / (columns - 1)) * (bounds[2] - bounds[0]),
          bounds[3] - (y / (rows - 1)) * (bounds[3] - bounds[1]),
        ]);
    const ids = new Set(
      positions.map((p) => {
        const [x, y] = tileCoordinate(p);
        return `${Math.floor(x)}/${Math.floor(y)}`;
      }),
    );
    // A few independent tiles per venue, bounded by four venue workers below.
    for (const id of ids) {
      const [x, y] = id.split("/").map(Number);
      await tile(x, y);
    }
    const heights = positions.map((p) => {
      const [x, y] = tileCoordinate(p),
        id = `${zoom}/${Math.floor(x)}/${Math.floor(y)}`,
        t = decoded.get(id)!;
      const { png, ...evidence } = t;
      tilesUsed.set(id, evidence);
      const px = Math.min(255, Math.max(0, (x % 1) * 256 - 0.5)),
        py = Math.min(255, Math.max(0, (y % 1) * 256 - 0.5));
      const x0 = Math.floor(px),
        y0 = Math.floor(py),
        x1 = Math.min(255, x0 + 1),
        y1 = Math.min(255, y0 + 1);
      const value = (u: number, v: number) => {
        const i = (v * 256 + u) * 4;
        return png.data[i + 3]
          ? png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768
          : null;
      };
      const a = value(x0, y0),
        b = value(x1, y0),
        c = value(x0, y1),
        d = value(x1, y1);
      if (a === null || b === null || c === null || d === null) return null;
      const tx = px - x0,
        ty = py - y0;
      return Math.round(
        (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty,
      );
    });
    const grid = elevationSchema.parse({
      schemaVersion: 1,
      trackId: venue.id,
      bounds,
      columns,
      rows,
      heights,
      source: {
        name: "Mapzen Terrain Tiles",
        url: "https://registry.opendata.aws/terrain-tiles/",
        zoom,
        sampledAt,
        sampleSpacingM: Math.round(
          Math.max(width / (columns - 1), height / (rows - 1)),
        ),
        attribution: attribution(venue.country),
      },
    });
    for (const layout of venue.layouts)
      if (!courseElevation(layout, grid))
        throw new Error(`${venue.id}: incomplete source terrain coverage`);
    await writeFile(venue.file, JSON.stringify(grid) + "\n");
    completed++;
    if (completed % 25 === 0 || completed === venues.length)
      console.log(
        `Elevation ${completed}/${venues.length} venues; ${tilesUsed.size} pinned terrain tiles.`,
      );
  }
  await mkdir("data/elevation", { recursive: true });
  const priority = [
    "be-spa-francorchamps",
    "de-nurburgring",
    "jp-suzuka-circuit-175231434",
    "us-pikes-peak-hillclimb-ab97c20e",
    "de-hockenheimring",
    "it-monza",
  ];
  venues.sort(
    (a, b) =>
      (priority.indexOf(a.id) < 0 ? 999 : priority.indexOf(a.id)) -
      (priority.indexOf(b.id) < 0 ? 999 : priority.indexOf(b.id)),
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < venues.length) await generate(venues[next++]);
    }),
  );
  await writeFile(
    "data/elevation/manifest.json",
    JSON.stringify(
      {
        schemaVersion: 1,
        provider: "Mapzen Terrain Tiles",
        sourceUrl: "https://registry.opendata.aws/terrain-tiles/",
        attributionUrl:
          "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
        sampledAt,
        zoom,
        venues: venues.map((v) => v.id).sort(),
        tiles: Object.fromEntries(
          [...tilesUsed].sort(([a], [b]) => a.localeCompare(b)),
        ),
        method:
          "Terrarium RGB decoding; bilinear sampling to geographic venue grids; rounded to integer metres. Ground elevation is approximate. Source resolution varies; bridges, banking and track surfaces are not surveyed.",
      },
      null,
      2,
    ) + "\n",
  );
}
