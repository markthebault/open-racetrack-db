import { geometryPaths, type Layout, type TimingGps } from "../schemas/data";
import { equal, type Position } from "./geo";
import { localGate } from "./local-timing";

export type TimingMarker = {
  role: "start_finish" | "start" | "finish";
  point: Position;
  coordinates: Position[];
};

export function timingMarkers(layout: Layout): TimingMarker[] {
  const timing = layout.metadata.timing;
  if (!timing) return [];
  const paths = geometryPaths(
    layout.features.find((f) => f.properties.role === "trace")!.geometry,
  );
  const shared =
    timing.start && timing.finish && equal(timing.start, timing.finish);
  const entries = shared
    ? [["start_finish", timing.start] as const]
    : ([
        ["start", timing.start],
        ["finish", timing.finish],
      ] as const);
  return entries.flatMap(([role, point]) => {
    if (!point) return [];
    const gate = paths
      .map((path) => localGate(point, path, 50))
      .sort((a, b) => a.anchor.displacementM - b.anchor.displacementM)[0];
    return gate.coordinates
      ? [{ role, point, coordinates: gate.coordinates }]
      : [];
  });
}

export function timingAvailability(timing?: TimingGps) {
  return { start: !!timing?.start, finish: !!timing?.finish };
}
