import { geometryPaths, type Layout, type Track } from "../schemas/data";
import { bounds, equal } from "./geo";
import type { WidthCalculationInput } from "./trace-width-calculation";
export type WidthReply = {
  ok: boolean;
  result?: {
    features: Layout["features"];
    elapsedMs: number;
    maximumReferenceShiftM: number;
  };
  error?: string;
};
const cache = new Map<string, Promise<WidthReply>>();
function calculate(input: WidthCalculationInput) {
  const key = JSON.stringify(input);
  let pending = cache.get(key);
  if (!pending) {
    pending = new Promise<WidthReply>((resolve) => {
      const worker = new Worker(
        new URL("./trace-width.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (event: MessageEvent<WidthReply>) => {
        worker.terminate();
        resolve(event.data);
      };
      worker.onerror = () => {
        worker.terminate();
        resolve({ ok: false, error: "Width calculation failed" });
      };
      worker.postMessage(input);
    });
    cache.set(key, pending);
  }
  return pending.then((reply) => {
    if (!reply.ok) cache.delete(key);
    return reply;
  });
}
/** One input per source path. Component routes use their own width and preserve their order/closure. */
export function widthCalculationInputs(
  layout: Layout,
  track: Track,
): WidthCalculationInput[] {
  const config = track.layouts.find((l) => l.id === layout.metadata.layoutId);
  if (config?.lineUnavailableReason || config?.roadWidthM === undefined)
    return [];
  const source = layout.features.find((f) => f.properties.role === "trace");
  if (!source) throw Error("No source trace");
  return geometryPaths(source.geometry).map((trace, i) => {
    const component = layout.metadata.borderComposition?.[i],
      metadata = component?.metadata ?? layout.metadata;
    const model = component?.recipe ?? layout.metadata.model3d;
    const entry = component
      ? (track.layouts.find((l) => l.id === component.sourceLayoutId) ?? config)
      : config;
    const closed = component
      ? metadata.closed
      : source.geometry.type === "LineString"
        ? metadata.closed
        : equal(trace[0], trace.at(-1)!);
    return {
      trace,
      closed,
      widthM: entry.roadWidthM ?? config.roadWidthM!,
      leftRight:
        !closed ||
        !!(model && model.kind !== "surface" && model.gradeSeparation),
      sourceLicenses: entry.roadWidthSource?.licenses ??
        config.roadWidthSource?.licenses ?? [layout.metadata.license],
      ...(model && model.kind !== "surface"
        ? {
            elevation: {
              anchors: model.elevation,
              referenceLengthM: model.referenceLengthM,
              start: metadata.timing?.start,
              startOffsetM: model.startOffsetM,
              gradeSeparation: model.gradeSeparation,
            },
          }
        : {}),
    };
  });
}
export function mergeWidthResults(
  layout: Layout,
  inputs: WidthCalculationInput[],
  replies: WidthReply[],
): Layout {
  const runtime = structuredClone(layout),
    failed = replies.find((r) => !r.ok || !r.result);
  if (failed) {
    runtime.metadata.lineUnavailableReason =
      failed.error ?? "Line calculation failed for this geometry";
    delete runtime.metadata.model3d;
    delete runtime.metadata.borderComposition;
    runtime.metadata.notes.push(
      "Estimated edges and ideal line unavailable: " +
        (failed.error ?? "calculation failed") +
        ". The original trace is retained.",
    );
    return runtime;
  }
  const results = replies.map((r) => r.result!),
    maximumShift = results.reduce(
      (s, r) => Math.max(s, r.maximumReferenceShiftM),
      0,
    );
  if (maximumShift > 0.05)
    runtime.metadata.notes.push(
      `The estimated corridor locally rounds sharp mapped kinks by up to ${maximumShift.toFixed(1)} m. The original mapped trace is unchanged.`,
    );
  if (inputs.length === 1)
    runtime.features.push(...structuredClone(results[0].features));
  else
    for (const role of ["inner", "outer", "ideal"] as const) {
      const parts = results.map(
        (r) => r.features.find((f) => f.properties.role === role)!,
      );
      const first = structuredClone(parts[0]);
      if (role !== "ideal" && "widthM" in first.properties)
        first.properties.componentWidthsM = inputs.map((i) => i.widthM);
      first.geometry = {
        type: "MultiLineString",
        coordinates: parts.map((f) => geometryPaths(f.geometry)[0]),
      };
      runtime.features.push(first);
    }
  runtime.bbox = bounds(
    runtime.features.flatMap((f) => geometryPaths(f.geometry).flat()),
  );
  return runtime;
}
/** Generated only in memory; stored GeoJSON contains no reconstructed line coordinates. */
export async function materializeTraceWidth(
  layout: Layout,
  track: Track,
  onStatus?: (text: string) => void,
): Promise<Layout> {
  const entry = track.layouts.find((l) => l.id === layout.metadata.layoutId);
  if (entry?.lineUnavailableReason) {
    const result = structuredClone(layout);
    result.metadata.lineUnavailableReason = entry.lineUnavailableReason;
    delete result.metadata.model3d;
    delete result.metadata.borderComposition;
    result.features = result.features.filter(
      (f) => !["inner", "outer", "ideal"].includes(f.properties.role),
    );
    return result;
  }
  const inputs = widthCalculationInputs(layout, track);
  if (!inputs.length) return layout;
  const replies: WidthReply[] = [];
  for (const [i, input] of inputs.entries()) {
    onStatus?.(
      inputs.length > 1
        ? `Calculating estimated edges and ideal lines… ${i + 1}/${inputs.length}`
        : "Calculating estimated edges and ideal line…",
    );
    replies.push(await calculate(input));
  }
  return mergeWidthResults(layout, inputs, replies);
}

/** A user-supplied scalar override affects this browser session only, never database geometry. */
export function manualWidthConfiguration(
  track: Track,
  layout: Layout,
  widthM: number,
): Track {
  if (!Number.isFinite(widthM) || widthM < 3 || widthM > 45)
    throw Error("Enter a road width between 3 and 45 metres");
  const copy = structuredClone(track),
    ids = new Set([
      layout.metadata.layoutId,
      ...(layout.metadata.borderComposition ?? []).map((c) => c.sourceLayoutId),
    ]);
  for (const entry of copy.layouts)
    if (ids.has(entry.id)) {
      entry.roadWidthM = widthM;
      delete entry.roadWidthSource;
      delete entry.lineUnavailableReason;
    }
  return copy;
}
