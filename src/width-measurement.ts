import { geometryPaths, type Layout } from "../schemas/data";
import { plane } from "./geo";
import { indexBorders, borderSection } from "./border-sections";
/** Read only saved geometry. No images, network requests, path optimization or imagery validation. */
export function measureSavedWidth(layout: Layout) {
  const trace = layout.features.find((f) => f.properties.role === "trace");
  const inner = layout.features.find((f) => f.properties.role === "inner"),
    outer = layout.features.find((f) => f.properties.role === "outer");
  if (!trace || !inner || !outer) throw Error("No saved boundary pair");
  const paths = geometryPaths(trace.geometry),
    project = plane(paths[0][0]);
  const left = geometryPaths(inner.geometry).map((p) => p.map(project.to)),
    right = geometryPaths(outer.geometry).map((p) => p.map(project.to));
  let weighted = 0,
    length = 0,
    samples = 0,
    missing = 0;
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const edges =
      paths.length > 1 &&
      left.length === paths.length &&
      right.length === paths.length
        ? [left[pathIndex], right[pathIndex]]
        : [...left, ...right];
    const index = indexBorders(edges);
    if (
      !(
        paths.length > 1 &&
        left.length === paths.length &&
        right.length === paths.length
      )
    ) {
      const segments = new Set([...index.cells.values()].flat());
      for (const s of segments) s.side = s.side < left.length ? 0 : 1;
    }
    const points = paths[pathIndex].map(project.to);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        ds = Math.hypot(dx, dy);
      if (ds < 1e-6) continue;
      const count = Math.ceil(ds / 15);
      for (let j = 0; j < count; j++) {
        const t = (j + 0.5) / count,
          x = a[0] + t * dx,
          y = a[1] + t * dy;
        const section = borderSection(index, x, y, -dy / ds, dx / ds);
        if (section) {
          weighted += ((section[0] + section[1]) * ds) / count;
          length += ds / count;
          samples++;
        } else missing++;
      }
    }
  }
  if (samples)
    return {
      meanWidthM: weighted / length,
      lengthM: length,
      sampleCount: samples,
      interpolatedSections: missing,
      method: "length-weighted-cross-sections-v1" as const,
    };
  // Some archived routes do not run between their saved edges. Use edge separation as an explicit fallback.
  const a = left.flat(),
    b = right.flat();
  let sum = 0,
    count = 0;
  for (let i = 0; i < a.length; i += Math.max(1, Math.floor(a.length / 200))) {
    const p = a[i];
    let best = Infinity;
    for (let j = 1; j < b.length; j++) {
      const u = b[j - 1],
        v = b[j],
        dx = v[0] - u[0],
        dy = v[1] - u[1],
        t = Math.max(
          0,
          Math.min(
            1,
            ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) /
              (dx * dx + dy * dy || 1),
          ),
        );
      best = Math.min(
        best,
        Math.hypot(p[0] - u[0] - t * dx, p[1] - u[1] - t * dy),
      );
    }
    if (best >= 3 && best <= 45) {
      sum += best;
      count++;
    }
  }
  if (!count) throw Error("Saved edges have no supported width samples");
  return {
    meanWidthM: sum / count,
    lengthM: layout.metadata.lengthM,
    sampleCount: count,
    interpolatedSections: missing,
    method: "nearest-edge-separation-v1" as const,
  };
}
