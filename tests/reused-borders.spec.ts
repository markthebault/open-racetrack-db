import {test,expect} from '@playwright/test';
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
for(const [track,folder,siblingId,estimated,anchors,license] of [['cn-shanghai-international-circuit-107371138','china/shanghai-international-circuit-107371138','shanghai-gp','estimated','626','LicenseRef-MapTiler-Derived-Borders'],['us-autobahn-country-club-42852101','united-states/autobahn-country-club-42852101','autobahn-country-club','estimated'],['us-pittsburgh-international-race-complex-225264359','united-states/pittsburgh-international-race-complex-225264359','pittsburgh-int-race-complex-full'],['gb-silverstone-circuit-3571477','united-kingdom/silverstone-circuit-3571477','silverstone-gp-wing-sf'],['us-ncm-motorsports-park-326452603','united-states/ncm-motorsports-park-326452603','ncm-grand-full'],['us-homestead-miami-speedway-108159182','united-states/homestead-miami-speedway-108159182','homestead-modified-road-course']])
for(const width of [1440,390])test(`${track} corrected source supports playback and video at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:900});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const host of ['server.arcgisonline.com','api.maptiler.com'])await page.route(`**/${host}/**`,r=>r.fulfill({contentType:'image/png',body:image,headers:{'access-control-allow-origin':'*'}}));
 await page.goto(`/?track=${track}&layout=main&view=3d`);
 await page.locator('#border-toggle').click();await expect(page.locator('#border-toggle')).toHaveAttribute('aria-pressed','true');
 const href=await page.locator('#download').getAttribute('href'),data=await(await request.get(href!)).json();
 const sibling=await(await request.get(`/data/${folder}/layouts/${siblingId}.geojson`)).json();
 const borders=(d:typeof data)=>d.features.filter((f:{properties:{role:string}})=>['inner','outer'].includes(f.properties.role));
 if(estimated)expect(borders(data)).not.toEqual(borders(sibling));else expect(borders(data)).toEqual(borders(sibling));expect(data.metadata.timing).toBeUndefined();expect(data.metadata.timingStatus).toBe('missing');
 if(estimated){expect(data.metadata.borderInference.method).toBe('image-measured-paired-edges-v1');expect(data.metadata.borderInference.measurement.patches.flatMap((p:{anchors:unknown[]})=>p.anchors)).toHaveLength(Number(anchors??650));expect(data.metadata.borderInference.measurement.imageSha256).toBe(data.metadata.borderInference.imagery.sha256);if(sibling.metadata.borderInference){expect(data.metadata.borderInference.traceSha256).toBe(sibling.metadata.borderInference.traceSha256);expect(data.metadata.borderInference.imagery).toEqual(sibling.metadata.borderInference.imagery);}expect(data.metadata.borderInference.status).toBe('estimated');expect(borders(data).every((f:{properties:{license:string}})=>f.properties.license===(license??'public-domain'))).toBe(true);}else{expect(data.metadata.notes.join('\n')).toContain('exact trace SHA-256');expect(data.metadata.borderInference).toBeUndefined();}
 await page.locator('#play-lap').click();await expect(page.locator('.lap-loading')).toBeHidden();
 await page.locator('.lap-play').click();await expect(page.locator('[data-clock]')).not.toHaveText('0:00.00');await page.locator('.lap-play').click();
 await page.locator('.lap-record').click();await expect(page.locator('[data-clock]')).toHaveText(/^0:02/,{timeout:10000});await page.locator('.lap-record').click();
 await expect(page.locator('.lap-download')).toBeVisible();
 const dimensions=await page.locator('.lap-download').evaluate(link=>new Promise<number[]>((resolve,reject)=>{
  const video=document.createElement('video'),timer=window.setTimeout(()=>reject(new Error('Recorded video did not decode')),10000);
  video.onloadeddata=()=>{window.clearTimeout(timer);resolve([video.videoWidth,video.videoHeight]);video.src='';};
  video.onerror=()=>{window.clearTimeout(timer);reject(new Error('Invalid recorded video'));};video.src=(link as HTMLAnchorElement).href;
 }));
 expect(dimensions).toEqual([1280,720]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
