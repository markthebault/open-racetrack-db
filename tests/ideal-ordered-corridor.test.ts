import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geometryPaths, type Layout } from "../schemas/data";
import { orderedBorderCorridor, orderedIdealLine } from "../scripts/ideal-ordered-corridor";
import { groundSegmentClearanceM } from "../src/ribbon-surface";
import { pathCrossings } from "../src/path-crossings";
import { IDEAL_CAR } from "../src/ideal-line-model";
import type { Position } from "../src/geo";
const file = "data/australia/au-oran-park-raceway-692abacd/layouts/oran-park-raceway.geojson";
const load = (file: string) => JSON.parse(readFileSync(file,"utf8")) as Layout;
const original = load(file);
const key = (p: Position) => p.map(v=>v.toFixed(6)).join(",");
test("ordered correspondence retains every original edge vertex independently of ring storage direction", () => {
  const d=structuredClone(original);
  for(const f of d.features.filter(f=>f.properties.role==="inner"||f.properties.role==="outer")) {
    const path=geometryPaths(f.geometry)[0].slice(0,-1), rotated=[...path.slice(31),...path.slice(0,31)].reverse();
    rotated.push(rotated[0]);f.geometry={type:"LineString",coordinates:rotated};
  }
  const before=structuredClone(d),corridor=orderedBorderCorridor(d);
  for(const [i,role] of ["inner","outer"].entries()) {
    const used=new Set(corridor.pairs.map(p=>key(i===0?p.a:p.b)));
    for(const p of geometryPaths(d.features.find(f=>f.properties.role===role)!.geometry)[0]) assert.ok(used.has(key(corridor.project.to(p))),role);
  }
  assert.deepEqual(d,before);
});
test("every stored ordered-ribbon ideal clears its complete local segments and preserves its source crossing", () => {
  const report=JSON.parse(readFileSync("data/ideal-lines-coverage.json","utf8"));let count=0;
  for(const row of report.records.filter((r:{status:string})=>r.status==="generated")) {
    const d=load(row.file),ideal=d.features.find(f=>f.properties.role==="ideal");
    if(ideal?.properties.role!=="ideal"||ideal.properties.boundaryModel!=="ordered-border-ribbon-v1") continue;
    assert.equal(ideal.geometry.type,"LineString");
    const result=orderedIdealLine(d),points=geometryPaths(ideal.geometry)[0].slice(0,-1).map(result.project.to);
    assert.equal(points.length,result.points.length);
    for(const [i,p] of points.entries())assert.ok(groundSegmentClearanceM(result.footprints[i],p,points[(i+1)%points.length])>=IDEAL_CAR.widthM/2+ideal.properties.edgeMarginM);
    const crossings=pathCrossings(points,true),source=pathCrossings(result.source,true);
    assert.equal(crossings.length,source.length);assert.equal(crossings.length,1);assert.equal(crossings[0].kind,"crossing");
    assert.ok(Math.hypot(crossings[0].point[0]-source[0].point[0],crossings[0].point[1]-source[0].point[1])<45);
    assert.ok(points.some((p,i)=>Math.hypot(p[0]-(result.pairs[i].a[0]+result.pairs[i].b[0])/2,p[1]-(result.pairs[i].a[1]+result.pairs[i].b[1])/2)>0.1));
    count++;
  }
  assert.ok(count>0);
});
test("ordered ribbons reject source pinches, folds and routes without projected crossings", () => {
  for(const f of ["data/new-zealand/nz-highlands-motorsports-park-full-2952eb45/layouts/highlands-motorsports-park-full.geojson","data/south-korea/kr-everland-speedway-6b81a616/layouts/everland-speedway.geojson"])assert.throws(()=>orderedIdealLine(load(f)),/alignment|width|cross-section/);
  assert.throws(()=>orderedBorderCorridor(load("data/belgium/spa-francorchamps/layouts/grand-prix.geojson")),/source crossing/);
});
