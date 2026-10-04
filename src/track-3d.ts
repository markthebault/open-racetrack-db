import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { geometryPaths, type Layout } from "../schemas/data";
import { planarCourse } from "./track-preview";
import { plane, type Position } from "./geo";
import { sampleElevation, type ElevationGrid } from "./elevation";

function ribbon(points: THREE.Vector3[], width: number, elevation: number) {
  const vertices: number[] = [],
    indices: number[] = [],
    normals: number[] = [];
  const closed = points[0].distanceTo(points.at(-1)!) < 0.001;
  for (let i = 0; i < points.length; i++) {
    const previous = points[i - 1] ?? (closed ? points.at(-2)! : points[i]);
    const next = points[i + 1] ?? (closed ? points[1] : points[i]);
    const direction = next.clone().sub(previous);
    direction.y = 0;
    if (direction.lengthSq() < 1e-10) {
      direction.copy(next).sub(points[i]);
      direction.y = 0;
    }
    direction.normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x);
    const surfaceNormal = normal
      .clone()
      .cross(next.clone().sub(previous))
      .normalize();
    if (!surfaceNormal.lengthSq()) surfaceNormal.set(0, 1, 0);
    normals.push(...surfaceNormal.toArray(), ...surfaceNormal.toArray());
    const outgoing = (points[i + 1] ?? points[i]).clone().sub(points[i]);
    outgoing.y = 0;
    outgoing.normalize();
    const miter = outgoing.length()
      ? Math.min(
          2.5,
          1 /
            Math.max(
              0.4,
              Math.abs(
                normal.dot(new THREE.Vector3(-outgoing.z, 0, outgoing.x)),
              ),
            ),
        )
      : 1;
    const offset = normal.multiplyScalar((width * miter) / 2);
    vertices.push(
      points[i].x + offset.x,
      points[i].y + elevation,
      points[i].z + offset.z,
      points[i].x - offset.x,
      points[i].y + elevation,
      points[i].z - offset.z,
    );
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function boardTexture(width: number, height: number, origin: Position) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(1536 * Math.min(1, width / height));
  canvas.height = Math.round(1536 * Math.min(1, height / width));
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width,
    h = canvas.height;
  ctx.fillStyle = "#202c30";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#304044";
  ctx.lineWidth = 1;
  const grid = (w / width) * 5;
  for (let x = (w / 2) % grid; x < w; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = (h / 2) % grid; y < h; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#556367";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = "#b3bebc";
  ctx.font = "16px monospace";
  ctx.textAlign = "center";
  ctx.fillText("N", w / 2, 49);
  ctx.beginPath();
  ctx.moveTo(w / 2, 62);
  ctx.lineTo(w / 2, 91);
  ctx.moveTo(w / 2 - 7, 72);
  ctx.lineTo(w / 2, 62);
  ctx.lineTo(w / 2 + 7, 72);
  ctx.stroke();
  ctx.font = "13px monospace";
  ctx.fillText(
    `${Math.abs(origin[1]).toFixed(4)}° ${origin[1] >= 0 ? "N" : "S"}   /   ${Math.abs(origin[0]).toFixed(4)}° ${origin[0] >= 0 ? "E" : "W"}`,
    w / 2,
    h - 42,
  );
  ctx.strokeStyle = "#99a5a3";
  ctx.lineWidth = 3;
  for (const [x, y, dx, dy] of [
    [24, 24, 1, 1],
    [w - 24, 24, -1, 1],
    [24, h - 24, 1, -1],
    [w - 24, h - 24, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * 28, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * 28);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function terrainSurface(
  grid: ElevationGrid,
  width: number,
  height: number,
  origin: Position,
  scale: number,
  exaggeration: number,
) {
  const projection = plane(origin);
  const columns = Math.min(
    128,
    Math.max(32, Math.ceil((width / scale / grid.source.sampleSpacingM) * 2)),
  );
  const rows = Math.min(
    128,
    Math.max(32, Math.ceil((height / scale / grid.source.sampleSpacingM) * 2)),
  );
  const geometry = new THREE.PlaneGeometry(width, height, columns, rows);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  const samples: (number | null)[] = [];
  for (let i = 0; i < positions.count; i++)
    samples.push(
      sampleElevation(
        grid,
        projection.from([
          positions.getX(i) / scale,
          -positions.getZ(i) / scale,
        ]),
      ),
    );
  const floor = Math.min(
    ...samples.filter((value): value is number => value !== null),
  );
  for (let i = 0; i < positions.count; i++)
    positions.setY(
      i,
      samples[i] === null
        ? 0
        : (samples[i]! - floor) * scale * exaggeration + 0.16,
    );
  // Raster holes remain holes instead of being filled with invented heights.
  const triangles = Array.from(geometry.getIndex()!.array);
  const valid = [];
  for (let i = 0; i < triangles.length; i += 3)
    if (triangles.slice(i, i + 3).every((vertex) => samples[vertex] !== null))
      valid.push(...triangles.slice(i, i + 3));
  geometry.setIndex(valid);
  geometry.computeVertexNormals();
  const contours: number[] = [];
  const highest = Math.max(
    ...samples.filter((value): value is number => value !== null),
  );
  const step = Math.max(5, Math.ceil((highest - floor) / 12 / 5) * 5);
  for (
    let level = Math.ceil(floor / step) * step;
    level < highest;
    level += step
  ) {
    for (let i = 0; i < valid.length; i += 3) {
      const triangle = valid.slice(i, i + 3),
        hits: THREE.Vector3[] = [];
      for (let edge = 0; edge < 3; edge++) {
        const a = triangle[edge],
          b = triangle[(edge + 1) % 3],
          ha = samples[a]!,
          hb = samples[b]!;
        if ((ha < level && hb >= level) || (hb < level && ha >= level)) {
          const point = new THREE.Vector3()
            .fromBufferAttribute(positions, a)
            .lerp(
              new THREE.Vector3().fromBufferAttribute(positions, b),
              (level - ha) / (hb - ha),
            );
          point.y += 0.035;
          hits.push(point);
        }
      }
      if (hits.length === 2)
        contours.push(...hits[0].toArray(), ...hits[1].toArray());
    }
  }
  const contourGeometry = new THREE.BufferGeometry();
  contourGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(contours, 3),
  );
  const perimeter: number[] = [];
  const edgeIndices = [
    ...Array.from({ length: columns + 1 }, (_, x) => x),
    ...Array.from(
      { length: rows },
      (_, y) => (y + 1) * (columns + 1) + columns,
    ),
    ...Array.from(
      { length: columns },
      (_, x) => rows * (columns + 1) + columns - x - 1,
    ),
    ...Array.from(
      { length: rows - 1 },
      (_, y) => (rows - y - 1) * (columns + 1),
    ),
  ];
  for (let i = 0; i < edgeIndices.length; i++) {
    const a = edgeIndices[i],
      b = edgeIndices[(i + 1) % edgeIndices.length];
    if (samples[a] === null || samples[b] === null) continue;
    const p = new THREE.Vector3().fromBufferAttribute(positions, a),
      q = new THREE.Vector3().fromBufferAttribute(positions, b);
    perimeter.push(
      p.x,
      p.y,
      p.z,
      q.x,
      0,
      q.z,
      p.x,
      0,
      p.z,
      p.x,
      p.y,
      p.z,
      q.x,
      q.y,
      q.z,
      q.x,
      0,
      q.z,
    );
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(perimeter, 3),
  );
  walls.computeVertexNormals();
  return { geometry, contours: contourGeometry, walls, floor, step };
}

export class Track3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(37, 1, 0.1, 1200);
  private controls: OrbitControls;
  private course = new THREE.Group();
  private active = false;
  private rotating = false;
  private frame = 0;
  private frameRequested = false;
  private span = 100;
  private resizeObserver: ResizeObserver;
  private labelLayer: HTMLDivElement;
  private gateLabels: { element: HTMLDivElement; anchor: THREE.Vector3 }[] = [];

  constructor(
    private container: HTMLElement,
    private onUnavailable: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    // A local studio environment provides reflections without a downloaded HDR asset.
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(environment, 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    environment.dispose();
    pmrem.dispose();
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "3D course view. Drag to orbit, pinch or scroll to zoom. Arrow keys rotate, plus and minus zoom.",
    );
    container.append(canvas);
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "timing-labels";
    container.append(this.labelLayer);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.addEventListener("change", this.requestRender);
    this.controls.addEventListener("start", () => {
      this.requestRender();
    });
    this.scene.add(new THREE.HemisphereLight(0xd9edee, 0x17201f, 1.4));
    const sun = new THREE.DirectionalLight(0xffe7d6, 2.7);
    sun.position.set(40, 120, 60);
    this.scene.add(sun);
    const edge = new THREE.DirectionalLight(0x93bec4, 2.4);
    edge.position.set(-70, 35, -50);
    this.scene.add(edge);
    this.scene.add(this.course);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    canvas.addEventListener("keydown", this.keyboard);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.setActive(false);
      this.onUnavailable();
    });
    document.addEventListener("visibilitychange", this.visibility);
  }

  private visibility = () => {
    if (!document.hidden) this.requestRender();
  };

  private requestRender = () => {
    if (this.frameRequested || !this.active || document.hidden) return;
    this.frameRequested = true;
    this.frame = requestAnimationFrame(this.render);
  };

  private render = () => {
    this.frameRequested = false;
    if (!this.active || document.hidden) return;
    this.controls.update(1 / 60);
    this.renderer.render(this.scene, this.camera);
    this.positionGateLabels();
    if (this.rotating) this.requestRender();
  };

  private positionGateLabels() {
    const { width, height } = this.container.getBoundingClientRect();
    const placed: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }[] = [];
    for (const label of this.gateLabels) {
      const projected = label.anchor.clone().project(this.camera);
      label.element.hidden =
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 1.05 ||
        Math.abs(projected.y) > 1.05;
      if (label.element.hidden) continue;
      const w = label.element.offsetWidth,
        h = label.element.offsetHeight;
      let left = Math.max(
        6,
        Math.min(width - w - 6, ((projected.x + 1) / 2) * width - w / 2),
      );
      let top = Math.max(
        6,
        Math.min(height - h - 6, ((1 - projected.y) / 2) * height - h - 6),
      );
      for (const other of placed) {
        if (
          left < other.right + 5 &&
          left + w > other.left - 5 &&
          top < other.bottom + 5 &&
          top + h > other.top - 5
        ) {
          const next = other.right + 8;
          if (next + w < width - 6) left = next;
          else top = Math.max(6, other.top - h - 8);
        }
      }
      label.element.style.left = `${left}px`;
      label.element.style.top = `${top}px`;
      placed.push({ left, top, right: left + w, bottom: top + h });
    }
  }

  private keyboard = (event: KeyboardEvent) => {
    if (["+", "=", "-"].includes(event.key)) {
      this.zoom(event.key === "-" ? 1.15 : 0.87);
      event.preventDefault();
      return;
    }
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const spherical = new THREE.Spherical().setFromVector3(
      this.camera.position.clone().sub(this.controls.target),
    );
    if (event.key === "ArrowLeft") spherical.theta -= 0.12;
    if (event.key === "ArrowRight") spherical.theta += 0.12;
    if (event.key === "ArrowUp")
      spherical.phi = Math.max(
        this.controls.minPolarAngle,
        spherical.phi - 0.1,
      );
    if (event.key === "ArrowDown")
      spherical.phi = Math.min(
        this.controls.maxPolarAngle,
        spherical.phi + 0.1,
      );
    this.camera.position.setFromSpherical(spherical).add(this.controls.target);
    this.controls.update();
    this.requestRender();
  };

  private resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.course.children.length) this.fit();
    this.requestRender();
  }

  setActive(active: boolean) {
    this.active = active;
    this.controls.enabled = active;
    if (active) {
      this.resize();
      this.requestRender();
    } else {
      cancelAnimationFrame(this.frame);
      this.frameRequested = false;
    }
  }

  setRotating(rotating: boolean) {
    this.rotating = rotating;
    this.controls.autoRotate = rotating;
    this.requestRender();
  }

  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset
      .multiplyScalar(factor)
      .clampLength(this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.requestRender();
  }

  fit() {
    const direction = (
      this.camera.aspect >= 1.6
        ? new THREE.Vector3(1.05, 0.9, 0.55)
        : new THREE.Vector3(0.45, 0.83, 1.05)
    ).normalize();
    const box = new THREE.Box3().setFromObject(this.course);
    const center = box.getCenter(new THREE.Vector3());
    this.camera.position.copy(center).add(direction);
    this.camera.lookAt(center);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
      this.camera.quaternion,
    );
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
      this.camera.quaternion,
    );
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    let distance = this.span;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const corner = new THREE.Vector3(x, y, z).sub(center);
          distance = Math.max(
            distance,
            corner.dot(direction) +
              Math.max(
                Math.abs(corner.dot(right)) / tangent / this.camera.aspect,
                Math.abs(corner.dot(up)) / tangent,
              ),
          );
        }
    this.camera.position
      .copy(direction.multiplyScalar(distance * 1.08))
      .add(center);
    this.controls.target.copy(center);
    this.controls.minDistance = this.span * 0.35;
    this.controls.maxDistance = this.span * 4.5;
    this.controls.update();
    this.requestRender();
  }

  clear() {
    this.labelLayer.replaceChildren();
    this.gateLabels = [];
    this.course.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.LineSegments
      ) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if ("map" in material && material.map instanceof THREE.Texture)
            material.map.dispose();
          material.dispose();
        }
      }
    });
    this.course.clear();
    this.requestRender();
  }

  setLayout(
    layout: Layout,
    gates: { role: string; coordinates: Position[] }[] = [],
    grid?: ElevationGrid,
    heightScale = 1,
  ) {
    this.clear();
    const trace = layout.features.find((f) => f.properties.role === "trace")!;
    const local = planarCourse(geometryPaths(trace.geometry));
    const scale = 80 / Math.max(local.width, local.height, 1);
    const width = Math.max(35, local.width * scale + 22),
      height = Math.max(35, local.height * scale + 22);
    this.span = Math.hypot(width, height) * 0.7;
    const slab = new THREE.Mesh(
      new RoundedBoxGeometry(width, 3.2, height, 3, 0.6),
      new THREE.MeshPhysicalMaterial({
        color: 0x9fc8c7,
        transmission: 0.8,
        thickness: 3.2,
        ior: 1.46,
        roughness: 0.12,
        metalness: 0.04,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        attenuationColor: new THREE.Color(0x639e9f),
        attenuationDistance: 12,
        envMapIntensity: 1.6,
      }),
    );
    slab.position.y = -1.7;
    this.course.add(slab);
    const foundation = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({
        map: boardTexture(width, height, local.origin),
        roughness: 0.42,
        metalness: 0.3,
      }),
    );
    foundation.rotation.x = -Math.PI / 2;
    foundation.position.y = -3.4;
    this.course.add(foundation);
    let floor = 0;
    if (grid) {
      const surface = terrainSurface(
        grid,
        width,
        height,
        local.origin,
        scale,
        heightScale,
      );
      floor = surface.floor;
      this.course.add(
        new THREE.Mesh(
          surface.geometry,
          new THREE.MeshPhysicalMaterial({
            color: 0x29474e,
            metalness: 0.12,
            roughness: 0.58,
            clearcoat: 0.35,
            clearcoatRoughness: 0.3,
            envMapIntensity: 0.85,
            transparent: true,
            opacity: 0.82,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        ),
      );
      this.course.add(
        new THREE.Mesh(
          surface.walls,
          new THREE.MeshPhysicalMaterial({
            color: 0x7ba8ac,
            roughness: 0.24,
            metalness: 0.12,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        ),
      );
      this.course.add(
        new THREE.LineSegments(
          surface.contours,
          new THREE.LineBasicMaterial({
            color: 0xa5cdca,
            transparent: true,
            opacity: 0.24,
            depthWrite: false,
          }),
        ),
      );
    } else {
      const surface = foundation.clone();
      surface.geometry = foundation.geometry.clone();
      surface.material = foundation.material.clone();
      surface.position.y = 0.05;
      this.course.add(surface);
    }
    const altitude = (p: Position) =>
      grid
        ? (sampleElevation(grid, p)! - floor) * scale * heightScale + 0.16
        : 0.05;
    const mats = [
      new THREE.MeshStandardMaterial({
        color: 0x243136,
        roughness: 0.38,
        metalness: 0.3,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshPhysicalMaterial({
        color: 0xf46a32,
        emissive: 0xf06a35,
        emissiveIntensity: 0.18,
        metalness: 0.25,
        roughness: 0.38,
        clearcoat: 0.8,
        clearcoatRoughness: 0.18,
        envMapIntensity: 1.1,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshBasicMaterial({
        color: 0xffd3a5,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      }),
    ];
    const geographic = geometryPaths(trace.geometry);
    for (const [pathIndex, path] of local.paths.entries()) {
      const points = path.map(
        (p, i) =>
          new THREE.Vector3(
            p[0] * scale,
            altitude(geographic[pathIndex][i]),
            -p[1] * scale,
          ),
      );
      for (const [i, [ribbonWidth, elevation]] of [
        [1.45, 0.13],
        [1.02, 0.2],
        [0.075, 0.215],
      ].entries()) {
        this.course.add(
          new THREE.Mesh(
            ribbon(points, ribbonWidth, elevation),
            mats[i].clone(),
          ),
        );
      }
    }
    for (const mat of mats) mat.dispose();
    const publicGates = layout.features
      .filter((f) => f.properties.role !== "trace")
      .map((f) => ({
        role: f.properties.role,
        coordinates: geometryPaths(f.geometry)[0],
        positionStatus:
          "positionStatus" in f.properties
            ? f.properties.positionStatus
            : "estimated",
      }));
    const toLocal = (p: Position) => {
      const metres = (6371008.8 * Math.PI) / 180;
      return new THREE.Vector3(
        (p[0] - local.origin[0]) *
          metres *
          Math.cos((local.origin[1] * Math.PI) / 180) *
          scale,
        altitude(p),
        -(p[1] - local.origin[1]) * metres * scale,
      );
    };
    for (const gate of [...publicGates, ...gates]) {
      if (
        grid &&
        gate.coordinates.some((point) => sampleElevation(grid, point) === null)
      )
        continue;
      const first = gate.coordinates[0],
        last = gate.coordinates.at(-1)!;
      const points = Array.from({ length: 9 }, (_, i) =>
        toLocal([
          first[0] + ((last[0] - first[0]) * i) / 8,
          first[1] + ((last[1] - first[1]) * i) / 8,
        ]),
      );
      const color = gate.role === "finish" ? 0xff8383 : 0x78e3bf;
      this.course.add(
        new THREE.Mesh(
          ribbon(points, 0.65, 0.5),
          new THREE.MeshBasicMaterial({
            color,
            toneMapped: false,
            side: THREE.DoubleSide,
          }),
        ),
      );
      const center = toLocal([
        (first[0] + last[0]) / 2,
        (first[1] + last[1]) / 2,
      ]);
      center.y += 0.52;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.6, 0.075, 6, 28),
        new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(center);
      this.course.add(ring);
      const anchor = center.clone().add(new THREE.Vector3(0, 3.4, 0));
      const stem = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints([center, anchor]),
        new THREE.LineBasicMaterial({ color, toneMapped: false }),
      );
      this.course.add(stem);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 8, 6),
        new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      );
      tip.position.copy(anchor);
      this.course.add(tip);
      const label = document.createElement("div");
      label.className = `timing-label ${gate.role === "finish" ? "is-finish" : "is-start"}`;
      label.dataset.role = gate.role;
      const name = document.createElement("strong");
      name.textContent =
        gate.role === "start_finish"
          ? "Start / finish"
          : gate.role === "finish"
            ? "Finish"
            : "Start";
      const status = document.createElement("span");
      status.textContent =
        "positionStatus" in gate && gate.positionStatus === "verified"
          ? "Verified position"
          : "Estimated position";
      label.append(name, status);
      label.title = `${name.textContent}. ${status.textContent}. Display marker at the supplied timing position.`;
      this.labelLayer.append(label);
      this.gateLabels.push({ element: label, anchor });
    }
    this.fit();
    this.requestRender();
  }
}
