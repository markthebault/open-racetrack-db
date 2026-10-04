import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@fontsource-variable/manrope";
import "./style.css";
import brandMark from "./assets/mthrace-mark.svg";
import {
  indexSchema,
  validateTrack,
  validateLayout,
  geometryPaths,
  type Catalogue,
  type Track,
  type Layout,
} from "../schemas/data";
import { trimLoop, length, bounds, type Position } from "./geo";
import type { LayoutCoverage } from "./layout-coverage";
import {
  layoutGapResearchSchema,
  type LayoutGapResearch,
} from "./layout-gap-research";
import { localGate } from "./local-timing";
import { icon } from "./icons";
import { readPreferences, writePreferences } from "./preferences";
import type { Track3D } from "./track-3d";
import {
  elevationSchema,
  courseElevation,
  type ElevationGrid,
} from "./elevation";
import { elevationProfile } from "./elevation-profile";

const base = import.meta.env.BASE_URL;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <a class="skip-link" href="#workspace">Skip to track</a>
  <header class="site-header">
    <a class="brand" href="${base}" aria-label="Open Racetrack home">
      <img class="brand-mark" src="${brandMark}" alt="" aria-hidden="true">
      <span>Open Racetrack<span class="brand-sub">THE OPEN TRACK ATLAS</span></span>
    </a>
    <span class="header-caption">Explore circuits. Download open track data.</span>
    <a class="header-link" href="https://github.com/markthebault/open-racetrack-db" target="_blank" rel="noreferrer">Open source ${icon("external")}</a>
  </header>
  <main>
    <div id="browse-backdrop" class="browse-backdrop" hidden></div>
    <aside id="catalogue-panel" aria-label="Track catalogue">
      <div class="intro">
        <div class="intro-top"><span class="eyebrow">EXPLORE THE ATLAS</span><button id="close-browse" class="icon-button" aria-label="Close track search">${icon("close")}</button></div>
        <h1>A world of<br>racetracks<span>.</span></h1>
        <p>Explore real layouts, in 2D and 3D.</p>
        <div id="atlas-stats" class="atlas-stats"></div>
      </div>
      <section class="browse" aria-label="Find a track">
        <label for="search" class="sr-only">Search tracks</label>
        <div class="search-field">${icon("search")}<input id="search" type="search" autocomplete="off" placeholder="Search tracks or places"><kbd aria-hidden="true">/</kbd></div>
        <div class="filter-row"><label for="country" class="sr-only">Country</label><select id="country"><option value="">All countries</option></select><button id="reset" class="icon-button" aria-label="Reset filters" title="Reset filters">${icon("reset")}</button></div>
        <div class="browse-tabs" aria-label="Track lists"><button id="all-tracks" class="active" aria-pressed="true">All tracks</button><button id="saved-tracks" aria-pressed="false">${icon("bookmark")} Saved <span id="saved-count">0</span></button></div>
        <div class="browse-heading"><h2 id="list-heading">Start exploring</h2><span id="count" role="status"></span></div>
        <div id="venues" class="venues" aria-label="Tracks"></div>
        <button id="surprise" class="surprise-button">${icon("shuffle")} Surprise me ${icon("arrow")}</button>
      </section>
      <footer class="sidebar-footer">
        <button id="world-map" class="world-button">${icon("globe")} Explore the world map ${icon("arrow")}</button>
        <div id="coverage"></div>
        <p>Open data. Open to everyone.<br><a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">Database ODbL 1.0</a><span> · </span><a href="https://opensource.org/license/mit" target="_blank" rel="noreferrer">Code MIT</a></p>
      </footer>
    </aside>
    <section id="workspace" class="workspace" aria-label="Explore a circuit" tabindex="-1">
      <button id="open-browse" class="mobile-search">${icon("search")}<span>Find a track</span><span id="mobile-count"></span>${icon("chevron")}</button>
      <section class="map-area" aria-label="Interactive track view">
        <div id="map" aria-label="2D track map"></div>
        <div id="track-3d" hidden></div>
        <div class="stage-heading"><span id="stage-country" class="stage-eyebrow">THE WORLD OF MOTORSPORT</span><strong id="map-name">Choose your circuit.</strong><span id="stage-layout"></span></div>
        <div class="stage-toolbar">
          <div class="view-switch" aria-label="View mode"><button id="view-2d" aria-pressed="true">${icon("map")} 2D <span>map</span></button><button id="view-3d" aria-pressed="false">${icon("cube")} 3D <span>circuit</span></button></div>
          <button id="save-track" class="icon-button stage-button" aria-label="Save track" aria-pressed="false" title="Save track" disabled>${icon("bookmark")}</button>
          <button id="share-track" class="icon-button stage-button" aria-label="Share track" title="Share track" disabled>${icon("share")}</button>
        </div>
        <div id="stage-empty" class="stage-empty" hidden>${icon("map")}<strong>No course trace yet.</strong><p>This layout is listed, but its mapped route is still missing.</p></div>
        <div class="view-tools" aria-label="View controls"><button id="rotate-view" class="icon-button" aria-label="Rotate automatically" aria-pressed="false" title="Rotate automatically" hidden>${icon("rotate")}</button><button id="zoom-in" class="icon-button" aria-label="Zoom in" title="Zoom in">${icon("plus")}</button><button id="zoom-out" class="icon-button" aria-label="Zoom out" title="Zoom out">${icon("minus")}</button><button id="fit-view" class="icon-button" aria-label="Reset view" title="Reset view">${icon("fit")}</button></div>
        <button id="height-scale" class="height-scale" aria-pressed="true" title="Switch between natural height and exaggerated elevation" hidden>Height <strong>3×</strong><span>exaggerated</span></button>
        <div class="stage-footer"><span id="view-hint">Drag to explore · Scroll to zoom</span><span id="model-note"></span></div>
        <div id="course-credit" class="course-credit" hidden></div>
        <div id="tile-notice" class="view-notice" hidden>Background map unavailable. Track traces still work.</div>
        <div id="view-notice" class="view-notice" hidden></div>
        <div id="message" role="status" aria-live="polite"></div>
      </section>
      <section id="selection" class="selection" aria-label="Selected track"><p class="placeholder">Loading the atlas…</p></section>
    </section>
  </main>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="share-dialog" class="share-dialog"><form method="dialog"><button class="icon-button dialog-close" aria-label="Close share link">${icon("close")}</button></form><h2>Share this circuit</h2><p>This link opens the same layout and view.</p><label for="share-url">Track link</label><input id="share-url" readonly><button id="copy-link" class="button">${icon("share")} Copy link</button></dialog>`;

const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const preferences = readPreferences();
const saved = new Set(preferences.saved);
const initialParams = new URLSearchParams(location.search);
let view: "2d" | "3d" = initialParams.get("view") === "3d" ? "3d" : "2d";
let savedOnly = false,
  drawerOpen = false,
  rotating = false,
  unavailable3D = false;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobile = window.matchMedia(
  "(max-width: 760px), (max-width: 1100px) and (max-height: 550px)",
);
const config = {
  tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  trace: { color: "#ffb347", weight: 4.5, lineCap: "round" as const },
  outline: { color: "#29201b", weight: 9, opacity: 0.9 },
};
const map = L.map("map", { zoomControl: false }).setView([25, 12], 2);
const tiles = L.tileLayer(config.tiles, {
  attribution: config.attribution,
  maxZoom: 19,
  crossOrigin: true,
});
let tileErrors = false;
tiles.on("tileerror", () => {
  tileErrors = true;
  get("tile-notice").hidden = view === "3d";
});
tiles.on("load", () => {
  if (!tileErrors) get("tile-notice").hidden = true;
});
const markers = L.layerGroup().addTo(map),
  selectedLayers = L.layerGroup().addTo(map);
let layoutCoverage: LayoutCoverage | undefined,
  gapResearch: LayoutGapResearch | undefined;
let catalogue: Catalogue,
  track: Track | undefined,
  layout: Layout | undefined,
  layoutFile: string | undefined;
let selectedLayoutId: string | undefined,
  sequence = 0,
  abort: AbortController | undefined;
let viewer: Track3D | undefined, viewerPromise: Promise<void> | undefined;
let terrain: ElevationGrid | undefined;
let heightScale: 1 | 3 = initialParams.has("track")
  ? initialParams.get("height") === "1"
    ? 1
    : 3
  : (preferences.height ?? 3);
let currentGates: { role: string; coordinates: Position[]; note: string }[] =
  [];
const cache = new Map<string, unknown>();
let previews: Record<string, string> = {};
const venueButtons = new Map<string, HTMLButtonElement>();
const featured = [
  "be-spa-francorchamps",
  "de-nurburgring",
  "jp-suzuka-circuit-175231434",
  "it-monza",
  "gb-silverstone-circuit-3571477",
  "de-hockenheimring",
  "fr-paul-ricard",
];
const shortNames: Record<string, string> = {
  "be-spa-francorchamps": "Spa-Francorchamps",
  "de-nurburgring": "Nürburgring",
  "it-monza": "Monza",
  "fr-paul-ricard": "Paul Ricard",
};
type LocalTiming = {
  name: string;
  association?: "proximity-only";
  gates: { role: "start_finish" | "start" | "finish"; point: Position }[];
};
let localTiming: Record<string, LocalTiming> = {};
const clean = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  className?: string,
) => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
};
function message(text: string) {
  get("message").textContent = text;
  get("message").classList.toggle("ready", text === "Layout ready");
}
async function load(path: string, signal?: AbortSignal) {
  if (cache.has(path)) return cache.get(path);
  const response = await fetch(`${base}data/${path}`, { signal });
  if (!response.ok)
    throw new Error(`Could not load ${path}: HTTP ${response.status}`);
  const data = await response.json();
  cache.set(path, data);
  return data;
}
function remember() {
  return writePreferences({
    saved: [...saved],
    lastTrack: track?.id ?? preferences.lastTrack,
    lastLayout: selectedLayoutId ?? preferences.lastLayout,
    view,
    height: heightScale,
  });
}
let toastTimer: ReturnType<typeof setTimeout>;
function toast(text: string) {
  clearTimeout(toastTimer);
  get("toast").textContent = text;
  get("toast").hidden = false;
  toastTimer = setTimeout(() => {
    get("toast").hidden = true;
  }, 2800);
}
function urlState(trackId?: string, layoutId?: string, replace = false) {
  const url = new URL(location.href);
  for (const key of ["track", "layout", "view", "height"])
    url.searchParams.delete(key);
  if (trackId) url.searchParams.set("track", trackId);
  if (layoutId) url.searchParams.set("layout", layoutId);
  if (view === "3d" && trackId) url.searchParams.set("view", "3d");
  if (view === "3d" && trackId && heightScale === 1)
    url.searchParams.set("height", "1");
  if (url.href !== location.href)
    history[replace ? "replaceState" : "pushState"]({}, "", url);
}
function updateSaved() {
  get("saved-count").textContent = String(saved.size);
  const button = get<HTMLButtonElement>("save-track"),
    active = !!track && saved.has(track.id);
  button.disabled = !track;
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute(
    "aria-label",
    active ? "Remove from saved tracks" : "Save track",
  );
  button.title = active ? "Remove from saved tracks" : "Save track";
  button.classList.toggle("saved", active);
}
function updateActive() {
  for (const [id, button] of venueButtons) {
    const active = id === track?.id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  updateSaved();
  get<HTMLButtonElement>("share-track").disabled = !track;
}
function drawPreview(container: HTMLElement, path: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(svg.namespaceURI, "path");
  line.setAttribute("d", path);
  svg.append(line);
  container.replaceChildren(svg);
}
function visible() {
  const query = clean(get<HTMLInputElement>("search").value.trim()),
    country = get<HTMLSelectElement>("country").value;
  return catalogue.tracks
    .filter(
      (t) =>
        (!savedOnly || saved.has(t.id)) &&
        (!country || t.country.code === country) &&
        clean(
          [t.name, ...t.aliases, t.locality ?? "", t.country.name].join(" "),
        ).includes(query),
    )
    .sort((a, b) => {
      if (!query && !country && !savedOnly) {
        const aRank = featured.indexOf(a.id),
          bRank = featured.indexOf(b.id);
        if (aRank >= 0 || bRank >= 0)
          return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
      }
      return a.name.localeCompare(b.name);
    });
}
function renderCatalogue() {
  if (!catalogue) return;
  const found = visible(),
    query = get<HTMLInputElement>("search").value.trim(),
    country = get<HTMLSelectElement>("country").value;
  get("count").textContent =
    `${found.length} ${found.length === 1 ? "track" : "tracks"}`;
  get("list-heading").textContent = savedOnly
    ? "Your saved tracks"
    : query || country
      ? "Search results"
      : "Start exploring";
  get<HTMLButtonElement>("reset").disabled = !query && !country && !savedOnly;
  get("all-tracks").classList.toggle("active", !savedOnly);
  get("all-tracks").setAttribute("aria-pressed", String(!savedOnly));
  get("saved-tracks").classList.toggle("active", savedOnly);
  get("saved-tracks").setAttribute("aria-pressed", String(savedOnly));
  const list = get("venues"),
    fragment = document.createDocumentFragment();
  venueButtons.clear();
  markers.clearLayers();
  for (const t of found) {
    const button = element("button", "", "venue");
    button.dataset.trackId = t.id;
    const silhouette = element("span", "", "venue-outline"),
      path = previews[t.id];
    if (path) drawPreview(silhouette, path);
    else silhouette.append(element("span", t.country.code));
    const text = element("span", "", "venue-text");
    text.append(
      element("span", t.name, "venue-name"),
      element(
        "span",
        `${t.country.name} · ${t.layoutCount} ${t.layoutCount === 1 ? "layout" : "layouts"}`,
        "venue-meta",
      ),
    );
    const arrow = element("span", "", "venue-arrow");
    arrow.innerHTML = icon(saved.has(t.id) ? "bookmark" : "chevron");
    button.append(silhouette, text, arrow);
    button.addEventListener("click", () => {
      closeBrowse();
      void select(t.id);
    });
    venueButtons.set(t.id, button);
    fragment.append(button);
    if (t.location) {
      const marker = L.circleMarker([t.location[1], t.location[0]], {
        radius: 4,
        color: "#ffc68f",
        weight: 1,
        fillColor: "#ee8853",
        fillOpacity: 0.85,
      });
      marker.bindTooltip(element("span", t.name));
      marker.on("click", () => void select(t.id));
      markers.addLayer(marker);
    }
  }
  if (!found.length) {
    const empty = element("div", "", "empty-list");
    empty.innerHTML = icon(savedOnly ? "bookmark" : "search");
    empty.append(
      element("strong", savedOnly ? "Nothing saved yet." : "No tracks found."),
      element(
        "p",
        savedOnly
          ? "Save a circuit with the bookmark button. Your list stays in this browser."
          : "Try another name or choose all countries.",
      ),
    );
    const reset = element(
      "button",
      savedOnly ? "Explore all tracks" : "Clear filters",
      "text-button",
    );
    reset.onclick = resetFilters;
    empty.append(reset);
    fragment.append(empty);
  }
  list.replaceChildren(fragment);
  updateActive();
}
function resetFilters() {
  get<HTMLInputElement>("search").value = "";
  get<HTMLSelectElement>("country").value = "";
  savedOnly = false;
  renderCatalogue();
}
function fitMap() {
  if (!layout) {
    const locations = visible().flatMap((t) =>
      t.location ? [L.latLng(t.location[1], t.location[0])] : [],
    );
    if (locations.length)
      map.fitBounds(L.latLngBounds(locations), {
        padding: [50, 60],
        maxZoom: 8,
        animate: false,
      });
    else map.setView([25, 12], 2, { animate: false });
    return;
  }
  const b = layout.bbox;
  map.fitBounds(
    [
      [b[1], b[0]],
      [b[3], b[2]],
    ],
    {
      paddingTopLeft: [45, mobile.matches ? 115 : 160],
      paddingBottomRight: [65, 60],
      maxZoom: 17,
      animate: false,
    },
  );
}
function fit() {
  if (view === "3d") viewer?.fit();
  else fitMap();
}
function unavailable() {
  unavailable3D = true;
  view = "2d";
  rotating = false;
  get("view-notice").textContent =
    "3D is unavailable on this device. You can explore the 2D map.";
  get("view-notice").hidden = false;
  void applyView();
  urlState(track?.id, selectedLayoutId, true);
}
async function applyView() {
  const is3d = view === "3d" && !!layout && !unavailable3D;
  get("view-2d").setAttribute("aria-pressed", String(!is3d));
  get("view-3d").setAttribute("aria-pressed", String(is3d));
  get<HTMLButtonElement>("view-3d").disabled = !layout || unavailable3D;
  get("map").hidden = is3d;
  get("track-3d").hidden = !is3d;
  document.querySelector(".map-area")!.classList.toggle("is-3d", is3d);
  get("rotate-view").hidden = !is3d;
  get("tile-notice").hidden = is3d || !tileErrors;
  get("view-hint").textContent = is3d
    ? mobile.matches
      ? "Drag to orbit · Pinch to zoom"
      : "Drag to orbit · Scroll to zoom"
    : mobile.matches
      ? "Drag to explore · Pinch to zoom"
      : "Drag to explore · Scroll to zoom";
  get("model-note").textContent = is3d
    ? terrain
      ? "Terrain elevation · estimated"
      : "Mapped course · Elevation unavailable"
    : "";
  get("height-scale").hidden = !is3d || !terrain;
  updateHeightControl();
  get("course-credit").hidden = !layout;
  get("course-credit").replaceChildren(
    document.createTextNode(layout?.metadata.attribution ?? ""),
  );
  if (is3d && terrain) {
    const credit = element("a", "Mapzen Terrain Tiles");
    credit.href =
      "https://github.com/tilezen/joerd/blob/master/docs/attribution.md";
    credit.target = "_blank";
    credit.rel = "noreferrer";
    credit.title = terrain.source.attribution.join(" ");
    get("course-credit").append(" · Terrain: ", credit);
  }
  get("course-credit").title = layout?.metadata.attribution ?? "";
  if (!is3d) {
    viewer?.setActive(false);
    if (!map.hasLayer(tiles)) tiles.addTo(map);
    map.invalidateSize({ animate: false });
    fitMap();
    return;
  }
  tiles.remove();
  if (!viewerPromise)
    viewerPromise = import("./track-3d")
      .then(({ Track3D: Viewer }) => {
        viewer = new Viewer(get("track-3d"), unavailable);
      })
      .catch(unavailable);
  await viewerPromise;
  if (view !== "3d" || !layout || !viewer || unavailable3D) return;
  viewer.setActive(true);
  viewer.setLayout(layout, currentGates, terrain, heightScale);
  viewer.setRotating(rotating);
}
function setView(next: "2d" | "3d") {
  if ((next === "3d" && (!layout || unavailable3D)) || next === view) return;
  view = next;
  rotating = false;
  get("rotate-view").setAttribute("aria-pressed", "false");
  get("rotate-view").innerHTML = icon("rotate");
  void applyView();
  remember();
  urlState(track?.id, selectedLayoutId);
}
function worldMap(push = true) {
  if (!catalogue) return;
  sequence++;
  abort?.abort();
  track = undefined;
  layout = undefined;
  layoutFile = undefined;
  selectedLayoutId = undefined;
  currentGates = [];
  terrain = undefined;
  selectedLayers.clearLayers();
  viewer?.clear();
  markers.addTo(map);
  view = "2d";
  get("map-name").textContent = "Explore the world.";
  get("stage-country").textContent = "THE OPEN TRACK ATLAS";
  get("stage-layout").textContent =
    `${catalogue.tracks.length} tracks across ${new Set(catalogue.tracks.map((t) => t.country.code)).size} countries`;
  get("stage-empty").hidden = true;
  get("selection").replaceChildren(
    element("h2", "Where do you want to drive?"),
    element(
      "p",
      "Choose a pin on the map, or search the catalogue to explore a circuit.",
      "world-intro",
    ),
  );
  updateActive();
  message("");
  void applyView();
  closeBrowse();
  if (push) urlState();
}
function drawGate(
  role: string,
  coords: Position[],
  note: string,
  dashed: boolean,
) {
  const label =
      role === "start_finish"
        ? "Start / finish"
        : role === "start"
          ? "Start"
          : "Finish",
    color = role === "finish" ? "#de5b5b" : "#19a28a";
  L.polyline(
    coords.map((p) => [p[1], p[0]] as L.LatLngTuple),
    { color, weight: 4, dashArray: dashed ? "5 4" : undefined },
  )
    .bindTooltip(element("span", note))
    .addTo(selectedLayers);
  const center: L.LatLngTuple = [
    (coords[0][1] + coords[1][1]) / 2,
    (coords[0][0] + coords[1][0]) / 2,
  ];
  L.circleMarker(center, { radius: 5, color, fillOpacity: 1 })
    .bindTooltip(
      element(
        "span",
        `${label} · ${dashed ? "Estimated position" : "Verified position"}`,
      ),
      { permanent: true, direction: "right", className: "gate-label" },
    )
    .addTo(selectedLayers);
}
function draw(data: Layout, privateGates: typeof currentGates = []) {
  selectedLayers.clearLayers();
  for (const feature of data.features) {
    const paths = geometryPaths(feature.geometry),
      coords = paths.map((path) => path.map((p) => L.latLng(p[1], p[0])));
    if (feature.properties.role === "trace") {
      L.polyline(coords, config.outline).addTo(selectedLayers);
      L.polyline(coords, config.trace).addTo(selectedLayers);
    } else {
      const props = feature.properties;
      drawGate(
        props.role,
        paths[0],
        `${props.positionStatus} position; ${props.endpointMethod}`,
        props.positionStatus === "estimated",
      );
    }
  }
  for (const gate of privateGates)
    drawGate(gate.role, gate.coordinates, gate.note, true);
  fitMap();
}
function sourceLinks(parent: HTMLElement, selected: Track, data?: Layout) {
  const details = element("details", "", "source-details");
  details.append(element("summary", "Sources & data"));
  for (const source of selected.sources) {
    const a = element("a", source.title);
    a.href = source.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    details.append(
      a,
      element(
        "p",
        `${source.license} · Retrieved ${source.retrievedAt.slice(0, 10)}`,
      ),
      element("p", source.evidenceNote),
    );
  }
  details.append(
    element(
      "p",
      data?.metadata.attribution ??
        "Source attribution is recorded with each mapped layout.",
    ),
    element(
      "p",
      "Approximate geographic traces, not surveyed centerlines. Database ODbL 1.0.",
    ),
  );
  parent.append(details);
}
function addCoverage(parent: HTMLElement, selected: Track) {
  const reference = layoutCoverage?.venues.find(
    (v) => v.trackId === selected.id,
  );
  if (!reference) return;
  const details = element("details", "", "layout-gaps");
  details.append(element("summary", "Layout coverage"));
  details.append(
    element(
      "p",
      `${reference.actualLayoutCount} entries · ${reference.actualTraceCount} traces · ${reference.expectedRecordCount} associated reference records · ${reference.mappedRecordCount} named draft matches`,
    ),
    element(
      "p",
      "GPS-based venue associations need review. Matching counts alone does not confirm the course configurations.",
    ),
  );
  const records = layoutCoverage!.records.filter(
      (r) => r.trackId === selected.id,
    ),
    list = element("ul", "");
  for (const r of records)
    list.append(
      element(
        "li",
        `${r.name}: ${r.status === "draft-mapped" ? (r.layoutIds.length > 1 ? "multiple traces claim this record; configuration review needed" : "draft trace available") : r.status === "out-of-scope" ? "outside car and motorcycle circuit scope" : "route identification pending"}`,
      ),
    );
  details.append(list);
  if (!records.length)
    details.append(
      element("p", "No reference record has been associated with this venue."),
    );
  if (reference.unassociatedLayoutIds.length)
    details.append(
      element(
        "p",
        "Additional mapped courses without a catalogue association: " +
          reference.unassociatedLayoutIds.join(", "),
      ),
    );
  parent.append(details);
}
function panel(
  selected: Track,
  requested: string,
  state: "loading" | "ready" | "error" | "missing",
  error?: string,
  privateNotes: string[] = [],
) {
  const root = get("selection");
  root.replaceChildren();
  const heading = element("div", "", "selection-heading");
  heading.append(
    element("h2", selected.name),
    element(
      "p",
      [selected.country.name, selected.locality].filter(Boolean).join(" · "),
      "locality",
    ),
  );
  const headingRow = element("div", "", "selection-top");
  headingRow.append(heading);
  if (state === "ready" && layout)
    headingRow.append(
      element(
        "span",
        layout.metadata.geometryStatus === "draft"
          ? "Draft trace"
          : "Reviewed trace",
        "badge",
      ),
    );
  root.append(headingRow);
  const row = element("div", "", "selection-main"),
    field = element("div", "", "layout-field");
  const label = element("label", "Layout");
  label.htmlFor = "layout";
  const control = element("select", "");
  control.id = "layout";
  for (const group of [
    {
      name: "Catalogue layouts",
      layouts: selected.layouts.filter((l) => l.referenceId),
    },
    {
      name: "Additional mapped courses",
      layouts: selected.layouts.filter((l) => !l.referenceId),
    },
  ]) {
    if (!group.layouts.length) continue;
    const options = element("optgroup", "");
    options.label = group.name;
    for (const l of group.layouts) {
      const option = element("option", l.name);
      option.value = l.id;
      options.append(option);
    }
    control.append(options);
  }
  control.value = requested;
  control.addEventListener(
    "change",
    () => void select(selected.id, control.value),
  );
  field.append(label, control);
  row.append(field);
  root.append(row);
  if (state === "loading")
    root.append(
      element(
        "p",
        `Loading ${selected.layouts.find((l) => l.id === requested)?.name}…`,
        "loading",
      ),
    );
  if (state === "error") {
    root.append(element("p", error ?? "Data could not load", "error"));
    const retry = element("button", "Retry layout", "button");
    retry.onclick = () => void select(selected.id, requested, false);
    root.append(retry);
    return;
  }
  const notes = element("details", "", "track-notes"),
    summary = element("summary", "");
  summary.innerHTML = `${icon("info")} Track notes & sources <span>View details</span>`;
  notes.append(summary);
  const content = element("div", "", "notes-content");
  notes.append(content);
  if (state === "missing") {
    const selectedLayout = selected.layouts.find((l) => l.id === requested)!,
      review = gapResearch?.records.find(
        (r) =>
          r.trackId === selected.id &&
          r.layoutId === requested &&
          r.referenceId === selectedLayout.referenceId,
      );
    root.append(
      element("span", "Trace unavailable", "badge unavailable"),
      element(
        "p",
        review?.publicExplanation ??
          selectedLayout.missingGeometryReason ??
          "Independent course geometry is still needed.",
        "note missing-note",
      ),
    );
    if (review?.research) {
      const details = element("details", "", "gap-research");
      details.append(
        element("summary", "Mapping research"),
        element(
          "p",
          `Sources checked ${review.research.reviewedAt}. Course mapping remains incomplete.`,
        ),
      );
      const list = element("ul", "");
      for (const url of review.research.evidenceUrls) {
        const link = element("a", new URL(url).hostname);
        link.href = url;
        link.target = "_blank";
        link.rel = "noreferrer";
        const item = element("li", "");
        item.append(link);
        list.append(item);
      }
      details.append(list);
      content.append(details);
    }
  }
  if (state === "ready" && layout) {
    const m = layout.metadata,
      stats = element("div", "", "stats"),
      len = element("div", ""),
      type = element("div", "");
    len.append(
      element(
        "span",
        m.geometryKind === "network"
          ? "Mapped branch length"
          : "Approx. trace length",
      ),
      element("strong", `${(m.lengthM / 1000).toFixed(2)} km`),
    );
    type.append(
      element("span", "Route type"),
      element(
        "strong",
        m.geometryKind === "network"
          ? "Track network"
          : m.closed
            ? "Closed circuit"
            : "Point-to-point",
      ),
    );
    stats.append(len, type);
    row.append(stats);
    const download = element("a", "", "button download-button");
    download.innerHTML = `${icon("download")} <span>GeoJSON</span> ${icon("arrow")}`;
    download.id = "download";
    download.setAttribute("aria-label", "Download GeoJSON");
    download.href = `${base}data/${layoutFile}`;
    download.download = `${selected.id}-${requested}.geojson`;
    row.append(download);
    const description = selected.layouts.find(
      (l) => l.id === requested,
    )?.description;
    if (description) content.append(element("p", description, "note"));
    for (const note of m.notes)
      if (note !== description) content.append(element("p", note, "note"));
    if (!privateNotes.length && m.timingStatus === "missing")
      content.append(
        element(
          "p",
          m.timingMode === "shared"
            ? "Start/finish position not yet verified"
            : "Start and finish positions not yet verified",
          "note",
        ),
      );
    for (const note of privateNotes)
      content.append(element("p", note, "note local-note"));
    for (const gate of layout.features.filter(
      (f) => f.properties.role !== "trace",
    )) {
      const p = gate.properties;
      if ("positionStatus" in p)
        content.append(
          element(
            "p",
            `${p.role.replace("_", " / ")}: ${p.positionStatus}; ${p.endpointMethod}. ${p.positionNote}`,
            "note",
          ),
        );
    }
    if (privateNotes.length)
      content.append(
        element(
          "p",
          "Download contains the reusable source trace. Local reference timing is excluded.",
          "download-note",
        ),
      );
    if (m.timingStatus === "missing")
      content.prepend(
        element(
          "p",
          "Timing gates have not been verified for this layout.",
          "note",
        ),
      );
    if (terrain) {
      const profile = courseElevation(layout, terrain);
      if (profile)
        root.append(elevationProfile(profile, m.geometryKind === "network"));
      const detail = element("details", "", "elevation-sources");
      detail.append(element("summary", "Elevation data"));
      detail.append(
        element(
          "p",
          `Approximate ground elevation from Mapzen Terrain Tiles, sampled to a ~${terrain.source.sampleSpacingM} m grid. Source resolution varies. This is not a survey of the track surface, bridges or banking.`,
        ),
      );
      const link = element("a", "Terrain sources & attribution");
      link.href =
        "https://github.com/tilezen/joerd/blob/master/docs/attribution.md";
      link.target = "_blank";
      link.rel = "noreferrer";
      detail.append(link);
      for (const credit of terrain.source.attribution)
        detail.append(element("p", credit));
      content.append(detail);
    }
  }
  sourceLinks(content, selected, state === "ready" ? layout : undefined);
  addCoverage(content, selected);
  root.append(notes);
}

async function select(id: string, requested?: string, push = true) {
  const current = ++sequence;
  abort?.abort();
  abort = new AbortController();
  const signal = abort.signal;
  selectedLayers.clearLayers();
  viewer?.clear();
  layout = undefined;
  layoutFile = undefined;
  currentGates = [];
  terrain = undefined;
  get("height-scale").hidden = true;
  selectedLayoutId = undefined;
  get("stage-empty").hidden = true;
  get<HTMLButtonElement>("view-3d").disabled = true;
  message("Loading track…");
  const entry = catalogue.tracks.find((t) => t.id === id);
  if (!entry) {
    worldMap(false);
    urlState(undefined, undefined, true);
    message("Unknown track. Choose one from the catalogue.");
    return;
  }
  track = undefined;
  markers.remove();
  updateActive();
  get("selection").replaceChildren(element("p", "Loading track…", "loading"));
  get("map-name").textContent = shortNames[id] ?? entry.name;
  get("stage-country").textContent = entry.country.name.toUpperCase();
  get("stage-layout").textContent = "";
  try {
    const selected = validateTrack(await load(entry.file, signal));
    if (current !== sequence) return;
    track = selected;
    const valid = selected.layouts.some((l) => l.id === requested),
      layoutId = valid ? requested! : selected.defaultLayoutId;
    selectedLayoutId = layoutId;
    if (push) urlState(id, layoutId);
    if (requested && !valid) {
      urlState(id, layoutId, true);
      toast("Unknown layout. Showing the default layout.");
    }
    const selectedLayout = selected.layouts.find((l) => l.id === layoutId)!;
    panel(selected, layoutId, "loading");
    get("stage-layout").textContent = selectedLayout.name;
    updateActive();
    remember();
    if (selectedLayout.file === null) {
      view = "2d";
      panel(selected, layoutId, "missing");
      message("Trace unavailable");
      urlState(id, layoutId, true);
      await applyView();
      if (current !== sequence) return;
      const timing = localTiming[`${id}/${layoutId}`];
      if (timing) {
        const points: L.LatLngTuple[] = [];
        for (const gate of timing.gates) {
          const p: L.LatLngTuple = [gate.point[1], gate.point[0]];
          points.push(p);
          L.circleMarker(p, { radius: 6, color: "#19a28a", fillOpacity: 1 })
            .bindTooltip(element("span", gate.role.replace("_", " / ")), {
              permanent: true,
              direction: "right",
            })
            .addTo(selectedLayers);
        }
        if (points.length)
          map.fitBounds(L.latLngBounds(points), {
            padding: [70, 70],
            maxZoom: 17,
            animate: false,
          });
      } else if (selected.location)
        map.setView([selected.location[1], selected.location[0]], 14, {
          animate: false,
        });
      else get("stage-empty").hidden = false;
      return;
    }
    const file = entry.file.replace(/track\.json$/, "") + selectedLayout.file;
    const [raw, elevation] = await Promise.all([
      load(file, signal),
      load(`elevation/${id}.json`, signal)
        .then((value) => elevationSchema.parse(value))
        .catch(() => undefined),
    ]);
    const data = validateLayout(raw, selected, layoutId);
    if (current !== sequence) return;
    layout = data;
    layoutFile = file;
    const timing = localTiming[`${id}/${layoutId}`],
      notes: string[] = [],
      privateLines: typeof currentGates = [];
    if (timing) {
      const paths = geometryPaths(data.features[0].geometry),
        trace = paths[0],
        anchors = new Map<string, ReturnType<typeof localGate>["anchor"]>();
      for (const gate of timing.gates) {
        const { anchor, coordinates } = paths
          .map((path) => localGate(gate.point, path))
          .sort((a, b) => a.anchor.displacementM - b.anchor.displacementM)[0];
        if (!coordinates) {
          notes.push(
            `${gate.role.replace("_", " / ")}: local GPS reference is ${anchor.displacementM.toFixed(0)} m from this layout. Gate hidden pending alignment review.`,
          );
          continue;
        }
        anchors.set(gate.role, anchor);
        privateLines.push({
          role: gate.role,
          coordinates,
          note: `Local timing reference. Estimated position; generated 25 m endpoints. ${anchor.displacementM.toFixed(1)} m from source trace.`,
        });
        notes.push(
          `${gate.role === "start_finish" ? "Start / finish" : gate.role === "start" ? "Start" : "Finish"}: local timing reference, ${anchor.displacementM.toFixed(1)} m from source trace. Estimated position; 25 m display endpoints.`,
        );
      }
      if (timing.association === "proximity-only")
        notes.push(
          "This private timing reference was matched by GPS proximity. Association with this course configuration is unverified.",
        );
      notes.push(
        "Private preview timing has not been independently verified for public redistribution.",
      );
      if (
        data.metadata.geometryKind !== "network" &&
        timing.gates.some((g) => g.role === "finish") &&
        anchors.has("start") &&
        anchors.has("finish")
      ) {
        const trimmed = trimLoop(
          trace,
          anchors.get("start")!,
          anchors.get("finish")!,
        );
        layout = structuredClone(data);
        layout.features[0].geometry.coordinates = trimmed;
        layout.metadata.closed = false;
        layout.metadata.lengthM = length(trimmed);
        layout.bbox = bounds(trimmed);
        notes.push(
          `Preview trace trimmed at the projections of the local gates. Public download remains the full reusable supporting ${data.metadata.closed ? "loop" : "route"}.`,
        );
      }
    }
    currentGates = privateLines;
    if (elevation?.trackId === id && courseElevation(layout, elevation))
      terrain = elevation;
    draw(layout, privateLines);
    panel(selected, layoutId, "ready", undefined, notes);
    message("Layout ready");
    void applyView();
    remember();
  } catch (error) {
    if (current !== sequence || signal.aborted) return;
    selectedLayers.clearLayers();
    viewer?.clear();
    layout = undefined;
    layoutFile = undefined;
    get<HTMLButtonElement>("view-3d").disabled = true;
    message("Track data could not load.");
    if (track?.id === id)
      panel(track, requested ?? track.defaultLayoutId, "error", String(error));
    else {
      get("selection").replaceChildren(element("p", String(error), "error"));
      const retry = element("button", "Retry track", "button");
      retry.onclick = () => void select(id, requested, push);
      get("selection").append(retry);
    }
  }
}

function openBrowse() {
  if (mobile.matches) {
    drawerOpen = true;
    get("catalogue-panel").classList.add("open");
    get("catalogue-panel").setAttribute("role", "dialog");
    get("catalogue-panel").setAttribute("aria-modal", "true");
    get("catalogue-panel").inert = false;
    get("browse-backdrop").hidden = false;
    get("workspace").inert = true;
    document.body.classList.add("drawer-open");
  }
  get("catalogue-panel").getBoundingClientRect();
  get<HTMLInputElement>("search").focus({ preventScroll: true });
}
function closeBrowse() {
  if (!drawerOpen) return;
  drawerOpen = false;
  get("catalogue-panel").classList.remove("open");
  get("catalogue-panel").removeAttribute("role");
  get("catalogue-panel").removeAttribute("aria-modal");
  get("catalogue-panel").inert = mobile.matches;
  get("browse-backdrop").hidden = true;
  get("workspace").inert = false;
  document.body.classList.remove("drawer-open");
  get("open-browse").focus({ preventScroll: true });
}
mobile.addEventListener("change", () => {
  closeBrowse();
  get("catalogue-panel").inert = mobile.matches;
  map.invalidateSize({ animate: false });
  fit();
});
get("catalogue-panel").inert = mobile.matches;
get("open-browse").onclick = openBrowse;
get("close-browse").onclick = closeBrowse;
function updateHeightControl() {
  get("height-scale").innerHTML =
    `Height <strong>${heightScale}×</strong><span>${heightScale === 3 ? "exaggerated" : "natural"}</span>`;
  get("height-scale").setAttribute("aria-pressed", String(heightScale === 3));
}
get("height-scale").onclick = () => {
  heightScale = heightScale === 3 ? 1 : 3;
  updateHeightControl();
  if (layout) viewer?.setLayout(layout, currentGates, terrain, heightScale);
  remember();
  urlState(track?.id, selectedLayoutId, true);
};
get("browse-backdrop").onclick = closeBrowse;
document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement,
    typing =
      /INPUT|SELECT|TEXTAREA/.test(target.tagName) || target.isContentEditable;
  if (
    event.key === "/" &&
    !typing &&
    !get<HTMLDialogElement>("share-dialog").open
  ) {
    event.preventDefault();
    openBrowse();
  }
  if (event.key === "Escape" && drawerOpen) {
    event.preventDefault();
    closeBrowse();
  }
  if (event.key === "Tab" && drawerOpen) {
    const controls = [
        ...get("catalogue-panel").querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, a[href], summary",
        ),
      ].filter((e) => e.getClientRects().length > 0),
      first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});
get("search").addEventListener("input", renderCatalogue);
get("country").addEventListener("change", renderCatalogue);
get("reset").onclick = resetFilters;
get("all-tracks").onclick = () => {
  savedOnly = false;
  renderCatalogue();
};
get("saved-tracks").onclick = () => {
  savedOnly = true;
  renderCatalogue();
};
get("world-map").onclick = () => worldMap();
get("surprise").onclick = () => {
  const candidates = visible().filter(
    (t) => t.traceCount > 0 && t.id !== track?.id,
  );
  if (!candidates.length) {
    toast("No other mapped tracks in this list.");
    return;
  }
  closeBrowse();
  void select(candidates[Math.floor(Math.random() * candidates.length)].id);
};
get("save-track").onclick = () => {
  if (!track) return;
  const removing = saved.has(track.id);
  if (removing) saved.delete(track.id);
  else saved.add(track.id);
  const stored = remember();
  toast(
    removing
      ? "Removed from saved tracks."
      : stored
        ? "Saved in this browser."
        : "Saved for this visit. Browser storage is unavailable.",
  );
  renderCatalogue();
};
get("view-2d").onclick = () => setView("2d");
get("view-3d").onclick = () => setView("3d");
get("fit-view").onclick = fit;
get("zoom-in").onclick = () =>
  view === "3d" ? viewer?.zoom(0.8) : map.zoomIn();
get("zoom-out").onclick = () =>
  view === "3d" ? viewer?.zoom(1.25) : map.zoomOut();
get("rotate-view").onclick = () => {
  rotating = !rotating;
  viewer?.setRotating(rotating);
  get("rotate-view").setAttribute("aria-pressed", String(rotating));
  get("rotate-view").setAttribute(
    "aria-label",
    rotating ? "Stop automatic rotation" : "Rotate automatically",
  );
  get("rotate-view").title = rotating
    ? "Stop automatic rotation"
    : "Rotate automatically";
  get("rotate-view").innerHTML = icon(rotating ? "pause" : "rotate");
};
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) {
    rotating = false;
    viewer?.setRotating(false);
    get("rotate-view").setAttribute("aria-pressed", "false");
    get("rotate-view").innerHTML = icon("rotate");
  }
});
get("share-track").onclick = () => {
  const input = get<HTMLInputElement>("share-url");
  input.value = location.href;
  get<HTMLDialogElement>("share-dialog").showModal();
  input.focus();
  input.select();
};
get("copy-link").onclick = async () => {
  try {
    await navigator.clipboard.writeText(
      get<HTMLInputElement>("share-url").value,
    );
    get<HTMLDialogElement>("share-dialog").close();
    toast("Track link copied.");
  } catch {
    get<HTMLInputElement>("share-url").select();
    toast("Select the link and copy it.");
  }
};

async function restore(initial = false) {
  resetFilters();
  const params = new URLSearchParams(location.search);
  if (params.has("track")) {
    view = params.get("view") === "3d" ? "3d" : "2d";
    heightScale = params.get("height") === "1" ? 1 : 3;
    await select(
      params.get("track")!,
      params.get("layout") ?? undefined,
      false,
    );
  } else if (initial) {
    const id = catalogue.tracks.some((t) => t.id === preferences.lastTrack)
      ? preferences.lastTrack!
      : "be-spa-francorchamps";
    await select(
      id,
      id === preferences.lastTrack ? preferences.lastLayout : undefined,
      false,
    );
    urlState(track?.id, selectedLayoutId, true);
  } else worldMap(false);
}
window.addEventListener("popstate", () => void restore());
async function boot() {
  try {
    const [index, coverage, research, timing] = await Promise.allSettled([
      load("index.json"),
      load("layout-coverage.json"),
      load("layout-gap-research.json"),
      fetch(`${base}local/timing.json`).then(async (response) =>
        response.ok && response.headers.get("content-type")?.includes("json")
          ? response.json()
          : {},
      ),
    ]);
    if (index.status === "rejected") throw index.reason;
    catalogue = indexSchema.parse(index.value);
    if (coverage.status === "fulfilled")
      layoutCoverage = coverage.value as LayoutCoverage;
    if (research.status === "fulfilled") {
      try {
        gapResearch = layoutGapResearchSchema.parse(research.value);
      } catch {
        /* Public mirrors can omit research. */
      }
    }
    if (timing.status === "fulfilled") localTiming = timing.value;
    for (const id of saved)
      if (!catalogue.tracks.some((t) => t.id === id)) saved.delete(id);
    const countries = [
      ...new Map(
        catalogue.tracks.map((t) => [t.country.code, t.country]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
    for (const country of countries) {
      const option = element("option", country.name);
      option.value = country.code;
      get("country").append(option);
    }
    const stat = (value: number, label: string) => {
      const item = element("span", "");
      item.append(element("strong", String(value)), element("span", label));
      return item;
    };
    get("atlas-stats").append(
      stat(catalogue.tracks.length, "tracks"),
      stat(countries.length, "countries"),
    );
    get("mobile-count").textContent = `${catalogue.tracks.length} tracks`;
    updateSaved();
    void import("./assets/track-previews.json")
      .then(({ default: data }) => {
        previews = data;
        for (const [id, button] of venueButtons)
          if (previews[id])
            drawPreview(
              button.querySelector<HTMLElement>(".venue-outline")!,
              previews[id],
            );
      })
      .catch(() => {
        /* Outlines are optional; the catalogue still works. */
      });
    await restore(true);
  } catch (error) {
    message("Catalogue could not load.");
    get("selection").replaceChildren(element("p", String(error), "error"));
    const retry = element("button", "Retry loading", "button");
    retry.onclick = () => location.reload();
    get("selection").append(retry);
  }
}
async function showCoverage() {
  if (!catalogue) return;
  try {
    const coverage = (await load("world-coverage.json")) as {
      countries: {
        country: { code: string; name: string };
        status: string;
        pending: number;
      }[];
      candidates: {
        country: string;
        name?: string;
        status: string;
        reason?: string;
        sourceReference?: string;
      }[];
    };
    const pending = coverage.candidates.filter((c) => c.status === "pending"),
      details = element("details", "", "coverage");
    details.append(
      element(
        "summary",
        `Coverage · ${coverage.countries.length} countries & territories`,
      ),
      element(
        "p",
        "Coverage is in progress. Draft course candidates do not establish every venue, named layout, or travel direction. Every catalogue category is included.",
      ),
    );
    const scroll = element("div", "", "coverage-table"),
      table = element("table", ""),
      head = element("tr", "");
    head.append(
      element("th", "Country"),
      element("th", "Status"),
      element("th", "Venues"),
      element("th", "Pending"),
    );
    table.append(head);
    for (const c of coverage.countries) {
      const row = element("tr", "");
      row.append(
        element("td", c.country.name),
        element(
          "td",
          c.status === "fetched"
            ? "Fetched"
            : c.status === "area-unavailable"
              ? "Area unavailable"
              : "Not fetched",
        ),
        element(
          "td",
          String(
            catalogue.tracks.filter((t) => t.country.code === c.country.code)
              .length,
          ),
        ),
        element("td", String(c.pending)),
      );
      table.append(row);
    }
    scroll.append(table);
    details.append(
      scroll,
      element(
        "p",
        `${pending.length} candidate groups or facilities await review. These can include out-of-scope facilities; this is not a count of missing road circuits.`,
      ),
    );
    const gaps = pending.filter(
      (c) =>
        c.name &&
        (c.sourceReference ||
          c.reason?.includes("Named facility") ||
          c.reason?.includes("Complex branching")),
    );
    if (gaps.length)
      details.append(
        element(
          "p",
          "Known source gaps: " +
            gaps.map((c) => `${c.name} (${c.country})`).join(", ") +
            ".",
        ),
      );
    for (const [label, href, filename] of [
      [
        "Download coverage inventory",
        `${base}data/world-coverage.json`,
        "world-coverage.json",
      ],
      [
        "Read the coverage report ↗",
        "https://github.com/markthebault/open-racetrack-db/blob/main/Docs/08-worldwide-coverage.md",
        "",
      ],
      [
        "Download reference layout gaps",
        `${base}data/layout-coverage.json`,
        "layout-coverage.json",
      ],
    ]) {
      const link = element("a", label);
      link.href = href;
      if (filename) link.download = filename;
      else {
        link.target = "_blank";
        link.rel = "noreferrer";
      }
      details.append(link);
    }
    get("coverage").append(details);
  } catch {
    /* Public mirrors may omit the inventory. */
  }
}
void boot().then(showCoverage);
