import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  indexSchema,
  validateTrack,
  validateLayout,
  geometryPaths,
  type Layout,
} from "../schemas/data";
import { isLapModel, networkLapRecipeSchema } from "../schemas/track-model";
import { elevationSchema } from "../src/elevation";
import { networkRouteLayout } from "../src/network-routes";
import { prepareSurfaceModel } from "../src/model-preparation";
import { serializeLayout } from "./layout-borders";
import { bounds } from "../src/geo";
import { modelInputHash } from "./model-input";
const args = process.argv.slice(2),
  check = args.includes("--check"),
  write = args.includes("--write"),
  option = (s: string) => {
    const i = args.indexOf(s);
    return i < 0 ? undefined : args[i + 1];
  };
if (!check && !write)
  throw new Error(
    "Use --write to compose exact existing driving layouts, or --check to verify compositions",
  );
const read = async (p: string) => JSON.parse(await readFile(p, "utf8")),
  hash = (v: unknown) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
const catalogue = indexSchema.parse(await read("data/index.json")),
  report: {
    trackId: string;
    layoutId: string;
    status: string;
    routes?: number;
    file?: string;
    legacyBorders?: boolean;
  }[] = [];
for (const entry of catalogue.tracks) {
  if (option("--track") && entry.id !== option("--track")) continue;
  const track = validateTrack(await read(`data/${entry.file}`)),
    directory = `data/${dirname(entry.file)}`;
  const layouts = await Promise.all(
    track.layouts
      .filter((l) => l.file)
      .map(async (item) => ({
        item,
        layout: validateLayout(
          await read(`${directory}/${item.file}`),
          track,
          item.id,
        ),
      })),
  );
  for (const { item, layout } of layouts) {
    if (layout.metadata.geometryKind !== "network") continue;
    const sourceRecipe = await read(
      `sources/${track.id}/layouts/${item.id}.json`,
    );
    const intended: { layoutId: string }[] | undefined =
      sourceRecipe.components;
    const previous = layout.metadata.borderComposition;
    if (check) {
      if (!previous) continue;
      for (const component of previous) {
        if (
          intended &&
          intended[component.tracePathIndex]?.layoutId !==
            component.sourceLayoutId
        )
          throw new Error(
            `${track.id}/${item.id}: component identity differs from the source recipe`,
          );
        const source = layouts.find(
          (l) => l.item.id === component.sourceLayoutId,
        )?.layout;
        if (!source || hash(source) !== component.sourceSha256)
          throw new Error(
            `${track.id}/${item.id}: stale component ${component.sourceLayoutId}`,
          );
        const restored = validateLayout(
          networkRouteLayout(layout, component.tracePathIndex),
          track,
          component.sourceLayoutId,
        );
        if (hash(restored) !== component.sourceSha256)
          throw new Error(
            `${track.id}/${item.id}: embedded route differs from ${component.sourceLayoutId}`,
          );
      }
      report.push({
        trackId: track.id,
        layoutId: item.id,
        status: "current",
        routes: previous.length,
      });
      continue;
    }

    const trace = layout.features.find((f) => f.properties.role === "trace")!,
      paths = geometryPaths(trace.geometry);
    const matches = paths.map((path, index) => {
      const candidates = layouts.filter(
        ({ layout: child }) =>
          isLapModel(child.metadata.model3d) &&
          child.metadata.geometryKind !== "network" &&
          JSON.stringify(
            geometryPaths(
              child.features.find((f) => f.properties.role === "trace")!
                .geometry,
            )[0],
          ) === JSON.stringify(path),
      );
      return intended
        ? candidates.find((c) => c.item.id === intended[index]?.layoutId)
        : candidates.length === 1
          ? candidates[0]
          : undefined;
    });
    if (matches.some((m) => !m)) {
      report.push({
        trackId: track.id,
        layoutId: item.id,
        status: "unresolved-components",
      });
      continue;
    }
    const composed = structuredClone(layout),
      components: NonNullable<Layout["metadata"]["borderComposition"]> = [];
    const borderPaths: number[][][][] = [[], []];
    for (const [i, match] of matches.entries()) {
      const child = match!.layout,
        model = child.metadata.model3d!;
      if (!isLapModel(model)) throw new Error("Expected a playable component");
      const recipe = networkLapRecipeSchema.parse(
        Object.fromEntries(
          Object.entries(model).filter(([key]) => key !== "terrain"),
        ),
      );
      const borders = (["inner", "outer"] as const).map((role) =>
        child.features.find((f) => f.properties.role === role)!,
      );
      for (const [j, f] of borders.entries()) {
        if (f.geometry.type !== "LineString")
          throw new Error("Component needs continuous borders");
        borderPaths[j].push(f.geometry.coordinates);
      }
      const metadata = Object.fromEntries(
        Object.entries(child.metadata).filter(([key]) => key !== "model3d"),
      ) as Omit<Layout["metadata"], "model3d">;
      components.push({
        tracePathIndex: i,
        sourceLayoutId: match!.item.id,
        sourceSha256: hash(child),
        name: match!.item.name,
        traceSourceIds: child.features.find(
          (f) => f.properties.role === "trace",
        )!.properties.sourceIds,
        metadata,
        borderProperties: [
          borders[0]
            .properties as (typeof components)[number]["borderProperties"][0],
          borders[1]
            .properties as (typeof components)[number]["borderProperties"][1],
        ],
        timingFeatures: child.features.filter((f) =>
          ["start_finish", "start", "finish"].includes(f.properties.role),
        ) as (typeof components)[number]["timingFeatures"],
        recipe: networkLapRecipeSchema.parse(recipe),
      });
    }
    const originalBorders = layout.features.filter(
      (f) => f.properties.role === "inner" || f.properties.role === "outer",
    );
    const legacyBorders =
      originalBorders.length === 2 &&
      originalBorders.every(
        (f) =>
          "license" in f.properties &&
          f.properties.license !== "LicenseRef-Component-Borders",
      );
    if (
      legacyBorders &&
      originalBorders.some(
        (f) =>
          JSON.stringify(geometryPaths(f.geometry)) !==
            JSON.stringify(
              borderPaths[f.properties.role === "inner" ? 0 : 1],
            ) ||
          !components.every(
            (c) =>
              JSON.stringify(
                c.borderProperties[f.properties.role === "inner" ? 0 : 1],
              ) === JSON.stringify(f.properties),
          ),
      )
    ) {
      report.push({
        trackId: track.id,
        layoutId: item.id,
        status: "existing-border-mismatch",
      });
      continue;
    }
    if (!legacyBorders) {
      composed.features = composed.features.filter(
        (f) => f.properties.role !== "inner" && f.properties.role !== "outer",
      );
      for (const [i, role] of (["inner", "outer"] as const).entries())
        composed.features.push({
          type: "Feature",
          id: role,
          properties: {
            role,
            sourceIds: [],
            license: "LicenseRef-Component-Borders",
          },
          geometry: {
            type: "MultiLineString",
            coordinates: borderPaths[i] as [number, number][][],
          },
        });
    }
    composed.metadata.licenseScope = "trace-and-timing";
    composed.metadata.borderComposition = components;
    composed.bbox = bounds(
      composed.features.flatMap((f) => geometryPaths(f.geometry).flat()),
    );
    const terrain =
      layout.metadata.model3d?.terrain ??
      elevationSchema.parse(await read(`data/elevation/${track.id}.json`));
    composed.metadata.model3d = prepareSurfaceModel(
      composed,
      terrain,
      modelInputHash(composed, terrain),
      "route-not-closed",
    );
    validateLayout(composed, track, item.id);
    await writeFile(`${directory}/${item.file}`, serializeLayout(composed));
    report.push({
      trackId: track.id,
      layoutId: item.id,
      status: "composed",
      routes: components.length,
      file: `${directory}/${item.file}`,
      legacyBorders,
    });
  }
}
if (write) {
  const file = "data/border-inference-coverage.json",
    coverage = await read(file);
  for (const row of report.filter((r) => r.status === "composed")) {
    const old = coverage.records.find(
      (r: { trackId: string; layoutId: string }) =>
        r.trackId === row.trackId && r.layoutId === row.layoutId,
    );
    const target = old ?? {
      trackId: row.trackId,
      layoutId: row.layoutId,
      file: row.file,
    };
    target.status = row.legacyBorders
      ? "composed-existing"
      : "composed-estimate";
    target.componentRoutes = row.routes;
    delete target.reason;
    if (!old) coverage.records.push(target);
  }
  coverage.records.sort(
    (
      a: { trackId: string; layoutId: string },
      b: { trackId: string; layoutId: string },
    ) =>
      (a.trackId + "/" + a.layoutId).localeCompare(
        b.trackId + "/" + b.layoutId,
      ),
  );
  coverage.generatedAt = new Date().toISOString();
  await writeFile(file, JSON.stringify(coverage, null, 2) + "\n");
}
console.log(
  JSON.stringify(
    {
      networks: report.filter((r) => ["composed", "current"].includes(r.status))
        .length,
      routes: report.reduce((n, r) => n + (r.routes ?? 0), 0),
      records: report,
    },
    null,
    2,
  ),
);
