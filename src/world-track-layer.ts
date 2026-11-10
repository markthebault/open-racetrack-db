import L from "leaflet";
import {
  geometryPaths,
  validateTrack,
  layoutSchema,
  type Catalogue,
} from "../schemas/data";
type Venue = Catalogue["tracks"][number];
/** Viewport-only source outlines. No ideal-line workers, imagery, or bulk database download. */
export class WorldTrackLayer {
  private group = L.layerGroup();
  private active = false;
  private venues: Venue[] = [];
  private wanted = new Set<string>();
  private loaded = new Map<string, L.LayerGroup>();
  private running = new Map<string, AbortController>();
  private failed = new Set<string>();
  constructor(
    private map: L.Map,
    private load: (path: string, signal?: AbortSignal) => Promise<unknown>,
    private open: (id: string, layoutId: string) => void,
  ) {
    map.on("moveend zoomend", () => this.update());
  }
  setTracks(venues: Venue[]) {
    this.venues = venues;
    this.update();
  }
  setActive(active: boolean) {
    this.active = active;
    if (active) this.group.addTo(this.map);
    else this.group.remove();
    this.update();
  }
  private update() {
    const bounds = this.map.getBounds().pad(0.15),
      center = this.map.getCenter();
    const candidates =
      this.active && this.map.getZoom() >= 11
        ? this.venues
            .filter(
              (t) =>
                t.location &&
                t.traceCount &&
                bounds.contains([t.location[1], t.location[0]]),
            )
            .sort(
              (a, b) =>
                center.distanceTo([a.location![1], a.location![0]]) -
                center.distanceTo([b.location![1], b.location![0]]),
            )
            .slice(0, 40)
        : [];
    this.wanted = new Set(candidates.map((t) => t.id));
    for (const [id, controller] of this.running)
      if (!this.wanted.has(id)) controller.abort();
    for (const [id, layer] of this.loaded)
      if (this.wanted.has(id)) this.group.addLayer(layer);
      else this.group.removeLayer(layer);
    for (const venue of candidates) {
      if (this.running.size >= 3) break;
      if (
        this.loaded.has(venue.id) ||
        this.running.has(venue.id) ||
        this.failed.has(venue.id)
      )
        continue;
      void this.fetch(venue);
    }
  }
  private async fetch(venue: Venue) {
    const controller = new AbortController();
    this.running.set(venue.id, controller);
    try {
      const track = validateTrack(
        await this.load(venue.file, controller.signal),
      );
      const entry =
        track.layouts.find((l) => l.id === track.defaultLayoutId && l.file) ??
        track.layouts.find((l) => l.file);
      if (!entry?.file) {
        this.failed.add(venue.id);
        return;
      }
      const layout = layoutSchema.parse(
        await this.load(
          venue.file.replace(/track\.json$/, "") + entry.file,
          controller.signal,
        ),
      );
      if (controller.signal.aborted) return;
      const group = L.layerGroup();
      for (const feature of layout.features.filter(
        (f) => f.properties.role === "trace",
      ))
        for (const path of geometryPaths(feature.geometry)) {
          const line = L.polyline(
            path.map((p) => [p[1], p[0]] as L.LatLngTuple),
            {
              color: "#ffb347",
              weight: 3,
              opacity: 0.95,
              smoothFactor: 0.4,
              className: "world-track-outline",
            },
          );
          line.bindTooltip(venue.name);
          line.on("click", () => this.open(venue.id, entry.id));
          line.on("add", () =>
            line.getElement()?.setAttribute("data-track-id", venue.id),
          );
          group.addLayer(line);
        }
      this.loaded.set(venue.id, group);
      if (this.active && this.wanted.has(venue.id)) this.group.addLayer(group);
    } catch {
      if (!controller.signal.aborted) this.failed.add(venue.id);
    } finally {
      this.running.delete(venue.id);
      this.update();
    }
  }
}
