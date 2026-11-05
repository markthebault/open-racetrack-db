import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { plane } from "./geo";
import { roadStrip as strip } from "./road-geometry";
import { LapCameraRig } from "./lap-camera";
import { sampleElevation, type ElevationGrid } from "./elevation";
import {
  sampleLap,
  type Lap,
  type Road,
  type RoadPoint,
} from "./lap-simulation";

export const fromMercator = (x: number, y: number): [number, number] => [
  ((x / 6378137) * 180) / Math.PI,
  ((2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180) / Math.PI,
];
export type LapCamera = "chase" | "driver" | "above" | "orbit";

function asphaltTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const data = ctx.createImageData(128, 128);
  let random = 42;
  for (let i = 0; i < data.data.length; i += 4) {
    random = (random * 1664525 + 1013904223) >>> 0;
    const v = 64 + (random % 18);
    data.data.set([v, v + 1, v + 2, 255], i);
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function coupe() {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: 0xf06437,
    metalness: 0.42,
    roughness: 0.26,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x10242e,
    metalness: 0.65,
    roughness: 0.14,
  });
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    rounded = false,
  ) => {
    const m = new THREE.Mesh(
      rounded
        ? new RoundedBoxGeometry(w, h, d, 2, 0.12)
        : new THREE.BoxGeometry(w, h, d),
      material,
    );
    m.position.set(x, y, z);
    car.add(m);
    return m;
  };
  box(1.88, 0.65, 4.35, 0, 0.64, 0, paint, true);
  box(1.6, 0.65, 2.05, 0, 1.13, 0.08, glass, true);
  box(1.62, 0.12, 1.3, 0, 1.48, 0.15, paint, true);
  box(1.74, 0.13, 0.24, 0, 0.93, 1.95, glass);
  const tyre = new THREE.MeshStandardMaterial({
    color: 0x14191c,
    roughness: 0.9,
  });
  const alloy = new THREE.MeshStandardMaterial({
    color: 0xbac3c9,
    metalness: 0.8,
    roughness: 0.3,
  });
  for (const x of [-0.94, 0.94])
    for (const z of [-1.34, 1.36]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16),
        tyre,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.36, z);
      car.add(wheel);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.25, 8),
        alloy,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      car.add(hub);
    }
  const rear = new THREE.MeshBasicMaterial({ color: 0xff2525 }),
    front = new THREE.MeshBasicMaterial({ color: 0xe7f5ff });
  for (const x of [-0.64, 0.64]) {
    box(0.44, 0.14, 0.05, x, 0.78, 2.18, rear);
    box(0.44, 0.13, 0.05, x, 0.78, -2.18, front);
  }
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 4.7),
    new THREE.MeshBasicMaterial({
      color: 0x10191a,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.07;
  car.add(shadow);
  return car;
}

export class LapScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.15, 9000);
  private controls: OrbitControls;
  private car = coupe();
  private observer: ResizeObserver;
  private ground?: THREE.Mesh;
  private texture?: THREE.Texture;
  private disposed = false;
  private imageryAbort = new AbortController();
  private mode: LapCamera = "chase";
  private cameraRig: LapCameraRig;
  private renderState?: ReturnType<typeof sampleLap>;
  private groundGeometry: THREE.PlaneGeometry;
  private overviewPath?: THREE.LineLoop;
  constructor(
    private container: HTMLElement,
    private road: Road,
    grid: ElevationGrid | undefined,
    private imageryStatus: (ready: boolean) => void,
  ) {
    this.cameraRig = new LapCameraRig(road);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D lap. Elevation at natural scale.",
    );
    this.renderer.domElement.tabIndex = 0;
    container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xb4cbd5);
    this.scene.fog = new THREE.Fog(0xb4cbd5, 700, 2600);
    this.scene.add(new THREE.HemisphereLight(0xe0f3ff, 0x727c53, 2));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.4);
    sun.position.set(-600, 1300, 400);
    this.scene.add(sun);
    const asphalt = new THREE.MeshStandardMaterial({
      map: asphaltTexture(),
      roughness: 0.94,
      side: THREE.DoubleSide,
    });
    this.scene.add(
      new THREE.Mesh(
        strip(road, (p) => [p.left, -p.right], 0.08),
        asphalt,
      ),
    );
    const edge = new THREE.MeshStandardMaterial({
      color: 0xe9ebdc,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    this.scene.add(
      new THREE.Mesh(
        strip(road, (p) => [p.left - 0.08, p.left - 0.23], 0.1),
        edge,
      ),
    );
    this.scene.add(
      new THREE.Mesh(
        strip(road, (p) => [-p.right + 0.08, -p.right + 0.23], 0.1),
        edge,
      ),
    );
    for (const curb of road.recipe.curbs) {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        side: THREE.DoubleSide,
      });
      this.scene.add(
        new THREE.Mesh(
          strip(
            road,
            (p) =>
              curb.side === "left"
                ? [p.left, p.left + curb.widthM]
                : [-p.right - curb.widthM, -p.right],
            0.08 + curb.heightM,
            [curb.startM, curb.endM],
            true,
          ),
          mat,
        ),
      );
    }
    // A small checkered stripe at the simulation start, separate from the saved finish gate.
    const first = road.points[0];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry((first.left + first.right) / 12, 0.7),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xffffff : 0x23272b,
          side: THREE.DoubleSide,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(first.nz, first.nx);
      const d = -first.right + ((i + 0.5) * (first.left + first.right)) / 12;
      m.position.set(
        first.x + first.nx * d,
        first.y + 0.12,
        first.z + first.nz * d,
      );
      this.scene.add(m);
    }
    this.scene.add(this.car);
    if (road.length > 15000) {
      this.overviewPath = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          road.points.map(
            (p) =>
              new THREE.Vector3(
                p.x + (p.nx * (p.left - p.right)) / 2,
                p.y + 0.2,
                p.z + (p.nz * (p.left - p.right)) / 2,
              ),
          ),
        ),
        new THREE.LineBasicMaterial({
          color: 0xffb347,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
          depthWrite: false,
        }),
      );
      this.overviewPath.visible = false;
      this.overviewPath.renderOrder = 10;
      this.scene.add(this.overviewPath);
    }
    this.car.position.y = road.points[0].y;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 15;
    const bounds = new THREE.Box3().setFromPoints(
      road.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    const extent = bounds.getSize(new THREE.Vector3()).length();
    this.controls.maxDistance = Math.max(4500, extent * 4);
    this.camera.far = Math.max(9000, extent * 8);
    this.controls.enabled = false;
    this.controls.addEventListener("change", () => this.render());
    const projection = plane(road.origin),
      [west, south] = fromMercator(
        road.recipe.imagery.extent3857[0],
        road.recipe.imagery.extent3857[1],
      ),
      [east, north] = fromMercator(
        road.recipe.imagery.extent3857[2],
        road.recipe.imagery.extent3857[3],
      );
    const min = projection.to([west, south]),
      max = projection.to([east, north]);
    this.groundGeometry = new THREE.PlaneGeometry(
      max[0] - min[0],
      max[1] - min[1],
      160,
      220,
    );
    this.groundGeometry.rotateX(-Math.PI / 2);
    this.groundGeometry.translate(
      (min[0] + max[0]) / 2,
      0,
      -(min[1] + max[1]) / 2,
    );
    const pos = this.groundGeometry.getAttribute("position");
    const validGround: boolean[] = [];
    const cells = new Map<string, RoadPoint[]>();
    for (const p of road.points) {
      const key = `${Math.floor(p.x / 40)},${Math.floor(p.z / 40)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(p);
    }
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      const sampled = grid
        ? sampleElevation(grid, projection.from([x, -z]))
        : null;
      validGround.push(sampled !== null);
      if (sampled === null) continue;
      let y = sampled;
      let nearest: RoadPoint | undefined,
        best = Infinity;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const p of cells.get(
            `${Math.floor(x / 40) + a},${Math.floor(z / 40) + b}`,
          ) ?? []) {
            const d = (x - p.x) ** 2 + (z - p.z) ** 2;
            if (d < best) {
              best = d;
              nearest = p;
            }
          }
      if (nearest) {
        const width = Math.max(nearest.left, nearest.right) + 5,
          blend =
            1 - THREE.MathUtils.smoothstep(Math.sqrt(best), width, width + 35);
        y = THREE.MathUtils.lerp(y, nearest.y - 0.1, blend);
      }
      pos.setY(i, y - 0.3);
    }
    // Missing raster coverage remains a hole, rather than an invented 400 m wall.
    const sourceTriangles = this.groundGeometry.getIndex()!.array,
      triangles: number[] = [];
    for (let i = 0; i < sourceTriangles.length; i += 3) {
      const [a, b, c] = [
        sourceTriangles[i],
        sourceTriangles[i + 1],
        sourceTriangles[i + 2],
      ];
      if (validGround[a] && validGround[b] && validGround[c])
        triangles.push(a, b, c);
    }
    this.groundGeometry.setIndex(triangles);
    this.groundGeometry.computeVertexNormals();
    this.ground = new THREE.Mesh(
      this.groundGeometry,
      new THREE.MeshStandardMaterial({ color: 0x5d714b, roughness: 1 }),
    );
    this.scene.add(this.ground);
    // Shoulder mesh guarantees no raster triangle can rise through the road.
    this.scene.add(
      new THREE.Mesh(
        strip(road, (p) => [p.left + 3, -p.right - 3], -0.1),
        new THREE.MeshStandardMaterial({
          color: 0x667650,
          roughness: 1,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.observer = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.mode === "orbit") this.fitOrbit();
      this.render();
    });
    this.observer.observe(container);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
  }
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.imageryStatus(false);
  };
  async loadImagery() {
    try {
      const response = await fetch(this.road.recipe.imagery.url, {
        signal: this.imageryAbort.signal,
      });
      if (!response.ok) throw new Error("Imagery unavailable");
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "flipY",
      });
      if (this.disposed) {
        bitmap.close();
        return;
      }
      this.texture = new THREE.Texture(bitmap);
      this.texture.needsUpdate = true;
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = Math.min(
        8,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      const mat = this.ground!.material as THREE.MeshStandardMaterial;
      mat.map = this.texture;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
      this.imageryStatus(true);
      this.render();
    } catch {
      if (!this.disposed) this.imageryStatus(false);
    }
  }
  setCamera(mode: LapCamera) {
    this.mode = mode;
    if (this.overviewPath) this.overviewPath.visible = mode === "orbit";
    this.car.visible = mode !== "driver";
    this.cameraRig.reset();
    this.controls.enabled = mode === "orbit";
    this.scene.fog =
      mode === "above" || mode === "orbit"
        ? null
        : new THREE.Fog(0xb4cbd5, 700, 2600);
    if (mode === "orbit") this.fitOrbit();
    if (this.renderState) this.placeCamera(this.renderState);
    this.render();
  }
  private fitOrbit() {
    const box = new THREE.Box3().setFromPoints(
      this.road.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    const center = box.getCenter(new THREE.Vector3()),
      radius = box.getSize(new THREE.Vector3()).length() / 2 + 25;
    const vertical = THREE.MathUtils.degToRad(this.camera.fov) / 2,
      horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.08;
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .add(
        new THREE.Vector3(1.15, 1.75, 1.25)
          .normalize()
          .multiplyScalar(distance),
      );
    this.controls.update();
  }
  update(lap: Lap, time: number, resetCamera = false) {
    const s = sampleLap(lap, time);
    this.renderState = s;
    const offset = (s.left - s.right) / 2;
    this.car.position.set(s.x + s.nx * offset, s.y + 0.15, s.z + s.nz * offset);
    const forward = this.cameraRig.course.direction(s.distance, 3);
    this.car.rotation.set(
      Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1)),
      Math.atan2(-forward.x, -forward.z),
      0,
      "YXZ",
    );
    this.car.visible = this.mode !== "driver";
    this.placeCamera(s, resetCamera);
    this.render();
    return s;
  }
  private placeCamera(s: ReturnType<typeof sampleLap>, reset = false) {
    if (this.mode === "orbit") return;
    const pose = this.cameraRig.update(s.distance, s.time, this.mode, reset);
    this.camera.position.copy(pose.position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(pose.target);
  }
  render() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.disposed = true;
    this.imageryAbort.abort();
    this.observer.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if ("map" in m && m.map instanceof THREE.Texture) m.map.dispose();
          m.dispose();
        }
      }
    });
    if (this.texture?.image instanceof ImageBitmap) this.texture.image.close();
    this.texture?.dispose();
    this.renderer.forceContextLoss();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
