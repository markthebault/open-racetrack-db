import {
  borderRefinementInputSchema,
  borderRefinementSchema,
  type BorderRefinementInput,
  borderMeasurementInputSchema,
  borderMeasurementSchema,
  type BorderMeasurementInput,
} from "../schemas/border-refinement";
import { distance, type Position } from "../src/geo";
import { imageCrossSections } from "./infer-image-borders";
import { borderPairHash } from "./refine-image-borders";
import { measuredImageBorders } from "./measured-image-borders";

type Pair = { inner: Position[]; outer: Position[] };

/** Reuse physical image measurements on a nearby, equally directed route. The output still needs image and ribbon validation. */
export function projectBorderRefinement(
  source: {
    trace: Position[];
    seed: Pair;
    input: BorderRefinementInput & { resultSha256?: string };
  },
  target: { trace: Position[]; seed: Pair; imageSha256: string },
) {
  const stored = borderRefinementInputSchema
    .or(borderRefinementSchema)
    .parse(source.input);
  const input = borderRefinementInputSchema.parse({
    method: stored.method,
    imageSha256: stored.imageSha256,
    seedSha256: stored.seedSha256,
    patches: stored.patches,
    note: stored.note,
  });
  if (
    input.seedSha256 !== borderPairHash(source.seed) ||
    input.imageSha256 !== target.imageSha256
  )
    throw new Error(
      "Measurement projection requires the original seed and the same pinned image",
    );
  const a = imageCrossSections(source.trace),
    b = imageCrossSections(target.trace);
  for (const [frames, seed] of [
    [a, source.seed],
    [b, target.seed],
  ] as const)
    if (
      seed.inner.length !== frames.count + 1 ||
      seed.outer.length !== frames.count + 1
    )
      throw new Error(
        "Measurement projection requires paired closed source stations",
      );
  const mappings: {
    sourceStation: number;
    station: number;
    edge: "inner" | "outer";
    traceGapM: number;
    alongM: number;
  }[] = [];
  const patches = input.patches.map((patch) => ({
    edge: patch.edge,
    anchors: patch.anchors.map((anchor) => {
      if (anchor.station > a.count)
        throw new Error("Source measurement station exceeds the trace");
      if (
        anchor.kind === "preserved-seed" &&
        distance(anchor.coordinate, source.seed[patch.edge][anchor.station]) >
          0.01
      )
        throw new Error("Source preserved anchor differs from its seed");
      const origin = b.projection.to(
        a.projection.from(a.smooth[a.index(anchor.station)]),
      );
      const gaps = b.smooth.map((p) =>
        Math.hypot(p[0] - origin[0], p[1] - origin[1]),
      );
      let station = gaps.reduce(
        (best, gap, i) => (gap < gaps[best] ? i : best),
        0,
      );
      const traceGapM = gaps[station],
        normal = b.normals[station],
        sourceNormal = a.normals[a.index(anchor.station)];
      if (
        traceGapM > 3 ||
        normal[0] * sourceNormal[0] + normal[1] * sourceNormal[1] < 0.98
      )
        throw new Error(
          "No nearby equally directed target cross-section for the measurement",
        );
      if (
        gaps.some((gap, i) => {
          const delta = Math.abs(i - station),
            separation = Math.min(delta, b.count - delta);
          return separation > 8 && gap <= 3;
        })
      )
        throw new Error(
          "Measurement projection is ambiguous between target branches",
        );
      if (anchor.station === a.count) {
        if (station !== 0)
          throw new Error(
            "Measurement projection requires matching closed seams",
          );
        station = b.count;
      }
      const base = b.smooth[b.index(station)];
      if (anchor.kind === "preserved-seed")
        return {
          ...anchor,
          station,
          coordinate: target.seed[patch.edge][station],
        };
      const q = b.projection.to(anchor.coordinate),
        delta = [q[0] - base[0], q[1] - base[1]],
        across = delta[0] * normal[0] + delta[1] * normal[1],
        alongM = delta[0] * normal[1] - delta[1] * normal[0];
      if (Math.abs(alongM) > 1.5)
        throw new Error("Measurement projection moves too far along the road");
      mappings.push({
        sourceStation: anchor.station,
        station,
        edge: patch.edge,
        traceGapM,
        alongM,
      });
      return {
        ...anchor,
        station,
        coordinate: b.projection.from([
          base[0] + across * normal[0],
          base[1] + across * normal[1],
        ]),
      };
    }),
  }));
  return {
    input: borderRefinementInputSchema.parse({
      ...input,
      seedSha256: borderPairHash(target.seed),
      patches,
    }),
    mappings,
  };
}

/** Transfer only supported image measurements. Rejected branches stay explicit and need their own measurements. */
export function projectSharedImageMeasurements(
  source: {
    trace: Position[];
    input: BorderMeasurementInput & {
      resultSha256?: string;
    };
  },
  target: {
    trace: Position[];
    imageSha256: string;
    direction?: "same" | "reverse";
  },
) {
  const stored = borderMeasurementInputSchema
      .or(borderMeasurementSchema)
      .parse(source.input),
    input = borderMeasurementInputSchema.parse({
      method: stored.method,
      imageSha256: stored.imageSha256,
      patches: stored.patches,
      note: stored.note,
      ...(stored.interpolation ? { interpolation: stored.interpolation } : {}),
    });
  if (input.imageSha256 !== target.imageSha256)
    throw new Error("Shared measurements require the same pinned image");
  const replay = measuredImageBorders(source.trace, input, target.imageSha256);
  if (
    "resultSha256" in stored &&
    replay.measurement.resultSha256 !== stored.resultSha256
  )
    throw new Error("Source measurement reconstruction hash mismatch");
  const a = imageCrossSections(source.trace),
    b = imageCrossSections(target.trace),
    rejected: {
      edge: string;
      sourceStation: number;
      reason: string;
    }[] = [],
    mappings: {
      edge: string;
      sourceStation: number;
      station: number;
      traceGapM: number;
      alongM: number;
    }[] = [];
  const patches = input.patches.map((patch) => ({
    edge: patch.edge,
    anchors: patch.anchors.flatMap((anchor) => {
      try {
        const origin = b.projection.to(
            a.projection.from(a.smooth[a.index(anchor.station)]),
          ),
          gaps = b.smooth.map((p) =>
            Math.hypot(p[0] - origin[0], p[1] - origin[1]),
          );
        let station = gaps.reduce(
          (best, gap, i) => (gap < gaps[best] ? i : best),
          0,
        );
        const traceGapM = gaps[station],
          normal = b.normals[station],
          sourceNormal = a.normals[a.index(anchor.station)];
        if (
          traceGapM > 3 ||
          (normal[0] * sourceNormal[0] + normal[1] * sourceNormal[1]) *
            (target.direction === "reverse" ? -1 : 1) <
            0.98
        )
          throw new Error(
            "No nearby target cross-section with the requested direction",
          );
        if (
          gaps.some((gap, i) => {
            const delta = Math.abs(i - station);
            return Math.min(delta, b.count - delta) > 8 && gap <= 3;
          })
        )
          throw new Error("Ambiguous target branches");
        if (
          anchor.station === a.count ||
          (target.direction === "reverse" && anchor.station === 0)
        ) {
          if (station !== 0) throw new Error("Mismatched closed seams");
          station =
            target.direction === "reverse"
              ? anchor.station === 0
                ? b.count
                : 0
              : b.count;
        }
        const base = b.smooth[b.index(station)],
          q = b.projection.to(anchor.coordinate),
          dx = q[0] - base[0],
          dy = q[1] - base[1],
          across = dx * normal[0] + dy * normal[1],
          alongM = dx * normal[1] - dy * normal[0];
        if (Math.abs(alongM) > 1.5)
          throw new Error("Projection moves too far along the road");
        mappings.push({
          edge: patch.edge,
          sourceStation: anchor.station,
          station,
          traceGapM,
          alongM,
        });
        return [
          {
            ...anchor,
            station,
            coordinate: b.projection.from([
              base[0] + across * normal[0],
              base[1] + across * normal[1],
            ]),
          },
        ];
      } catch (error) {
        rejected.push({
          edge: patch.edge,
          sourceStation: anchor.station,
          reason: String(error),
        });
        return [];
      }
    }),
  }));
  if (target.direction === "reverse")
    for (const patch of patches) patch.anchors.reverse();
  for (const patch of patches)
    if (
      patch.anchors.some(
        (a, i) => i > 0 && a.station <= patch.anchors[i - 1].station,
      )
    )
      throw new Error(
        "Projected measurements duplicate or reorder target stations",
      );
  return { patches, mappings, rejected };
}
