import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {indexSchema,validateTrack} from '../schemas/data';
import {layoutGapResearchSchema} from '../src/layout-gap-research';

test('every missing layout explains its specific source gap without offering a trace',async({page})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 const report=layoutGapResearchSchema.parse(JSON.parse(await readFile('data/layout-gap-research.json','utf8')));
 for(const review of report.records){
  expect(review.publicExplanation).toBeTruthy();expect(review.research).toBeTruthy();
  await page.goto(`/?track=${review.trackId}&layout=${review.layoutId}`);
  await expect(page.locator('#message')).toHaveText('Trace unavailable');
  await expect(page.locator('#selection')).toContainText(review.publicExplanation!);
  await expect(page.locator('#download')).toHaveCount(0);
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#ffb347"]')).toHaveCount(0);
  await page.locator('.track-notes > summary').click();await page.locator('.gap-research summary').click();
  expect(await page.locator('.gap-research a').evaluateAll(links=>links.map(link=>(link as HTMLAnchorElement).href))).toEqual(review.research!.evidenceUrls);
 }
 await page.goto('/?track=fr-paul-ricard&layout=main');await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('.gap-research')).toHaveCount(0);await expect(page.locator('#download')).toHaveCount(1);
});

test('a missing or invalid optional research report leaves the catalogue usable',async({page})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 const catalogue=indexSchema.parse(JSON.parse(await readFile('data/index.json','utf8')));
 const report=layoutGapResearchSchema.parse(JSON.parse(await readFile('data/layout-gap-research.json','utf8')));const gap=report.records[0];
 const track=validateTrack(JSON.parse(await readFile(`data/${catalogue.tracks.find(t=>t.id===gap.trackId)!.file}`,'utf8')));
 for(const invalid of [false,true]){
  await page.route('**/data/layout-gap-research.json',route=>invalid?route.fulfill({json:{schemaVersion:1,records:[{...gap,research:{...gap.research,evidenceUrls:['javascript:alert(1)']}}]}}):route.fulfill({status:404}));
  await page.goto(`/?track=${gap.trackId}&layout=${gap.layoutId}`);await expect(page.locator('#message')).toHaveText('Trace unavailable');
  await expect(page.locator('#selection')).toContainText(track.layouts.find(l=>l.id===gap.layoutId)!.missingGeometryReason!);
  await expect(page.locator('.gap-research')).toHaveCount(0);await page.unroute('**/data/layout-gap-research.json');
 }
});

test('every catalogue entry opens and only mapped layouts offer traces and downloads',async({page,request})=>{
 test.setTimeout(600000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 // The course viewer must work when background tiles are unavailable.
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 const catalogue=indexSchema.parse(JSON.parse(await readFile('data/index.json','utf8')));
 await page.goto('/');await expect(page.locator('#count')).toHaveText(`${catalogue.tracks.length} tracks`);
 for(const entry of catalogue.tracks){
  const track=validateTrack(JSON.parse(await readFile(`data/${entry.file}`,'utf8')));
  await page.locator(`#venues button[data-track-id="${entry.id}"]`).click();
  await expect(page.locator('#selection h2')).toHaveText(track.name);
  await expect(page.locator('#message')).toHaveText(/Layout ready|Trace unavailable/);
  for(const layout of track.layouts){
   await page.locator('#layout').selectOption(layout.id);
   if(layout.file===null){await expect(page.locator('#message')).toHaveText('Trace unavailable');await expect(page.locator('#download')).toHaveCount(0);await expect(page.locator('.leaflet-overlay-pane path[stroke="#ffb347"]')).toHaveCount(0);continue;}
   await expect(page.locator('#message')).toHaveText('Layout ready');
   await expect(page.locator('#selection h2')).toHaveText(track.name);
   await expect(page.locator('#selection .error')).toHaveCount(0);
   await expect(page.locator('.leaflet-overlay-pane path[stroke="#ffb347"]')).toHaveCount(1);
   const response=await request.get((await page.locator('#download').getAttribute('href'))!);
   expect(response.ok()).toBeTruthy();const data=await response.json();
   expect(data.metadata.trackId).toBe(track.id);expect(data.metadata.layoutId).toBe(layout.id);
   expect(data.features.map((f:{id:string})=>f.id)).toEqual(['trace']);if(data.metadata.geometryKind==='network'){expect(data.metadata.schemaVersion).toBe(2);expect(data.features[0].geometry.type).toBe('MultiLineString');await expect(page.locator('#selection')).toContainText('Track network');}
  }
 }
 expect(errors).toEqual([]);
});

test('country and name filters combine, and a layout deep link restores selection',async({page})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 await page.goto('/?track=de-hockenheimring&layout=national');
 await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#layout')).toHaveValue('national');
 const traceBox=await page.locator('.leaflet-overlay-pane path[stroke="#ffb347"]').boundingBox();expect(traceBox!.width).toBeGreaterThan(100);expect(traceBox!.height).toBeGreaterThan(100);
 await page.locator('#country').selectOption('IT');await page.locator('#search').fill('Monza');
 await expect(page.locator('#count')).toHaveText('1 track');
 await expect(page.locator('#venues .venue-name')).toHaveText('Autodromo Nazionale Monza');
 const catalogue=indexSchema.parse(JSON.parse(await readFile('data/index.json','utf8')));
 await page.locator('#reset').click();await expect(page.locator('#count')).toHaveText(`${catalogue.tracks.length} tracks`);
 await page.locator('.coverage summary').click();await expect(page.locator('.coverage table tr')).toHaveCount(251);
 await expect(page.locator('.coverage')).toContainText('Brno');
});

test('delayed venue loading removes stale controls and cannot overwrite a later selection',async({page})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 await page.goto('/?track=at-salzburgring');await expect(page.locator('#message')).toHaveText('Layout ready');
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 let started!:()=>void;const requested=new Promise<void>(resolve=>{started=resolve;});
 await page.route('**/data/belgium/spa-francorchamps/track.json',async route=>{started();await held;await route.continue().catch(()=>{});});
 await page.locator('#venues button').filter({hasText:'Circuit de Spa-Francorchamps'}).click();await requested;
 await expect(page.locator('#layout')).toHaveCount(0);
 await page.locator('#venues button').filter({hasText:'Autodromo Nazionale Monza'}).click();
 await expect(page.locator('#message')).toHaveText('Layout ready');release();
 await expect(page.locator('#selection h2')).toHaveText('Autodromo Nazionale Monza');
 await expect(page).toHaveURL(/track=it-monza/);
});

test('mobile layout switching keeps the map and download usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 await page.goto('/?track=de-hockenheimring&layout=grand-prix');
 await expect(page.locator('#message')).toHaveText('Layout ready');
 await page.locator('#layout').selectOption('short');await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#download')).toHaveAttribute('href',/short.geojson$/);
 await page.locator('#map').scrollIntoViewIfNeeded();await expect(page.locator('#map')).toBeInViewport();
 await expect(page.locator('.leaflet-control-attribution')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});


test('OSM venue names render as literal tooltip text',async({page})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 const catalogue=indexSchema.parse(JSON.parse(await readFile('data/index.json','utf8')));for(const track of catalogue.tracks)track.name='Marker <strong>untrusted</strong>';
 await page.route('**/data/index.json',route=>route.fulfill({json:catalogue}));
 await page.goto('/');await expect(page.locator('#count')).toHaveText(`${catalogue.tracks.length} tracks`);
 await page.locator('#world-map').click();
 await page.locator('.leaflet-overlay-pane .leaflet-interactive').first().dispatchEvent('mouseover');
 await expect(page.locator('.leaflet-tooltip')).toHaveText('Marker <strong>untrusted</strong>');await expect(page.locator('.leaflet-tooltip strong')).toHaveCount(0);
});

test('Nürburgring offers nine reference entries and GP differs from Sprint',async({page,request})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 await page.goto('/?track=de-nurburgring&layout=grand-prix');await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#layout option')).toHaveCount(9);
 const gp=await (await request.get((await page.locator('#download').getAttribute('href'))!)).json();
 await page.locator('#layout').selectOption('sprintstrecke');await expect(page.locator('#message')).toHaveText('Layout ready');
 const sprint=await (await request.get((await page.locator('#download').getAttribute('href'))!)).json();expect(gp.metadata.lengthM-sprint.metadata.lengthM).toBeGreaterThan(1400);
 await page.locator('.track-notes > summary').click();await page.locator('.layout-gaps summary').click();await expect(page.locator('.layout-gaps li')).toHaveCount(9);
 await page.locator('#layout').selectOption('nordschleife-btg');await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#selection')).toContainText('Public data is the supporting Nordschleife loop');
});

test('Paul Ricard has eight traces with distinct full, short and training configurations',async({page,request})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 await page.goto('/?track=fr-paul-ricard&layout=paul-ricard-le-castellet');await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#layout option')).toHaveCount(8);
 const get=async(id:string)=>{await page.locator('#layout').selectOption(id);await expect(page.locator('#message')).toHaveText('Layout ready');return (await request.get((await page.locator('#download').getAttribute('href'))!)).json();};
 const gp=await get('main'),short=await get('paul-ricard-short'),straight=await get('paul-ricard-short-without-chicane'),school=await get('paul-ricard-piste-gt'),training=await get('paul-ricard-gtdrive');
 expect(gp.metadata.lengthM-short.metadata.lengthM).toBeGreaterThan(1900);expect(short.metadata.lengthM-straight.metadata.lengthM).toBeGreaterThan(70);expect(short.metadata.lengthM-straight.metadata.lengthM).toBeLessThan(100);
 expect(school.metadata.lengthM).toBeGreaterThan(1750);expect(school.metadata.lengthM).toBeLessThan(1850);expect(training.metadata.lengthM).toBeLessThan(1650);expect(training.features[0].geometry.coordinates).not.toEqual(school.features[0].geometry.coordinates);
});

test('Pikes Peak is an open hillclimb rather than an artificially closed loop',async({page,request})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 await page.goto('/?track=us-pikes-peak-hillclimb-ab97c20e&layout=pikes-peak-hillclimb');await expect(page.locator('#message')).toHaveText('Layout ready');
 const data=await (await request.get((await page.locator('#download').getAttribute('href'))!)).json(),trace=data.features[0].geometry.coordinates;
 expect(data.metadata.closed).toBe(false);expect(data.metadata.timingMode).toBe('separate');expect(data.metadata.lengthM).toBeGreaterThan(19000);expect(trace[0]).not.toEqual(trace.at(-1));
});

test('Woodbridge publishes an unchanged supporting runway without asserting public timing endpoints',async({page,request})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 await page.route('**/local/timing.json',route=>route.fulfill({status:404}));
 await page.goto('/?track=gb-raf-woodbridge-02bc9a03&layout=raf-woodbridge');await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#selection')).toContainText('full supporting runway centerline');
 await expect(page.locator('#selection')).toContainText('not verified timing gates');
 await expect(page.locator('#selection')).toContainText('no 5,658 m timed route is claimed');
 const data=await(await request.get((await page.locator('#download').getAttribute('href'))!)).json();
 const source=JSON.parse(await readFile('sources/course-networks/raf-woodbridge-current-independent-airfield-roads/osm.json','utf8')).elements.find((w:{id:number})=>w.id===23552564);
 expect(data.features.map((f:{id:string})=>f.id)).toEqual(['trace']);
 expect(data.features[0].geometry.coordinates).toEqual(source.geometry.map((p:{lon:number;lat:number})=>[p.lon,p.lat]));
 expect(data.metadata.closed).toBe(false);expect(data.metadata.lengthM).toBe(3160.8);expect(data.metadata.timingStatus).toBe('missing');
});

test('Bikernieki retains the historical short eastern triangle and complete finish straight',async({page,request})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 await page.route('**/local/timing.json',route=>route.fulfill({status:404}));
 await page.goto('/?track=lv-bikernieki-rallycross-5981ece5&layout=bikernieki-rallycross-track');
 await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#selection')).toContainText('short southeastern triangle');
 await expect(page.locator('#selection')).toContainText('different event laps');
 const data=await(await request.get((await page.locator('#download').getAttribute('href'))!)).json();
 const trace=data.features[0].geometry.coordinates as number[][];
 expect(data.features.map((f:{id:string})=>f.id)).toEqual(['trace']);
 expect(trace[0]).toEqual(trace.at(-1));
 expect(data.metadata.lengthM).toBeGreaterThan(1300);expect(data.metadata.lengthM).toBeLessThan(1400);
 // The later long triangle reaches 56.9633152 and is a different branch.
 expect(Math.min(...trace.map(p=>p[1]))).toBeGreaterThan(56.9639);
 expect(trace).toContainEqual([24.2298754,56.9640144]);
 expect(data.metadata.attribution).toContain('Latvian Geospatial Information Agency');
 expect(data.metadata.attribution).toContain('OpenStreetMap contributors');
 expect(data.metadata.geometryStatus).toBe('draft');expect(data.metadata.timingStatus).toBe('missing');
});

test('Queensland aggregate preserves its four configurations and switches back to a driving route',async({page,request})=>{
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 const index=indexSchema.parse(JSON.parse(await readFile('data/index.json','utf8')));
 const entry=index.tracks.find(t=>t.name.includes('Queensland Raceway'))!;
 const track=validateTrack(JSON.parse(await readFile(`data/${entry.file}`,'utf8')));
 const combo=track.layouts.find(l=>l.name.includes('Combo'))!;
 await page.goto(`/?track=${track.id}&layout=${combo.id}`);await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#selection')).toContainText('Track network');await expect(page.locator('#selection')).toContainText('Mapped branch length');
 const network=await(await request.get((await page.locator('#download').getAttribute('href'))!)).json();
 expect(network.features[0].geometry.type).toBe('MultiLineString');expect(network.features[0].geometry.coordinates).toHaveLength(4);
 expect(network.metadata.closed).toBe(false);expect(network.metadata.lengthM).toBeLessThan(6000);
 await page.locator('#layout').selectOption('queensland-raceway-national-circuit');await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#selection')).toContainText('Closed circuit');await expect(page.locator('#selection')).not.toContainText('Track network');
 const course=await(await request.get((await page.locator('#download').getAttribute('href'))!)).json();expect(course.features[0].geometry.type).toBe('LineString');
});
