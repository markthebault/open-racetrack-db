import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageryCoordinates,imageryPaths,buildImageryCourse,validateImageryRaster,type ImageryCourse} from '../scripts/imagery-course';
import {validateTrack} from '../schemas/data';
import {networkLength} from '../src/geo';

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

test('OGL imagery preserves provider attribution and rejects mismatched reuse registration',()=>{
 const government={...source,license:'OGL-3.0' as const,attribution:'Environment Agency, Open Government Licence v3.0'};
 const registered={...track,sources:[{...track.sources[0],license:government.license}]};
 const layout=buildImageryCourse(recipe,government,registered);
 assert.equal(layout.metadata.attribution,government.attribution);
 assert.deepEqual(layout.features[0].properties.sourceIds,[government.sourceId]);
 assert.throws(()=>buildImageryCourse(recipe,government,track),/rights/);
 assert.throws(()=>buildImageryCourse(recipe,government,{...registered,sources:[{...registered.sources[0],url:'https://example.org/unrelated'}]}),/rights/);
});

test('German government imagery preserves attribution, change notice and source-specific reuse registration',()=>{
 const government={...source,license:'DL-DE-BY-2.0' as const,attribution:'GeoSN, dl-de/by-2-0; centerline independently digitized and changed.'};
 const registered={...track,sources:[{...track.sources[0],license:government.license}]};
 const layout=buildImageryCourse(recipe,government,registered);
 assert.equal(layout.metadata.attribution,government.attribution);
 assert.throws(()=>buildImageryCourse(recipe,government,track),/rights/);
 assert.throws(()=>buildImageryCourse(recipe,government,{...registered,sources:[{...registered.sources[0],url:'https://example.org/other-dataset'}]}),/rights/);
});

test('CC BY government imagery retains provider attribution and requires matching source rights',()=>{
 const government={...source,license:'CC-BY-4.0' as const,attribution:'Datenquelle: basemap.at (https://basemap.at/), CC BY 4.0; independent centerline digitization.'};
 const registered={...track,sources:[{...track.sources[0],license:government.license}]};
 const layout=buildImageryCourse(recipe,government,registered);
 assert.equal(layout.metadata.attribution,government.attribution);
 assert.throws(()=>buildImageryCourse(recipe,government,track),/rights/);
 assert.throws(()=>buildImageryCourse(recipe,government,{...registered,sources:[{...registered.sources[0],url:'https://example.org/other-imagery'}]}),/rights/);
});

const networkSource=(paths:{name:string;pixels:[number,number][];closed:boolean}[])=>({
 ...Object.fromEntries(Object.entries(source).filter(([key])=>key!=='pixels')),
 geometryKind:'network',closed:false,
 paths:paths.map(p=>({...p,identificationUrl:'https://example.org/configurations',evidence:'Independently identified paved connection.'}))
});
const networkRecipe={...recipe,schemaVersion:2,geometryKind:'network',closed:false};

test('disconnected imagery branches remain separate paths without a fabricated connecting line',()=>{
 const input=networkSource([{name:'Western course',pixels:[[0,0],[10,0]],closed:false},{name:'Eastern course',pixels:[[90,90],[90,95]],closed:false}]);
 const paths=imageryPaths(input),layout=buildImageryCourse(networkRecipe,input,track);
 assert.equal(layout.metadata.geometryKind,'network');assert.equal(layout.metadata.schemaVersion,2);assert.equal(layout.metadata.closed,false);
 assert.equal(layout.features[0].geometry.type,'MultiLineString');assert.deepEqual(layout.features[0].geometry.coordinates,paths);
 assert.equal(layout.metadata.lengthM,networkLength(paths));assert.ok(layout.metadata.lengthM<16);
 assert.throws(()=>imageryCoordinates(input),/cannot be flattened/);
 assert.throws(()=>buildImageryCourse(recipe,input,track),/mismatch/);
});

test('imagery networks count reversed shared edges once and reject duplicate or unidentified components',()=>{
 const first={name:'Main',pixels:[[0,0],[10,0],[20,0]] as [number,number][],closed:false};
 const second={name:'Alternate',pixels:[[10,0],[0,0],[0,10]] as [number,number][],closed:false};
 const input=networkSource([first,second]),layout=buildImageryCourse(networkRecipe,input,track);
 assert.ok(Math.abs(layout.metadata.lengthM-30)<.1);
 assert.throws(()=>imageryPaths(networkSource([first,{...first,name:'Reverse',pixels:[...first.pixels].reverse()}])),/duplicate paths/);
 assert.throws(()=>imageryPaths(networkSource([first,{...second,name:'Main'}])),/distinct component names/);
 assert.throws(()=>imageryPaths(networkSource([first,{...second,name:''}])));
 assert.throws(()=>imageryPaths(networkSource([first,{...second,closed:true}])),/closure mismatch/);
 assert.throws(()=>imageryPaths({...input,pixels:source.pixels}));
});
