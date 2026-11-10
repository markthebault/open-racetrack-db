import { pathCurvatures } from "./path-curvature";
import { CatmullRomCurve3, Vector3 } from "three";
import { R, rad, equal, type Position } from "./geo";
export const WIDTH_REFERENCE_STEP_M = 1.5;
export interface TraceFrame {
  x: number;
  y: number;
  nx: number;
  ny: number;
  s: number;
  sourceFraction: number;
}
/** Smooth estimated reference through mapped trace vertices; source coordinates are never edited. */
export function traceWidthReference(
  trace: Position[],
  closed: boolean,
  widthM?: number,
) {
  const origin = trace[0],
    cos = Math.cos(origin[1] * rad),
    k = R * rad;
  const raw = (
    closed && equal(trace[0], trace.at(-1)!) ? trace.slice(0, -1) : trace
  ).map(
    (p) =>
      new Vector3((p[0] - origin[0]) * k * cos, 0, -(p[1] - origin[1]) * k),
  );
  if (raw.length < (closed ? 3 : 2))
    throw Error("Trace is too short for a width corridor");
  const curve = new CatmullRomCurve3(raw, closed, "centripetal");
  curve.arcLengthDivisions = 16000;
  const length = curve.getLength(),
    segments = Math.ceil(length / WIDTH_REFERENCE_STEP_M),
    count = segments + (closed ? 0 : 1),
    step = length / segments;
  const frames: TraceFrame[] = Array.from({ length: count }, (_, i) => {
    const u = i / segments,
      p = curve.getPointAt(u),
      t = curve.getTangentAt(u).normalize();
    return {
      x: p.x,
      y: -p.z,
      nx: t.z,
      ny: t.x,
      s: i * step,
      sourceFraction: curve.getUtoTmapping(u, 0),
    };
  });
  let maximumReferenceShiftM = 0;
  if (widthM) {
    const original = frames.map((p) => ({ x: p.x, y: p.y })),
      at = (i: number) =>
        closed ? (i + count) % count : Math.max(0, Math.min(count - 1, i));
    const updateNormals = () =>
      frames.forEach((p, i) => {
        const a = frames[at(i - 1)],
          b = frames[at(i + 1)],
          dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy);
        if (d > 1e-9) {
          p.nx = -dy / d;
          p.ny = dx / d;
        }
      });
    updateNormals();
    for (let sweep = 0; sweep < 180; sweep++) {
      const curvature = pathCurvatures(
          frames.map((p) => ({ x: p.x, z: -p.y })),
          closed,
          3,
        ),
        bad = curvature.flatMap((k, i) => {
          const a = frames[at(i - 1)],
            p = frames[i],
            b = frames[at(i + 1)];
          const ab = Math.hypot(p.x - a.x, p.y - a.y),
            bc = Math.hypot(b.x - p.x, b.y - p.y),
            ac = Math.hypot(b.x - a.x, b.y - a.y);
          const local =
            (2 * ((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x))) /
            Math.max(1e-9, ab * bc * ac);
          if ((Math.max(Math.abs(k), Math.abs(local)) * widthM) / 2 > 0.88)
            return [i];
          const dx = b.x - p.x,
            dy = b.y - p.y;
          if (!closed && i === count - 1) return [];
          for (const side of [-1, 1])
            if (
              (dx + (side * (b.nx - p.nx) * widthM) / 2) * dx +
                (dy + (side * (b.ny - p.ny) * widthM) / 2) * dy <=
              0
            )
              return [i];
          return [];
        });
      if (!bad.length) break;
      const affected = new Set<number>();
      for (const i of bad)
        for (let j = -8; j <= 8; j++) affected.add(at(i + j));
      const updates = new Map<number, [number, number]>();
      for (const i of affected) {
        if (!closed && (i < 2 || i > count - 3)) continue;
        let x = 0,
          y = 0,
          w = 0;
        for (let j = -4; j <= 4; j++) {
          const weight = Math.exp((-j * j) / 8),
            q = frames[at(i + j)];
          x += q.x * weight;
          y += q.y * weight;
          w += weight;
        }
        x = frames[i].x + (x / w - frames[i].x) * 0.35;
        y = frames[i].y + (y / w - frames[i].y) * 0.35;
        const dx = x - original[i].x,
          dy = y - original[i].y,
          d = Math.hypot(dx, dy),
          limit = widthM / 2;
        if (d > limit) {
          x = original[i].x + (dx / d) * limit;
          y = original[i].y + (dy / d) * limit;
        }
        updates.set(i, [x, y]);
      }
      for (const [i, [x, y]] of updates) {
        frames[i].x = x;
        frames[i].y = y;
        maximumReferenceShiftM = Math.max(
          maximumReferenceShiftM,
          Math.hypot(x - original[i].x, y - original[i].y),
        );
      }
      updateNormals();
    }
    frames.forEach((p, i) => {
      const a = frames[at(i - 1)],
        b = frames[at(i + 1)],
        dx = b.x - a.x,
        dy = b.y - a.y,
        d = Math.hypot(dx, dy);
      p.nx = -dy / d;
      p.ny = dx / d;
    });
  }
  const geographic = (p: Position): Position => [
    +(origin[0] + p[0] / k / cos).toFixed(10),
    +(origin[1] + p[1] / k).toFixed(10),
  ];
  return { origin, frames, length, step, geographic, maximumReferenceShiftM };
}
export function widthEdges(
  reference: ReturnType<typeof traceWidthReference>,
  widthM: number,
  closed: boolean,
) {
  const left = reference.frames.map((p) =>
      reference.geographic([
        p.x + (p.nx * widthM) / 2,
        p.y + (p.ny * widthM) / 2,
      ]),
    ),
    right = reference.frames.map((p) =>
      reference.geographic([
        p.x - (p.nx * widthM) / 2,
        p.y - (p.ny * widthM) / 2,
      ]),
    );
  if (closed) {
    left.push(left[0]);
    right.push(right[0]);
  }
  return { left, right };
}
