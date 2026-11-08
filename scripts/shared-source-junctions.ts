import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { Layout } from "../schemas/data";
import { sharedSourceNodeSchema, type SharedSourceNode } from "../schemas/shared-source";
import { equal, type Position } from "../src/geo";
import { assemble, slice, type Way } from "./route";
import type { SharedGround } from "../schemas/shared-ground";

const recipeSchema = z.object({
  trackId: z.string(), layoutId: z.string(), sourceId: z.string(),
  snapshotFile: z.string().optional(), snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  closed: z.literal(true),
  segments: z.array(z.strictObject({
    wayId: z.number().int().positive(), wayVersion: z.number().int().positive(),
    fromIndex: z.number().int().nonnegative(), toIndex: z.number().int().nonnegative(),
  })).min(1),
});
const manifestSchema = z.object({
  trackId: z.string(), sourceId: z.string(), snapshotFile: z.string().optional(),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  snapshots: z.array(z.object({
    file: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), sourceId: z.string(),
  })).optional(),
});
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

/** Exact selected nodes, including repeated visits but excluding the ordinary closing copy. */
export function inspectSharedSourceNodes(layout: Layout, inputRecipe: unknown, bytes: Uint8Array) {
  const recipe = recipeSchema.parse(inputRecipe),
    feature = layout.features.find((f) => f.properties.role === "trace");
  if (!layout.metadata.closed || layout.metadata.geometryKind === "network" ||
      feature?.geometry.type !== "LineString" ||
      recipe.trackId !== layout.metadata.trackId || recipe.layoutId !== layout.metadata.layoutId ||
      !feature.properties.sourceIds.includes(recipe.sourceId))
    throw new Error("Shared junction needs its registered closed single-source route");
  const snapshotSha256 = sha(bytes);
  if (snapshotSha256 !== recipe.snapshotSha256)
    throw new Error("Shared-junction snapshot hash mismatch");
  const snapshot = JSON.parse(Buffer.from(bytes).toString("utf8")),
    ways = snapshot.elements.filter((e: Way & { type: string }) => e.type === "way") as Way[],
    map = new Map(ways.map((w) => [w.id, w]));
  if (map.size !== ways.length) throw new Error("Shared-junction snapshot has duplicate way identities");
  const coordinates = assemble(ways, recipe.segments, true), trace = feature.geometry.coordinates;
  if (JSON.stringify(coordinates) !== JSON.stringify(trace))
    throw new Error("Shared-junction source does not reproduce the complete saved driving order");
  const route: { node: number; point: Position }[] = [],
    incident = new Map<number, Map<number, Way>>(), positions = new Map<number, Position>();
  for (const segment of recipe.segments) {
    const way = map.get(segment.wayId)!, part = slice(way, segment);
    for (const p of part) {
      if (positions.has(p.node) && !equal(positions.get(p.node)!, p.point))
        throw new Error("One selected source node has inconsistent coordinates");
      positions.set(p.node, p.point);
      if (!incident.has(p.node)) incident.set(p.node, new Map());
      incident.get(p.node)!.set(way.id, way);
    }
    if (route.length) part.shift();
    route.push(...part);
  }
  const visits = new Map<number, number[]>();
  route.slice(0, -1).forEach((p, i) => {
    if (!visits.has(p.node)) visits.set(p.node, []);
    visits.get(p.node)!.push(i);
  });
  return [...visits].filter(([, indices]) => indices.length >= 2).map(([nodeId, traceIndices]) => {
    const selected = [...incident.get(nodeId)!.values()].sort((a, b) => a.id - b.id),
      hasGradeSeparationTags = selected.some((w) => {
        const t = w.tags ?? {}, active = (v?: string) => !!v && !/^(no|0|false)$/i.test(v);
        return active(t.bridge) || active(t.tunnel) ||
          (t.layer !== undefined && (!Number.isFinite(Number(t.layer)) || Number(t.layer) !== 0));
      });
    const source = sharedSourceNodeSchema.parse({
      schemaVersion: 1, snapshotSha256, traceGeometrySha256: sha(JSON.stringify(feature.geometry)),
      nodeId, coordinate: positions.get(nodeId)!, traceIndices,
      ways: selected.map((w) => ({ wayId: w.id, wayVersion: w.version })),
    });
    return { source, hasGradeSeparationTags };
  });
}

export function verifySharedSourceNode(
  layout: Layout, recipe: unknown, bytes: Uint8Array, claim: SharedSourceNode,
) {
  claim = sharedSourceNodeSchema.parse(claim);
  const matches = inspectSharedSourceNodes(layout, recipe, bytes)
    .filter((p) => JSON.stringify(p.source) === JSON.stringify(claim));
  if (matches.length !== 1) throw new Error("Shared junction does not match one exact repeated source node");
  if (matches[0].hasGradeSeparationTags)
    throw new Error("Shared paving cannot be inferred from grade-separated source ways");
  return matches[0].source;
}

export async function readSharedSourceNodes(layout: Layout, sourcesRoot = "sources") {
  if (![layout.metadata.trackId, layout.metadata.layoutId].every((v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)))
    throw new Error("Unsafe shared-junction source identity");
  const root = resolve(sourcesRoot, layout.metadata.trackId),
    recipe = recipeSchema.parse(JSON.parse(await readFile(`${root}/layouts/${layout.metadata.layoutId}.json`, "utf8"))),
    manifest = manifestSchema.parse(JSON.parse(await readFile(`${root}/import.json`, "utf8"))),
    baseFile = manifest.snapshotFile ?? "osm.json", file = recipe.snapshotFile ?? baseFile,
    registered = file === baseFile
      ? manifest.sourceId === recipe.sourceId && manifest.snapshotSha256 === recipe.snapshotSha256
      : manifest.snapshots?.some((s) => s.file === file && s.sourceId === recipe.sourceId &&
        s.sha256 === recipe.snapshotSha256),
    path = resolve(root, file);
  if (manifest.trackId !== layout.metadata.trackId || !registered)
    throw new Error("Shared-junction source is not registered in its track manifest");
  if (dirname(path) !== root || !path.endsWith(".json"))
    throw new Error("Shared-junction snapshot must remain in its source directory");
  return inspectSharedSourceNodes(layout, recipe, await readFile(path));
}

export async function verifySharedGroundSource(layout: Layout, ground: SharedGround, sourcesRoot = "sources") {
  const matches = (await readSharedSourceNodes(layout, sourcesRoot)).filter((p) =>
    JSON.stringify(p.source) === JSON.stringify(ground.sourceNode));
  if (matches.length !== 1 || matches[0].hasGradeSeparationTags)
    throw new Error("Shared-ground source is not one exact registered ground-level node");
  if (sha(JSON.stringify(layout.features.filter((f) => f.properties.role === "inner" || f.properties.role === "outer"))) !== ground.borderSha256)
    throw new Error("Shared-ground original boundary hash mismatch");
}
