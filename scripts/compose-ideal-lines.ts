import {sourceGeometryIdealFeature} from './ideal-source-geometry';
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { geometryPaths, type Layout } from "../schemas/data";
import { networkRouteLayout } from "../src/network-routes";
import { serializeLayout } from "./layout-borders";

/** Reuse independently validated component paths only for exact embedded sources. */
export function composeIdealLine(network: Layout, sources: Layout[]) {
  const components = network.metadata.borderComposition;
  if (!components?.length) return undefined;
  const ideals = components.map((component, i) => {
    const source = sources.find(
      (s) => s.metadata.layoutId === component.sourceLayoutId,
    );
    if (!source) return undefined;
    const original = structuredClone(source);
    original.features = original.features.filter((f) => f.properties.role !== "ideal");
    if (!isDeepStrictEqual(networkRouteLayout(network, i), original))
      return undefined;
    const ideal = source.features.find((f) => f.properties.role === "ideal");
    if(ideal?.properties.role==='ideal'&&ideal.properties.boundaryModel==='reviewed-source-corridor-v1'){
      try{if(!isDeepStrictEqual(ideal,sourceGeometryIdealFeature(source,ideal.properties.sourceGeometryReview)))return undefined;}catch{return undefined;}
    }
    return ideal?.properties.role === "ideal" && (!ideal.properties.boundaryModel||ideal.properties.boundaryModel==='reviewed-source-corridor-v1') &&
      ideal.geometry.type === "LineString"
      ? { ...ideal, properties: ideal.properties }
      : undefined;
  });
  if (ideals.some((f) => !f)) return undefined;
  const available = ideals.map((f) => f!);
  const licenses = network.features
    .filter((f) => f.properties.role === "inner" || f.properties.role === "outer")
    .flatMap((f) => "license" in f.properties ? [f.properties.license] : []);
  const sourceGeometryReviews=available.flatMap(f=>f.properties.sourceGeometryReview?[f.properties.sourceGeometryReview]:[]);
  return {
    type: "Feature" as const,
    id: "ideal",
    properties: {
      role: "ideal" as const,
      sourceIds: [],
      estimated: true as const,
      method: "bounded-minimum-curvature-local-time-v1" as const,
      edgeMarginM: Math.min(...available.map((f) => f.properties.edgeMarginM)),
      ...(sourceGeometryReviews.length?{qualification:'unverified-source-geometry' as const,sourceGeometryReviews}:{}),
      borderLicenses: [...new Set(licenses)],
    },
    geometry: {
      type: "MultiLineString" as const,
      coordinates: available.flatMap((f) => geometryPaths(f.geometry)),
    },
  };
}

export async function composeAvailableIdealLines(
  rows: { file: string; status: string; reason?: string }[],
) {
  for (const row of rows) {
    if (row.status !== "unavailable") continue;
    const network = JSON.parse(await readFile(row.file, "utf8")) as Layout;
    if (!network.metadata.borderComposition?.length) continue;
    const directory = dirname(dirname(row.file)),
      track = JSON.parse(await readFile(join(directory, "track.json"), "utf8"));
    const sources = await Promise.all(network.metadata.borderComposition.map(async (c) => {
      const item = track.layouts.find((l: { id: string }) => l.id === c.sourceLayoutId);
      return JSON.parse(await readFile(join(directory, item.file), "utf8")) as Layout;
    }));
    const ideal = composeIdealLine(network, sources);
    if (!ideal) continue;
    network.features = network.features.filter((f) => f.properties.role !== "ideal");
    network.features.push(ideal);
    await writeFile(row.file, serializeLayout(network));
    row.status = "generated";
    delete row.reason;
  }
}
