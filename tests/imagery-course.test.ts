import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageryCoordinates,buildImageryCourse,validateImageryRaster,type ImageryCourse} from '../scripts/imagery-course';
import {validateTrack} from '../schemas/data';

const source:ImageryCourse={schemaVersion:1,sourceKind:'georeferenced-imagery',sourceId:'usgs-fixture',attribution:'USGS fixture',license:'public-domain',imageryFile:'fixture.png',imagerySha256:'a'.repeat(64),sourceUrl:'https://www.usgs.gov/',reuseEvidenceUrl:'https://www.usgs.gov/data-policy',retrievedAt:'2026-10-02T00:00:00Z',width:100,height:100,extent:{xmin:0,ymin:0,xmax:100,ymax:100,spatialReference:3857},pixels:[[0,0],[50,0],[50,50],[0,0]],closed:true,identificationUrl:'https://example.org/',evidence:'Fixture centerline.'};
const track=validateTrack({schemaVersion:1,id:'fixture',name:'Fixture',aliases:[],country:{code:'US',name:'United States',slug:'united-states'},location:[0,0],sourceIds:['usgs-fixture'],defaultLayoutId:'main',layouts:[{id:'main',name:'Main',file:'layouts/main.geojson'}],sources:[{id:source.sourceId,type:'imagery',title:'USGS',url:source.sourceUrl,license:source.license,retrievedAt:source.retrievedAt,evidenceNote:'Public-domain source.'}]});
const recipe={geometrySource:'imagery',sourceId:source.sourceId,closed:true,layoutId:'main',timingMode:'shared',notes:['Independent image centerline.'],gates:[]};

test('Web Mercator pixel conversion preserves raster orientation and pixel centers',()=>{
 const coordinates=imageryCoordinates(source),metersPerDegree=6378137*Math.PI/180;
 assert.ok(Math.abs(coordinates[0][0]*metersPerDegree-.5)<.01);
 assert.ok(Math.abs(coordinates[0][1]*metersPerDegree-99.5)<.01);
 assert.ok(coordinates[1][0]>coordinates[0][0]);assert.ok(coordinates[2][1]<coordinates[1][1]);
 assert.deepEqual(coordinates[0],coordinates.at(-1));
});
test('invalid georeferencing, out-of-raster vertices and untraced long joins are rejected',()=>{
 assert.throws(()=>imageryCoordinates({...source,extent:{...source.extent,xmax:-1}}),/inverted/);
 assert.throws(()=>imageryCoordinates({...source,pixels:[[100,0],[50,0],[0,0]]}),/outside raster/);
 assert.throws(()=>imageryCoordinates({...source,extent:{...source.extent,xmax:1000}}),/closer centerline/);
 assert.throws(()=>imageryCoordinates({...source,closed:false}),/closure mismatch/);
});
test('imagery attribution stays independent of OSM and requires a registered reusable source',()=>{
 const layout=buildImageryCourse(recipe,source,track);
 assert.equal(layout.metadata.attribution,'USGS fixture');assert.equal(layout.metadata.geometryStatus,'draft');assert.equal(layout.metadata.timingStatus,'missing');
 assert.deepEqual(layout.features[0].properties.sourceIds,['usgs-fixture']);
 assert.throws(()=>buildImageryCourse(recipe,source,{...track,sources:[{...track.sources[0],type:'reference'}]}),/rights/);
 assert.throws(()=>buildImageryCourse({...recipe,sourceId:'other'},source,track),/mismatch/);
 assert.throws(()=>buildImageryCourse({...recipe,gates:[{}]},source,track),/separate independently/);
});

test('raster dimensions must match the recorded georeferencing',()=>{
 const bytes=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(100,16);bytes.writeUInt32BE(100,20);
 validateImageryRaster(source,bytes);
 assert.throws(()=>validateImageryRaster({...source,width:101},bytes),/dimensions/);
 assert.throws(()=>validateImageryRaster(source,Buffer.alloc(40)),/PNG raster/);
});

test('government orthoimagery retains its reuse terms and attribution',()=>{
 const government={...source,license:'LicenseRef-GUGiK-open-data' as const,attribution:'GUGiK orthoimagery'};
 const registered={...track,sources:[{...track.sources[0],license:government.license}]};
 const layout=buildImageryCourse(recipe,government,registered);
 assert.equal(layout.metadata.attribution,government.attribution);
 assert.throws(()=>buildImageryCourse(recipe,government,track),/rights/);
});
