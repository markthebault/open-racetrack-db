import { z } from "zod";

import { borderLimits, type Layout } from "../schemas/data";
import { sequenceApproachEdges } from "./source-sequence-plan";
import { sharedGroundBoundaries } from "./shared-ground-data";

const point = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const path = z.array(point).min(2).max(borderLimits.pointsPerPath);
export const bordersSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z
      .array(
        z.object({
          type: z.literal("Feature"),
          properties: z.object({ role: z.enum(["inner", "outer"]) }),
          geometry: z.discriminatedUnion("type", [
            z.object({ type: z.literal("LineString"), coordinates: path }),
            z.object({
              type: z.literal("MultiLineString"),
              coordinates: z
                .array(path)
                .min(1)
                .max(borderLimits.pathsPerFeature),
            }),
          ]),
        }),
      )
      .length(2),
  })
  .refine(
    (data) => new Set(data.features.map((f) => f.properties.role)).size === 2,
    "Expected one inner and one outer border",
  );
export type TrackBorders = z.infer<typeof bordersSchema>;
export function borderLabels(layout?: Layout) {
  const width=layout?.features.find(f=>f.properties.role==="inner"&&"edgeConvention"in f.properties);
  if(width&&"edgeConvention"in width.properties&&width.properties.edgeConvention==="left-right")return {inner:"Left",outer:"Right"};
  return layout?.metadata.borderComposition ||
    (layout?.metadata.model3d?.kind === "run" && layout.metadata.model3d.sourceSequence)
    ? { inner: "Inner / left", outer: "Outer / right" }
    : layout?.metadata.borderInference?.edgeConvention ===
        "left-right-along-trace"
      ? { inner: "Left", outer: "Right" }
      : { inner: "Inner", outer: "Outer" };
}

export function bordersFromLayout(layout: Layout): TrackBorders | undefined {
  const features = layout.features.filter(
    (f) => f.properties.role === "inner" || f.properties.role === "outer",
  );
  if (!features.length) return;
  if (layout.metadata.model3d?.kind !== "surface" && layout.metadata.model3d?.sharedGround) {
    const ground = sharedGroundBoundaries(layout);
    return bordersSchema.parse({ type: "FeatureCollection", features: features.map((f) => ({
      ...f, geometry: f.properties.role === "inner"
        ? { type: "MultiLineString", coordinates: ground.inner }
        : { type: "LineString", coordinates: ground.outer },
    })) });
  }
  const approach = sequenceApproachEdges(layout);
  return bordersSchema.parse({ type: "FeatureCollection", features: approach.length
    ? features.map((f) => ({ ...f, geometry: { type: "MultiLineString", coordinates: [
      ...(f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates),
      approach[f.properties.role === "inner" ? 0 : 1],
    ] } })) : features });
}

export class BorderOverlay {
  private data?: TrackBorders;
  private enabled = false;
  private estimated = false;
  private widthBased=false;
  private unavailableReason?:string;
  private sharedGround = false;

  constructor(
    private button: HTMLButtonElement,
    private legend: HTMLElement,
    private changed: (borders?: TrackBorders) => void,
  ) {
    button.addEventListener("click", () => {
      this.enabled = !this.enabled;
      this.refresh();
    });
  }

  setLayout(layout?: Layout) {
    this.data = layout ? bordersFromLayout(layout) : undefined;
    this.unavailableReason=layout?.metadata.lineUnavailableReason;
    this.estimated =
      !!layout?.metadata.borderInference ||
      !!layout?.metadata.borderComposition || !!(layout && sequenceApproachEdges(layout).length);
    this.widthBased=!!layout?.features.some(f=>f.properties.role==='inner'&&'widthM'in f.properties);
    this.sharedGround = layout?.metadata.model3d?.kind !== "surface" && !!layout?.metadata.model3d?.sharedGround;
    const labels = borderLabels(layout);
    this.button.querySelector("[data-border-label]")!.textContent = layout
      ?.metadata.borderComposition
      ? "Road limits"
      : `${labels.inner} & ${labels.outer.toLowerCase()} lines`;
    this.legend.querySelector(".inner-key")!.textContent = labels.inner;
    this.legend.querySelector(".outer-key")!.textContent = labels.outer;
    this.button.parentElement!.hidden = !layout;
    this.refresh();
  }

  setEnabled(enabled:boolean){this.enabled=enabled;this.refresh();}
  private refresh() {
    this.button.disabled = !this.data;
    this.button.title = this.data
      ? this.widthBased ? "Estimated constant-width offsets from the mapped trace; not measured road edges" : this.sharedGround ? "Original borders with an image-reviewed junction correction; positions remain estimates" : this.estimated
        ? "Estimated aerial-image borders; not manually reviewed"
        : "Show or hide inner and outer lines"
      : this.unavailableReason ?? "Lines unavailable for this layout";
    this.button.setAttribute(
      "aria-pressed",
      String(this.enabled && !!this.data),
    );
    const visible = this.enabled ? this.data : undefined;
    this.changed(visible);
    this.legend.hidden = !visible;
  }
}
