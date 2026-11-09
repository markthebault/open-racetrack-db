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
    this.root.hidden = !layout?.features.some(
      (f) => f.properties.role === "ideal",
    );
    this.draw();
  }
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
    button.disabled = false;
    const unverified=feature?.properties.role==='ideal'&&feature.properties.qualification==='unverified-source-geometry';
    this.root.querySelector('span')!.textContent=unverified?'Unverified source geometry':'Estimated · dry conditions';
    button.title = unverified?'Estimated from draft source geometry; physical road edges are unverified':'Show the estimated ideal line';
    this.changed(active);
    if (active && feature && !this.in3D) {
      for (const path of geometryPaths(feature.geometry))
        L.polyline(
          path.map((p) => [p[1], p[0]] as L.LatLngTuple),
          { color: "#e6a318", weight: 3, className: "ideal-line" },
        )
          .bindTooltip(unverified?'Ideal line · unverified source geometry':'Ideal line · estimated')
          .addTo(this.group);
      this.group.addTo(this.map);
    }
  }
}
