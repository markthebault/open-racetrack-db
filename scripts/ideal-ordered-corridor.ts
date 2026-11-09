import { geometryPaths, type Layout } from '../schemas/data';
import { plane, type Position, equal } from '../src/geo';
import { assertSeparateSimpleRings } from '../src/boundary-path';
import { pathCrossings } from '../src/path-crossings';
import { groundFootprintFromRings, groundSegmentClearanceM } from '../src/ribbon-surface';
import type { MultiPolygon } from 'polygon-clipping';
import { IDEAL_CAR } from '../src/ideal-line-model';
import { optimizeLine } from './ideal-line-solver';
export function alignClosedBorders(layout: Layout, minimumWidthM = IDEAL_CAR.widthM + 1.04, maximumAlignmentCells = 20000000) {
  if (!layout.metadata.closed || layout.metadata.geometryKind === 'network')
    throw Error('Ordered ribbon requires a closed independent route');
  if (['trace', 'inner', 'outer'].some(role => layout.features.find(f => f.properties.role === role)?.geometry.type !== 'LineString'))
    throw Error('Ordered ribbon requires single continuous source paths');
  const trace = geometryPaths(layout.features.find(f => f.properties.role === 'trace')!.geometry)[0], project = plane(trace[0]), source = trace.map(project.to), tangent = [source[1][0] - source.at(-2)![0], source[1][1] - source.at(-2)![1]];
  if (!equal(trace[0], trace.at(-1)!)) throw Error('Ordered source route is not closed');
  // Rotate each complete edge to the source start and retain its travel order.
  // Densification inserts points on original segments and retains every vertex.
  const edges = ['inner', 'outer'].map(role => {
    const path = geometryPaths(layout.features.find(f => f.properties.role === role)!.geometry)[0].map(project.to);
    if (!equal(path[0], path.at(-1)!))
      throw Error('Open border');
    let best = { d: Infinity, index: 0, t: 0, sign: 1 };
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(a[0] + t * dx, a[1] + t * dy);
      if (d < best.d)
        best = { d, index: i, t, sign: Math.sign(dx * tangent[0] + dy * tangent[1]) || 1 };
    }
    const a = path[best.index], b = path[best.index + 1], start: Position = [a[0] + best.t * (b[0] - a[0]), a[1] + best.t * (b[1] - a[1])], vertices = path.slice(0, -1), n = vertices.length;
    const raw = [start, ...Array.from({ length: n }, (_, j) => vertices[((best.sign > 0 ? best.index + 1 : best.index) + best.sign * j + n * 2) % n]), start].filter((p, i, all) => !i || !equal(p, all[i - 1]));
    const points: Position[] = [raw[0]], stations = [0];
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1], b = raw[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.ceil(length / 3);
      for (let j = 1; j <= count; j++) {
        points.push(j === count ? b : [a[0] + j / count * (b[0] - a[0]), a[1] + j / count * (b[1] - a[1])]);
        stations.push(stations.at(-1)! + length / count);
      }
    }
    return { points, stations, total: stations.at(-1)! };
  });
  const [a, b] = edges, n = a.points.length, m = b.points.length;
  const width = [b.points[0][0]-a.points[0][0],b.points[0][1]-a.points[0][1]];
  const orientation = Math.sign(tangent[0]*width[1]-tangent[1]*width[0]);
  const validCell = (a0: Position, a1: Position, b0: Position, b1: Position) => {
    const raw = [a0, a1, b1, b0];
    const q = raw.filter((p, i) => !i || Math.hypot(p[0]-raw[i-1][0],p[1]-raw[i-1][1])>1e-7);
    if (q.length > 1 && Math.hypot(q[0][0]-q.at(-1)![0],q[0][1]-q.at(-1)![1])<1e-7) q.pop();
    const area = q.reduce((sum,p,i) => { const r=q[(i+1)%q.length]; return sum+p[0]*r[1]-r[0]*p[1]; },0);
    if (orientation*area<=1e-7) return false;
    const side = (a: Position,b: Position,p: Position) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
    const on = (a: Position,b: Position,p: Position) => Math.abs(side(a,b,p))<1e-7 && p[0]>=Math.min(a[0],b[0]) && p[0]<=Math.max(a[0],b[0]) && p[1]>=Math.min(a[1],b[1]) && p[1]<=Math.max(a[1],b[1]);
    const hit = (a: Position,b: Position,c: Position,d: Position) =>
      (side(a,b,c)*side(a,b,d)<0 && side(c,d,a)*side(c,d,b)<0) || on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
    return q.length===3 || (q.length===4 && !hit(q[0],q[1],q[2],q[3]) && !hit(q[1],q[2],q[3],q[0]));
  };
  if (n * m > maximumAlignmentCells)
    throw Error('Alignment too large');
  // Monotonic dynamic alignment consumes every sample of both borders. The
  // 120 m station band prevents matching the other visit to a distant crossing.
  const parent = new Uint8Array(n * m);
  let prev = new Float64Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    const row = new Float64Array(m + 1).fill(Infinity);
    for (let j = 1; j <= m; j++) {
      if (Math.abs(a.stations[i - 1] / a.total - b.stations[j - 1] / b.total) * Math.min(a.total, b.total) > 120)
        continue;
      const p = a.points[i - 1], q = b.points[j - 1], d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if(d<minimumWidthM**2||d>45**2) continue;
      const costs = [
        i===1&&j===1 ? 2*d : i>1&&j>1&&validCell(a.points[i-2],p,b.points[j-2],q) ? prev[j-1]+2*d : Infinity,
        i>1&&validCell(a.points[i-2],p,q,q) ? prev[j]+d+4 : Infinity,
        j>1&&validCell(p,p,b.points[j-2],q) ? row[j-1]+d+4 : Infinity,
      ];
      let which = 0;
      if (costs[1] < costs[which])
        which = 1;
      if (costs[2] < costs[which])
        which = 2;
      row[j] = costs[which];
      parent[(i - 1) * m + j - 1] = which + 1;
    }
    prev = row;
  }
  if (!Number.isFinite(prev[m]))
    throw Error('No alignment');
  const pairs: {
    a: Position;
    b: Position;
    ai: number;
    bi: number;
  }[] = [];
  let i = n, j = m;
  while (i && j) {
    pairs.push({ a: a.points[i - 1], b: b.points[j - 1], ai: i - 1, bi: j - 1 });
    const p = parent[(i - 1) * m + j - 1];
    if (p === 1) {
      i--;
      j--;
    }
    else if (p === 2)
      i--;
    else if (p === 3)
      j--;
    else
      throw Error('Missing alignment parent');
  }
  if (i || j)
    throw Error('Incomplete alignment');
  pairs.reverse();
  pairs.pop();
  return { pairs, project, origin: trace[0], source };
}
export function orderedBorderCorridor(layout: Layout, minimumWidthM = IDEAL_CAR.widthM + 1.04) {
  const trace = layout.features.find(f => f.properties.role === 'trace')?.geometry;
  if (trace?.type !== 'LineString' || !pathCrossings(trace.coordinates.map(plane(trace.coordinates[0]).to), true).some(c => c.kind === 'crossing'))
    throw Error('Ordered ribbon requires a projected source crossing');
  return alignClosedBorders(layout, minimumWidthM);
}
/** Two-dimensional source-order ribbon; no bridge heights are inferred. */
export function orderedIdealLine(layout: Layout, edgeMarginM = 0.5) {
  const corridor = orderedBorderCorridor(layout, 2*(IDEAL_CAR.widthM/2+edgeMarginM+0.02)), pairs = corridor.pairs, n = pairs.length;
  const mid = pairs.map(p => [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2] as Position);
  const widths = pairs.map(p => Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]));
  let orientation = 0;
  for (let i = 0; i < n; i++) {
    if (widths[i] < 2 * (IDEAL_CAR.widthM / 2 + edgeMarginM + 0.02) || widths[i] > 45)
      throw Error('Ordered ribbon has unsupported source width');
    const p = pairs[i], q = pairs[(i + 1) % n], raw = [p.a, q.a, q.b, p.b, p.a];
    const quad = raw.filter((p, j) => !j || Math.hypot(p[0]-raw[j-1][0],p[1]-raw[j-1][1])>1e-7);
    assertSeparateSimpleRings([quad]);
    const area = quad.slice(1).reduce((s, p, j) => s + quad[j][0] * p[1] - p[0] * quad[j][1], 0);
    if (!orientation)
      orientation = Math.sign(area);
    if (Math.sign(area) !== orientation || Math.abs(area) < 1e-8)
      throw Error('Ordered ribbon has a folded cross-section');
  }
  // Each local strip extends 20 m beyond the segment. This retains this branch's
  // original edges without importing the edges of another projected level.
  const footprints: MultiPolygon[] = [], clearances: number[] = [];
  for (let i = 0; i < n; i++) {
    let a = i, b = i + 1, dl = 0, dr = 0;
    while (dl < 20 && i - a < n / 4) {
      const p = mid[(a + n) % n], q = mid[(a + n - 1) % n];
      dl += Math.hypot(p[0] - q[0], p[1] - q[1]);
      a--;
    }
    while (dr < 20 && b - i < n / 4) {
      const p = mid[b % n], q = mid[(b + 1) % n];
      dr += Math.hypot(p[0] - q[0], p[1] - q[1]);
      b++;
    }
    if (dl < 20 || dr < 20)
      throw Error('Ordered ribbon lacks longitudinal validation space');
    const indices = Array.from({ length: b - a + 1 }, (_, j) => (a + j + n * 2) % n);
    const raw = [...indices.map(j => pairs[j].a), ...indices.slice().reverse().map(j => pairs[j].b)];
    const ring = raw.filter((p, j) => !j || Math.hypot(p[0]-raw[j-1][0],p[1]-raw[j-1][1])>1e-7);
    ring.push(ring[0]);
    assertSeparateSimpleRings([ring]);
    const footprint = groundFootprintFromRings([ring], []);
    footprints.push(footprint);
    clearances.push(groundSegmentClearanceM(footprint, mid[i], mid[(i + 1) % n]));
  }
  const stations = mid.map((p, i) => ({ x: p[0], z: -p[1], y: 0, nx: (pairs[i].b[0] - pairs[i].a[0]) / widths[i], nz: -(pairs[i].b[1] - pairs[i].a[1]) / widths[i], halfWidth: Math.min(clearances[i], clearances[(i + n - 1) % n]) }));
  if (clearances.some(c => c < IDEAL_CAR.widthM / 2 + edgeMarginM + 0.02))
    throw Error('Source ribbon midpoint has insufficient car-width clearance');
  const result = optimizeLine(stations, true, IDEAL_CAR);
  const minimumClearance = Math.min(...result.points.map((p, i) => {
    const q = result.points[(i + 1) % n];
    return groundSegmentClearanceM(footprints[i], [p.x, -p.z], [q.x, -q.z]);
  }));
  if (minimumClearance < IDEAL_CAR.widthM / 2 + edgeMarginM + 0.02)
    throw Error('Ideal ribbon segment has insufficient car-width clearance');
  const path = result.points.map(p => [p.x, -p.z] as Position);
  const sourceCrossings = pathCrossings(corridor.source, true), crossings = pathCrossings(path, true);
  const perimeter = (p: Position[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + Math.hypot(a[0] - b[0], a[1] - b[1]); }, 0);
  const sourceLength = perimeter(corridor.source), idealLength = perimeter(path);
  if (crossings.length !== sourceCrossings.length || crossings.some((c, i) => c.kind !== 'crossing' || sourceCrossings[i].kind !== 'crossing' ||
    Math.hypot(c.point[0] - sourceCrossings[i].point[0], c.point[1] - sourceCrossings[i].point[1]) > 45 ||
    c.stations.some((s, j) => Math.abs(s / idealLength - sourceCrossings[i].stations[j] / sourceLength) * sourceLength > 120)))
    throw Error('Ideal ribbon does not preserve the projected source crossings in order');
  return { ...result, ...corridor, footprints, minimumClearance };
}
