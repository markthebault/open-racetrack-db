import L from "leaflet";
import type { Layout } from "../schemas/data";
import { plane } from "./geo";
import {
  buildRoad,
  DEFAULT_CAR,
  formatLapTime,
  simulateLap,
} from "./lap-simulation";
import { fromMercator, LapScene, type LapCamera } from "./lap-scene";
import "./lap-player.css";

export function openLap(
  layout: Layout,
  context: {
    trackId: string;
    name: string;
    country: string;
    layoutName: string;
  },
  onClose: () => void,
) {
  const isRun = layout.metadata.model3d?.kind === "run";
  const previousFocus = document.activeElement as HTMLElement | null;
  const dialog = document.createElement("dialog");
  dialog.className = "lap-player";
  dialog.setAttribute("aria-label", `${context.name} lap simulator`);
  dialog.innerHTML = `<header class="lap-header"><div><span class="lap-kicker"></span><h2>Lap playback<span>.</span></h2></div><button class="lap-close" aria-label="Close lap simulator">×</button></header>
  <div class="lap-layout"><section class="lap-stage" aria-label="Lap playback"><div class="lap-canvas"></div><div class="lap-imagery" hidden></div>
  <div class="lap-telemetry"><div class="lap-speed"><strong data-speed>0</strong><span>km/h</span></div><div class="lap-telemetry-detail"><span data-corner>Generating track…</span><strong data-clock>0:00.00</strong><span data-forces>1× · Natural elevation</span></div></div>
  <div class="lap-map-card"><canvas width="220" height="180" class="lap-minimap" aria-label="Lap position. Click to jump to a section." role="img"></canvas><span data-distance>0.00 / 7.00 km</span></div>
  <div class="lap-camera" aria-label="Camera"><button data-camera="chase" aria-pressed="true">Chase</button><button data-camera="driver" aria-pressed="false">Driver</button><button data-camera="above" aria-pressed="false">Above</button><button data-camera="orbit" aria-pressed="false">Explore 3D</button><button data-camera="imagery" aria-pressed="false">Aerial image</button></div>
  <span class="lap-scale">1× elevation · Approximate reconstruction</span><span class="lap-imagery-credit"></span>
  <div class="lap-loading" role="status">Building track from coordinates and elevation…</div></section>
  <div class="lap-sidebar" role="complementary" aria-label="Car and track details"><div class="lap-section"><span class="lap-kicker">THE CAR</span><h3>300 hp road coupé</h3><p>Generic car · Flying lap · Centre-of-road path</p><form class="lap-specs">
  <label>Power <span><input name="powerHp" type="number" value="300" min="50" max="1500" step="10" required> hp</span></label>
  <label>Mass <span><input name="massKg" type="number" value="1400" min="500" max="3000" step="50" required> kg</span></label>
  <label>Speed limit <span><input name="topSpeedKph" type="number" value="260" min="60" max="400" step="5" required> km/h</span></label>
  <label>Braking <span><input name="brakingG" type="number" value="1.2" min="0.2" max="3" step="0.1" required> g</span></label>
  <label>Cornering <span><input name="lateralG" type="number" value="1.1" min="0.2" max="3" step="0.1" required> g</span></label><button type="submit">Recalculate lap</button></form></div>
  <div class="lap-results"><div><span>SIMULATED LAP</span><strong data-duration>—</strong></div><div><span>PEAK SPEED</span><strong data-peak>—</strong></div></div>
  <div class="lap-section"><span class="lap-kicker">THE ROAD</span><div class="lap-profile" aria-label="Road elevation profile"></div><p class="lap-profile-caption"></p><p class="lap-data-quality" data-quality></p><p data-road-detail>Variable road width · Source border coordinates</p><details class="lap-evidence"><summary>Track accuracy & sources</summary><p>Road edges use this layout’s supplemental border coordinates and remain unverified. Width changes are preserved.</p><p data-elevation-note></p><p data-curb-note></p><p>Banking is unavailable and assumed zero. This is an approximate preview, not a surveyed track model.</p><p data-source-links></p><p data-source-credit></p></details>
  <details class="lap-evidence"><summary>How the lap is simulated</summary><p data-solver-note>300 hp at the engine; 85% drivetrain efficiency, 1,400 kg, CdA 0.66 m² and rolling resistance 0.015 by default. Power, drag, gravity on slopes and a combined braking/cornering grip ellipse constrain the speed at each step. A periodic forward/backward solver plans one flying lap.</p><p>The car follows the road centre, without racing-line optimisation, gears, downforce, suspension or transient tyre dynamics. The result is an estimate, not a predicted real-car lap time.</p></details><details class="lap-evidence"><summary>Compact storage</summary><p data-storage>One GeoJSON stores the coordinates, elevation anchors, terrain grid, curb intervals and imagery reference. All meshes and lap samples are built in your browser when you open this view, and disposed when you close it. Aerial imagery loads on demand.</p></details></div>
  </div></div><footer class="lap-playback"><div class="lap-transport"><button class="lap-play" disabled>Play lap</button><button class="lap-restart" aria-label="Restart lap" disabled>↺</button><span class="lap-rate">1× real time</span><span data-lap-time>—</span></div><label class="lap-timeline"><span class="sr-only">Lap time</span><input aria-label="Lap time" type="range" min="0" max="100" step="0.01" value="0" disabled></label><div class="lap-export"><button class="lap-record" disabled>Record lap</button><a class="lap-download" hidden>Download video</a><span class="lap-status" role="status"></span></div></footer>`;
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector(".lap-header .lap-kicker")!.textContent =
    `${context.name} · ${context.country}`.toUpperCase();
  dialog.querySelector(".lap-header h2")!.textContent = context.layoutName;
  const find = <T extends HTMLElement>(selector: string) =>
    dialog.querySelector<T>(selector)!;
  if (isRun) {
    dialog.setAttribute("aria-label", `${context.name} run simulator`);
    find(".lap-stage").setAttribute("aria-label", "Run playback");
    find(".lap-close").setAttribute("aria-label", "Close run simulator");
    find(".lap-restart").setAttribute("aria-label", "Restart run");
    find(".lap-timeline input").setAttribute("aria-label", "Run time");
    find(".lap-play").textContent = "Play run";
    find(".lap-record").textContent = "Record run";
    find(".lap-results span").textContent = "SIMULATED RUN";
    find(".lap-section h3 + p").textContent =
      "Generic car · Standing start · Point-to-point run";
    const explanation = find("[data-solver-note]");
    explanation.closest("details")!.querySelector("summary")!.textContent =
      "How the run is simulated";
    explanation.textContent = explanation.textContent.replace(
      "A periodic forward/backward solver plans one flying lap.",
      "A forward/backward solver plans a standing-start run to the finish. The finish speed is unconstrained; no stopping zone is modelled.",
    );
  }
  let closed = false,
    playing = false,
    time = 0,
    last = 0,
    raf = 0,
    scene: LapScene | undefined;
  let map: L.Map | undefined,
    mapDot: L.CircleMarker | undefined,
    recorder: MediaRecorder | undefined,
    stream: MediaStream | undefined,
    downloadUrl: string | undefined,
    lastCapturedFrame = -Infinity;
  let lap: ReturnType<typeof simulateLap> | undefined;
  let mode: LapCamera | "imagery" = "chase";
  const mini = find<HTMLCanvasElement>(".lap-minimap"),
    ctx = mini.getContext("2d")!;
  const timeline = find<HTMLInputElement>(".lap-timeline input"),
    status = find(".lap-status");
  const output = document.createElement("canvas");
  output.width = 1280;
  output.height = 720;
  const out = output.getContext("2d")!;
  let miniPoints: { x: number; y: number }[] = [];
  const drawMini = (index: number) => {
    ctx.clearRect(0, 0, 220, 180);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    miniPoints.forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    if (!isRun) ctx.closePath();
    ctx.strokeStyle = "#52636b";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = "#d3ddd9";
    ctx.lineWidth = 2;
    ctx.stroke();
    const p = miniPoints[index];
    if (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff895b";
      ctx.fill();
      ctx.strokeStyle = "#162327";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };
  function paint(resetCamera = false) {
    if (!lap || !scene || closed) return;
    const s = scene.update(lap, time, resetCamera),
      station =
        (s.distance / lap.road.length) * lap.road.recipe.referenceLengthM;
    const corner =
      lap.road.recipe.corners.findLast((c) => c.distanceM <= station)?.name ??
      "Start / finish";
    find("[data-speed]").textContent = String(Math.round(s.speed * 3.6));
    find("[data-clock]").textContent = formatLapTime(time);
    find("[data-corner]").textContent = corner;
    find("[data-forces]").textContent =
      `${s.acceleration < -0.3 ? "Braking" : s.acceleration > 0.3 ? "Accelerating" : "Coasting"} · ${Math.abs(s.acceleration / 9.80665).toFixed(2)} g · Lat ${Math.abs(s.lateralG).toFixed(2)} g`;
    find("[data-distance]").textContent =
      `${(s.distance / 1000).toFixed(2)} / ${(lap.road.length / 1000).toFixed(2)} km`;
    find("[data-road-detail]").textContent =
      `Here: ${(s.left + s.right).toFixed(1)} m wide · ${s.y.toFixed(1)} m altitude · ${(s.grade * 100).toFixed(1)}% grade`;
    timeline.value = String(time);
    find("[data-lap-time]").textContent =
      `${formatLapTime(time)} / ${formatLapTime(lap.duration)}`;
    find(".lap-profile-cursor")?.setAttribute(
      "x1",
      String((station / lap.road.recipe.referenceLengthM) * 240),
    );
    find(".lap-profile-cursor")?.setAttribute(
      "x2",
      String((station / lap.road.recipe.referenceLengthM) * 240),
    );
    drawMini(s.index);
    if (mapDot && map) {
      const geo = plane(lap.road.origin).from([s.x, -s.z]);
      mapDot.setLatLng([geo[1], geo[0]]);
    }
    if (recorder?.state === "recording") {
      out.fillStyle = "#111c20";
      out.fillRect(0, 0, 1280, 720);
      const canvas = scene.renderer.domElement;
      const ratio = Math.min(1280 / canvas.width, 720 / canvas.height);
      const w = canvas.width * ratio,
        h = canvas.height * ratio;
      out.drawImage(canvas, (1280 - w) / 2, (720 - h) / 2, w, h);
      out.fillStyle = "#102128df";
      out.fillRect(24, 24, 400, 110);
      out.fillStyle = "#ff986d";
      out.font = "600 14px sans-serif";
      out.fillText(
        `${context.name.toUpperCase()}  /  ${lap.car.powerHp} HP ROAD COUPÉ`,
        42,
        49,
        360,
      );
      out.fillStyle = "#ffffff";
      out.font = "600 44px sans-serif";
      out.fillText(`${Math.round(s.speed * 3.6)} km/h`, 42, 98);
      out.font = "20px monospace";
      out.fillText(formatLapTime(time), 275, 98);
      out.font = "16px sans-serif";
      out.fillText(`${corner} · 1× real time`, 30, 668);
      out.fillText("Natural elevation · Approximate reconstruction", 30, 695);
      out.font = "12px sans-serif";
      out.fillText(
        `Imagery: ${lap.road.recipe.imagery.attribution} · Trace © OSM · Supplemental borders`,
        30,
        715,
        1220,
      );
      out.drawImage(mini, 1040, 24, 220, 180);
      const track = stream?.getVideoTracks()[0] as
          CanvasCaptureMediaStreamTrack | undefined,
        now = performance.now();
      if (track?.requestFrame && now - lastCapturedFrame >= 1000 / 30) {
        track.requestFrame();
        lastCapturedFrame = now;
      }
    }
  }
  const stopRecording = () => {
    if (recorder?.state === "recording") {
      find<HTMLButtonElement>(".lap-record").disabled = true;
      recorder.stop();
    }
    find(".lap-record").textContent = isRun ? "Record run" : "Record lap";
  };
  function setPlaying(next: boolean) {
    playing = next;
    last = performance.now();
    find(".lap-play").textContent = playing
      ? "Pause"
      : isRun
        ? "Play run"
        : "Play lap";
    if (!playing) stopRecording();
    if (playing) raf = requestAnimationFrame(tick);
    else cancelAnimationFrame(raf);
  }
  function tick(now: number) {
    if (!playing || !lap || closed) return;
    time = Math.min(lap.duration, time + (now - last) / 1000);
    last = now;
    paint();
    if (time >= lap.duration) {
      setPlaying(false);
      status.textContent = "Lap complete";
    } else raf = requestAnimationFrame(tick);
  }
  function seek(next: number) {
    if (!lap) return;
    stopRecording();
    time = Math.max(0, Math.min(lap.duration, next));
    last = performance.now();
    paint(true);
  }
  function close() {
    if (closed) return;
    closed = true;
    setPlaying(false);
    map?.remove();
    scene?.dispose();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    document.removeEventListener("visibilitychange", visibility);
    dialog.close();
    dialog.remove();
    previousFocus?.focus();
    onClose();
  }
  const visibility = () => {
    if (document.hidden && playing) {
      setPlaying(false);
      status.textContent = "Paused while this tab is hidden";
    }
  };
  document.addEventListener("visibilitychange", visibility);
  find(".lap-close").onclick = close;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  find(".lap-play").onclick = () => {
    if (lap && time >= lap.duration) time = 0;
    setPlaying(!playing);
  };
  find(".lap-restart").onclick = () => seek(0);
  timeline.oninput = () => seek(Number(timeline.value));
  mini.onclick = (e) => {
    if (!lap) return;
    const rect = mini.getBoundingClientRect(),
      x = ((e.clientX - rect.left) * 220) / rect.width,
      y = ((e.clientY - rect.top) * 180) / rect.height;
    let best = Infinity,
      index = 0;
    miniPoints.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < best) {
        best = d;
        index = i;
      }
    });
    seek(lap.time[index]);
  };
  dialog.addEventListener("keydown", (e) => {
    if (
      e.code === "Space" &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLButtonElement) &&
      !find(".lap-loading").hidden
    ) {
      return;
    }
    if (e.code === "Space" && e.target === scene?.renderer.domElement) {
      e.preventDefault();
      setPlaying(!playing);
    }
  });
  function imagery() {
    if (!lap) return;
    if (!map) {
      map = L.map(find(".lap-imagery"), {
        maxZoom: 21,
        minZoom: 13,
        attributionControl: true,
      });
      const [west, south] = fromMercator(
          lap.road.recipe.imagery.extent3857[0],
          lap.road.recipe.imagery.extent3857[1],
        ),
        [east, north] = fromMercator(
          lap.road.recipe.imagery.extent3857[2],
          lap.road.recipe.imagery.extent3857[3],
        );
      const bounds: L.LatLngBoundsExpression = [
        [south, west],
        [north, east],
      ];
      const tileReference = lap.road.recipe.imagery.tiles;
      if (tileReference) {
        const key = import.meta.env.VITE_MAPTILER_API_KEY?.trim();
        if (key)
          L.tileLayer(
            `https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}.jpg?key=${encodeURIComponent(key)}`,
            {
              tileSize: 512,
              zoomOffset: -1,
              maxZoom: 22,
              attribution: lap.road.recipe.imagery.attribution,
              crossOrigin: true,
            },
          ).addTo(map);
      } else
        L.imageOverlay(lap.road.recipe.imagery.url, bounds, {
          attribution: lap.road.recipe.imagery.attribution,
          crossOrigin: "anonymous",
        }).addTo(map);
      const projection = plane(lap.road.origin);
      for (const side of ["left", "right"] as const) {
        const coords = lap.road.points.map((p) => {
          const d = p[side] * (side === "left" ? 1 : -1),
            edge = side === "left" ? p.leftEdge : p.rightEdge,
            g = projection.from(
              edge ? [edge[0], -edge[1]] : [p.x + p.nx * d, -p.z - p.nz * d],
            );
          return [g[1], g[0]] as [number, number];
        });
        if (lap.road.recipe.kind !== "run") coords.push(coords[0]);
        L.polyline(coords, {
          color: side === "left" ? "#ff8454" : "#58dbeb",
          weight: 2,
          attribution: "Trace © OSM · Supplemental borders",
        }).addTo(map);
      }
      mapDot = L.circleMarker([0, 0], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#ff8454",
        fillOpacity: 1,
      }).addTo(map);
      map.fitBounds(bounds);
      map.on("click", (e) => {
        const [x, y] = projection.to([e.latlng.lng, e.latlng.lat]);
        let best = Infinity,
          index = 0;
        lap!.road.points.forEach((p, i) => {
          const d = (p.x - x) ** 2 + (p.z + y) ** 2;
          if (d < best) {
            best = d;
            index = i;
          }
        });
        seek(lap!.time[index]);
      });
    }
    map.invalidateSize();
    paint();
  }
  for (const button of dialog.querySelectorAll<HTMLButtonElement>(
    "[data-camera]",
  ))
    button.onclick = () => {
      if (!scene) return;
      mode = button.dataset.camera as typeof mode;
      stopRecording();
      find(".lap-canvas").hidden = mode === "imagery";
      find(".lap-imagery").hidden = mode !== "imagery";
      for (const b of dialog.querySelectorAll("[data-camera]"))
        b.setAttribute("aria-pressed", String(b === button));
      if (mode === "imagery") imagery();
      else scene.setCamera(mode);
    };
  find<HTMLFormElement>(".lap-specs").onsubmit = (e) => {
    e.preventDefault();
    if (!lap) return;
    setPlaying(false);
    const car = { ...DEFAULT_CAR };
    for (const key of [
      "powerHp",
      "massKg",
      "topSpeedKph",
      "brakingG",
      "lateralG",
    ] as const)
      car[key] = Number(find<HTMLInputElement>(`[name=${key}]`).value);
    lap = simulateLap(lap.road, car);
    time = 0;
    find("h3").textContent = `${car.powerHp} hp road coupé`;
    updateResults();
    paint(true);
    status.textContent = "Lap recalculated";
  };
  function updateResults() {
    if (!lap) return;
    find("[data-duration]").textContent = formatLapTime(lap.duration);
    find("[data-peak]").textContent =
      `${Math.round(Math.max(...lap.speed) * 3.6)} km/h`;
    timeline.max = String(lap.duration);
  }
  find(".lap-record").onclick = () => {
    if (recorder?.state === "recording") {
      setPlaying(false);
      return;
    }
    if (!scene || !lap) return;
    if (!("MediaRecorder" in window) || !output.captureStream) {
      status.textContent = "Video recording is unavailable in this browser.";
      return;
    }
    if (mode === "imagery") {
      find<HTMLButtonElement>("[data-camera=chase]").click();
    }
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      downloadUrl = undefined;
    }
    find(".lap-download").hidden = true;
    const chunks: Blob[] = [];
    time = 0;
    try {
      const mime = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4;codecs=avc1.42001E",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      stream = output.captureStream(0);
      if (
        typeof (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack)
          .requestFrame !== "function"
      ) {
        stream.getTracks().forEach((t) => t.stop());
        stream = output.captureStream(30);
      }
      lastCapturedFrame = -Infinity;
      recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined,
      );
      const recording = recorder,
        recordingStream = stream;
      let failed = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          window.clearTimeout(startupTimer);
          if (!closed && recording.state === "recording") {
            find<HTMLButtonElement>(".lap-record").disabled = false;
            status.textContent = "Recording at 1× · Keep this tab visible";
          }
        }
      };
      recorder.onstop = () => {
        window.clearTimeout(startupTimer);
        // The encoder must flush its final data before the capture tracks end.
        recordingStream.getTracks().forEach((t) => t.stop());
        if (stream === recordingStream) stream = undefined;
        if (closed) return;
        find<HTMLButtonElement>(".lap-record").disabled = false;
        if (failed) return;
        const video = new Blob(chunks, { type: recording.mimeType });
        if (!video.size) {
          status.textContent =
            "No video frames were captured. Try recording again.";
          return;
        }
        downloadUrl = URL.createObjectURL(video);
        const a = find<HTMLAnchorElement>(".lap-download");
        a.href = downloadUrl;
        a.download = `${context.trackId}-${layout.metadata.layoutId}-lap-${Date.now()}.${recording.mimeType.includes("mp4") ? "mp4" : "webm"}`;
        a.hidden = false;
        status.textContent = "Video ready";
      };
      recorder.onerror = () => {
        window.clearTimeout(startupTimer);
        failed = true;
        status.textContent = "Recording failed. Try again.";
        stopRecording();
        recordingStream.getTracks().forEach((t) => t.stop());
        if (stream === recordingStream) stream = undefined;
        find<HTMLButtonElement>(".lap-record").disabled = false;
      };
      recorder.onstart = () => paint(true);
      recorder.start(1000);
      find(".lap-record").textContent = "Stop recording";
      find<HTMLButtonElement>(".lap-record").disabled = true;
      status.textContent = "Starting video capture…";
      const startupTimer = window.setTimeout(() => {
        if (recording.state === "recording" && !chunks.length) {
          failed = true;
          status.textContent = "Video capture did not start. Try again.";
          setPlaying(false);
        }
      }, 15000);
      paint(true);
      if (!playing) setPlaying(true);
      else last = performance.now();
    } catch {
      stopRecording();
      stream?.getTracks().forEach((t) => t.stop());
      stream = undefined;
      find<HTMLButtonElement>(".lap-record").disabled = false;
      status.textContent = "Unable to record video in this browser.";
    }
  };
  void (async () => {
    try {
      const recipe = layout.metadata.model3d;
      if (!recipe || recipe.kind === "surface")
        throw new Error("This layout has no embedded 3D model data.");
      if (closed) return;
      find(".lap-imagery-credit").textContent =
        `Imagery: ${recipe.imagery.attribution}`;
      if (layout.metadata.borderInference) {
        const evidence = layout.metadata.borderInference;
        const note = document.createElement("p");
        note.textContent = evidence.refinement
          ? "Road-border estimates include corrections measured on pinned aerial imagery. Other sections remain automatic estimates. These borders have not been formally verified."
          : "Road borders are inferred aerial-image estimates and have not been manually reviewed.";
        const credit = document.createElement("a");
        credit.href =
          evidence.imagery.reuseEvidenceUrl ??
          evidence.imagery.termsUrl ??
          evidence.imagery.url;
        credit.target = "_blank";
        credit.rel = "noreferrer";
        credit.textContent = evidence.imagery.attribution;
        note.append(" ", credit);
        find(".lap-evidence").append(note);
      }
      const road = buildRoad(layout);
      lap = simulateLap(road);
      if (closed) return;
      const xs = road.points.map((p) => p.x),
        zs = road.points.map((p) => p.z),
        minX = Math.min(...xs),
        minZ = Math.min(...zs),
        spanX = Math.max(...xs) - minX,
        spanZ = Math.max(...zs) - minZ,
        scale = Math.min(185 / spanX, 148 / spanZ);
      miniPoints = road.points.map((p) => ({
        x: 110 + (p.x - minX - spanX / 2) * scale,
        y: 90 + (p.z - minZ - spanZ / 2) * scale,
      }));
      scene = new LapScene(
        find(".lap-canvas"),
        road,
        recipe.terrain,
        (ready) => {
          if (closed) return;
          status.textContent = ready
            ? "Aerial imagery loaded"
            : "Aerial imagery unavailable · 3D road remains usable";
        },
      );
      scene.renderer.domElement.addEventListener("webglcontextlost", () => {
        setPlaying(false);
        status.textContent = "3D context lost. Close and reopen this view.";
      });
      scene.renderer.domElement.addEventListener("click", (e) => {
        if (mode !== "orbit" || !lap) return; // Explore mode exposes spatial selection without interrupting chase playback.
        const rect = scene!.renderer.domElement.getBoundingClientRect();
        void import("three").then(({ Raycaster, Vector2 }) => {
          if (closed || !scene || !lap) return;
          const ray = new Raycaster();
          ray.setFromCamera(
            new Vector2(
              ((e.clientX - rect.left) / rect.width) * 2 - 1,
              (-(e.clientY - rect.top) / rect.height) * 2 + 1,
            ),
            scene.camera,
          );
          const hit = ray
            .intersectObjects(scene.scene.children, true)
            .find((h) => h.object !== scene!.scene);
          if (hit) {
            let d = Infinity,
              j = 0;
            lap.road.points.forEach((p, i) => {
              const q = (p.x - hit.point.x) ** 2 + (p.z - hit.point.z) ** 2;
              if (q < d) {
                d = q;
                j = i;
              }
            });
            seek(lap.time[j]);
          }
        });
      });
      const heights = recipe.elevation.map((anchor) => anchor[1]);
      const low = Math.min(...heights),
        high = Math.max(...heights),
        relief = Math.max(1, high - low);
      const path = recipe.elevation
        .map(
          ([station, height]) =>
            `${(station / recipe.referenceLengthM) * 240},${76 - ((height - low) / relief) * 65}`,
        )
        .join(" ");
      find(".lap-profile").innerHTML =
        `<svg viewBox="0 0 240 90" role="img" aria-label="Road elevation profile"><path d="M0,82 L${path.replaceAll(" ", " L")} L240,82 Z" fill="#f38a4d22"/><polyline points="${path}" fill="none" stroke="#f08c56" stroke-width="2"/><line class="lap-profile-cursor" x1="0" y1="5" x2="0" y2="82" stroke="#f1f4ec" stroke-width="1"/></svg>`;
      const published = recipe.quality.elevation === "venue-anchors";
      const estimatedCurbs = recipe.quality.curbs === "geometry-estimated";
      find(".lap-scale").textContent = estimatedCurbs
        ? "1× elevation · Terrain estimate · Illustrative curbs"
        : "1× elevation · Approximate reconstruction";
      find(".lap-profile-caption").textContent =
        `${low.toFixed(0)}–${high.toFixed(0)} m altitude · ${published ? "Published elevation anchors" : `Terrain estimate (~${recipe.terrain.source.sampleSpacingM} m grid)`}`;
      find("[data-quality]").textContent = estimatedCurbs
        ? "Illustrative curbs · Positions unverified"
        : "Image-reviewed curb locations · Estimated dimensions";
      find("[data-elevation-note]").textContent = published
        ? `Road height follows ${recipe.elevation.length} published altitude anchors at natural scale. Stationing uses a venue reference; start alignment is approximate (${recipe.startOffsetM} m from the saved timing anchor).`
        : `Road height is estimated from the approximately ${recipe.terrain.source.sampleSpacingM} m terrain raster, using ${recipe.elevation.length} compressed samples. It is not a survey of the road surface. Distances follow ${recipe.pathMethod === "boundary-normal-midpoints-v1" ? "midpoints of cross-sections from the inner boundary to the outer boundary; the source trace is preserved" : recipe.pathMethod ? "the midpoint of corresponding border stations; the source trace is preserved" : "the mapped trace"}.`;
      find("[data-curb-note]").textContent = estimatedCurbs
        ? "Curbs and bend labels are generated from road curvature. Positions, widths, heights and colours are illustrative and have not been checked against imagery."
        : "Curb locations were reviewed against imagery; their dimensions and heights remain estimates.";
      find("[data-source-credit]").textContent =
        `Trace © OpenStreetMap contributors, ODbL. Supplemental borders: ${layout.metadata.borderInference?.imagery.license ?? "LicenseRef-Track-Borders"}. Imagery: ${recipe.imagery.attribution}. No additional rights granted.`;
      const links: [string, string][] = [
        [
          published ? "Elevation reference" : "Terrain source",
          recipe.sources.elevation,
        ],
        ["Imagery source", recipe.sources.imagery],
      ];
      if (recipe.imagery.termsUrl)
        links.push(["Imagery terms", recipe.imagery.termsUrl]);
      for (const [label, href] of links) {
        const a = document.createElement("a");
        a.href = href;
        a.textContent = label + " ↗";
        a.target = "_blank";
        a.rel = "noreferrer";
        if (find("[data-source-links]").childNodes.length)
          find("[data-source-links]").append(" · ");
        find("[data-source-links]").append(a);
      }
      updateResults();
      for (const sel of [
        ".lap-play",
        ".lap-restart",
        ".lap-record",
        ".lap-timeline input",
      ])
        find<HTMLButtonElement>(sel).disabled = false;
      find(".lap-loading").hidden = true;
      paint();
      status.textContent = "Loading aerial imagery…";
      void scene.loadImagery();
    } catch (error) {
      if (!closed) {
        find(".lap-loading").textContent =
          "This track could not be generated. Close this view and try again.";
        status.textContent =
          error instanceof Error ? error.message : String(error);
      }
    }
  })();
  return close;
}
