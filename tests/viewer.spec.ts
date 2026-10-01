import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {indexSchema,validateTrack} from '../schemas/data';

test('every catalogue layout opens, draws a trace and offers reusable data',async({page,request})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 // The course viewer must work when background tiles are unavailable.
 await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
 const catalogue=indexSchema.parse(JSON.parse(await readFile('data/index.json','utf8')));
 await page.goto('/');await expect(page.locator('#count')).toHaveText(`${catalogue.tracks.length} tracks`);
 for(const entry of catalogue.tracks){
  const track=validateTrack(JSON.parse(await readFile(`data/${entry.file}`,'utf8')));
  await page.locator(`#venues button[data-track-id="${entry.id}"]`).click();
  await expect(page.locator('#selection h2')).toHaveText(track.name);
  await expect(page.locator('#message')).toHaveText('Layout ready');
  for(const layout of track.layouts){
   await page.locator('#layout').selectOption(layout.id);
   await expect(page.locator('#message')).toHaveText('Layout ready');
   await expect(page.locator('#selection h2')).toHaveText(track.name);
   await expect(page.locator('#selection .error')).toHaveCount(0);
   await expect(page.locator('.leaflet-overlay-pane path[stroke="#ffb347"]')).toHaveCount(1);
   const response=await request.get((await page.locator('#download').getAttribute('href'))!);
   expect(response.ok()).toBeTruthy();const data=await response.json();
   expect(data.metadata.trackId).toBe(track.id);expect(data.metadata.layoutId).toBe(layout.id);
   expect(data.features.map((f:{id:string})=>f.id)).toEqual(['trace']);
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
 await expect(page.locator('#count')).toHaveText('1 tracks');
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
 await page.locator('.layout-gaps summary').click();await expect(page.locator('.layout-gaps li')).toHaveCount(9);
 await page.locator('#layout').selectOption('nordschleife-btg');await expect(page.locator('#message')).toHaveText('Layout ready');
 await expect(page.locator('#selection')).toContainText('Public data is the supporting Nordschleife loop');
});
