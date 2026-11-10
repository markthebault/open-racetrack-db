import L from "leaflet";
import { geometryPaths, type Layout } from "../schemas/data";
export class IdealOverlay {
  private group = L.layerGroup();
  private layout?: Layout;
  private enabled = false;
  private in3D = false;
  constructor(
    private root: HTMLElement,
    private map: L.Map,
    private changed: (active: boolean) => void,
  ) {
    root.className = "ideal-controls";
    root.hidden = true;
    root.innerHTML =
      '<button id="ideal-toggle" aria-pressed="false">Ideal line</button><span>Estimated · dry conditions</span>';
    root.querySelector("button")!.onclick = () => {
      this.enabled = !this.enabled;
      this.draw();
    };
  }
  setLayout(layout?: Layout) {
    this.layout = layout;
    const width = layout?.features.find(
      (f) => f.properties.role === "inner" && "widthM" in f.properties,
    );
    this.root.querySelector("span")!.textContent =
      width && "widthM" in width.properties
        ? `Width ${width.properties.widthM.toFixed(1)} m · Calculated in browser`
        : "Estimated · dry conditions";
    this.root.hidden = !layout;
    if (layout && !layout.features.some((f) => f.properties.role === "ideal"))
      this.root.querySelector("span")!.textContent =
        layout.metadata.lineUnavailableReason ?? "Unavailable for this layout";
    this.draw();
  }
  setEnabled(enabled:boolean){this.enabled=enabled;this.draw();}
  setView(is3D: boolean) {
    this.in3D = is3D;
    this.draw();
  }
  private draw() {
    this.group.clearLayers();
    this.group.remove();
    const feature = this.layout?.features.find(
      (f) => f.properties.role === "ideal",
    );
    const active = this.enabled && !!feature;
    const button = this.root.querySelector("button")!;
    button.setAttribute("aria-pressed", String(active));
    button.disabled = !feature;
    button.title = feature
      ? "Show the estimated ideal line"
      : (this.layout?.metadata.lineUnavailableReason ??
        "Ideal line unavailable for this layout");
    this.changed(active);
    if (active && feature && !this.in3D) {
      for (const path of geometryPaths(feature.geometry))
        L.polyline(
          path.map((p) => [p[1], p[0]] as L.LatLngTuple),
          {
            color: "#e6a318",
            weight: 3,
            smoothFactor: 0,
            className: "ideal-line",
          },
        )
          .bindTooltip("Ideal line · estimated")
          .addTo(this.group);
      this.group.addTo(this.map);
    }
  }
}
