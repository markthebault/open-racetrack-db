import type { Layout } from "../schemas/data";
import type { GradeSeparation } from "../schemas/grade-separation";
import { equal, plane, type Position } from "./geo";
import { pathCrossings } from "./path-crossings";

export function gradeProfileHeight(recipe: GradeSeparation, station: number) {
  const anchors = recipe.elevation.anchors,
    s =
      ((station % recipe.stationCount) + recipe.stationCount) %
      recipe.stationCount;
  let lo = 0,
    hi = anchors.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid][0] <= s) lo = mid;
    else hi = mid;
  }
  const [a, b] = [anchors[lo], anchors[hi]],
    t = (s - a[0]) / (b[0] - a[0]);
  return a[1] * (1 - t) + b[1] * t;
}

const insideRange = (s: number, r: [number, number]) =>
  r[0] <= r[1] ? s >= r[0] && s <= r[1] : s >= r[0] || s <= r[1];

export const onBridge = (recipe: GradeSeparation, station: number) =>
  recipe.crossings.some((c) => insideRange(station, c.upper));

/** All four ribbon intersections must belong to explicit, separated source stations. */
export function assertGradeRibbon(
  pair: { inner: Position[]; outer: Position[] },
  recipe: GradeSeparation,
) {
  const paths = [pair.inner, pair.outer],
    n = recipe.stationCount;
  if (paths.some((p) => p.length !== n + 1 || !equal(p[0], p[n])))
    throw new Error(
      "Grade-separated edges must share the recipe's closed station grid",
    );
  const projection = plane(pair.inner[0]),
    planar = paths.map((p) => p.map(projection.to)),
    mid = planar[0].map((p, i): Position => [
      (p[0] + planar[1][i][0]) / 2,
      (p[1] + planar[1][i][1]) / 2,
    ]),
    index = (i: number) => (i + n) % n;
  for (let i = 0; i < n; i++) {
    const a = mid[index(i - 2)],
      b = mid[index(i + 2)],
      tangent: Position = [b[0] - a[0], b[1] - a[1]],
      width: Position = [
        planar[0][i][0] - planar[1][i][0],
        planar[0][i][1] - planar[1][i][1],
      ],
      length = Math.hypot(...width);
    if (
      length < 3.5 ||
      length > 45 ||
      width[1] * tangent[0] - width[0] * tangent[1] <= 0
    )
      throw new Error(
        "Grade-separated ribbon has invalid widths or reversed left/right stations",
      );
  }
  const totals = recipe.crossings.map(() => [0, 0, 0]);
  const check = (a: number, b: number, kind: string, edge: number) => {
    const matches = recipe.crossings.flatMap((crossing, i) => {
      const inside = insideRange;
      return (inside(a, crossing.upper) && inside(b, crossing.lower)) ||
        (inside(b, crossing.upper) && inside(a, crossing.lower))
        ? [i]
        : [];
    });
    if (kind === "overlap" || matches.length !== 1)
      throw new Error("Unexplained crossing in grade-separated ribbon");
    const crossing = recipe.crossings[matches[0]],
      aIsUpper = insideRange(a, crossing.upper);
    if (
      gradeProfileHeight(recipe, aIsUpper ? a : b) -
        gradeProfileHeight(recipe, aIsUpper ? b : a) <
      3
    )
      throw new Error(
        "Crossing road levels have insufficient evidenced separation",
      );
    totals[matches[0]][edge]++;
  };
  planar.forEach((path, edge) => {
    for (const hit of pathCrossings(path, true))
      check(
        hit.segments[0] + hit.fractions[0],
        hit.segments[1] + hit.fractions[1],
        hit.kind,
        edge,
      );
  });
  // The synthetic connecting segment is ignored; only intersections between the two edges count.
  const combined = [...planar[0], ...planar[1]],
    offset = planar[0].length;
  for (const hit of pathCrossings(combined))
    if (hit.segments[0] < n && hit.segments[1] >= offset)
      check(
        hit.segments[0] + hit.fractions[0],
        hit.segments[1] - offset + hit.fractions[1],
        hit.kind,
        2,
      );
  if (totals.some((t) => t[0] !== 1 || t[1] !== 1 || t[2] !== 2))
    throw new Error(
      "Every declared bridge must explain one crossing per edge and two between edges",
    );
}

export function gradeForLayout(layout?: Layout) {
  const model = layout?.metadata.model3d;
  return (
    (model && model.kind !== "surface" ? model.gradeSeparation : undefined) ??
    layout?.metadata.borderInference?.gradeSeparation
  );
}
