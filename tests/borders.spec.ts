import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { geometryPaths, validateLayout, validateTrack } from "../schemas/data";
import { bordersFromLayout } from "../src/track-borders";
const json=async(path:string)=>JSON.parse(await readFile(path,"utf8"));
test.beforeEach(async({page})=>{await page.route("https://tile.openstreetmap.org/**",route=>route.abort());});

test("download includes embedded borders while display remains opt-in",async({page,request})=>{
 const separateRequests:string[]=[];
 page.on("request",req=>{if(req.url().includes("/local/borders/"))separateRequests.push(req.url());});
 await page.goto("/?track=be-spa-francorchamps&layout=grand-prix");
 await expect(page.locator("#message")).toHaveText("Layout ready");
 await expect(page.locator("#border-toggle")).toBeEnabled();
 await expect(page.locator("#border-toggle")).toHaveAttribute("aria-pressed","false");
 await expect(page.locator(".track-border")).toHaveCount(0);
 await expect(page.locator(".course-trace")).toHaveCount(1);
 const download=await (await request.get((await page.locator("#download").getAttribute("href"))!)).json();
 expect(download.features.map((f:{properties:{role:string}})=>f.properties.role).sort()).toEqual(["inner","outer","trace"]);
 await page.locator("#border-toggle").click();
 await expect(page.locator(".border-inner")).toHaveCount(1);await expect(page.locator(".border-outer")).toHaveCount(1);
 await expect(page.locator("#border-legend")).toBeVisible();
 await expect(page.locator(".course-trace")).toHaveCount(0);
 await expect(page.locator(".course-outline")).toHaveCount(0);
 await page.locator("#border-toggle").click();await expect(page.locator(".track-border")).toHaveCount(0);
 await expect(page.locator("#border-legend")).toBeHidden();await expect(page.locator(".course-trace")).toHaveCount(1);expect(separateRequests).toEqual([]);
});

test("all embedded layouts retain their own borders and downloadable geometry",async({page,request})=>{
 test.setTimeout(900000);
 const catalogue=await json("data/index.json");let circuits=0,layouts=0;
 for(const entry of catalogue.tracks){
  const track=validateTrack(await json(`data/${entry.file}`));
  const supported=[];
  for(const layout of track.layouts){
   if(!layout.file)continue;
   const path=`data/${entry.file.replace(/track.json$/,"")}${layout.file}`;
   const data=validateLayout(await json(path),track,layout.id);
   if(bordersFromLayout(data))supported.push({layout,data});
  }
  if(!supported.length)continue;circuits++;
  await page.goto(`/?track=${track.id}&layout=${supported[0].layout.id}`);
  await expect(page.locator("#message")).toHaveText("Layout ready");await page.locator("#border-toggle").click();
  for(const {layout,data} of supported){
   layouts++;await page.locator("#layout").selectOption(layout.id);await expect(page.locator("#message")).toHaveText("Layout ready");
   await expect(page.locator(".border-inner")).toHaveCount(1);await expect(page.locator(".border-outer")).toHaveCount(1);
   await expect(page.locator(".course-trace")).toHaveCount(0);
   const downloaded=await (await request.get((await page.locator("#download").getAttribute("href"))!)).json();
   expect(bordersFromLayout(downloaded)).toEqual(bordersFromLayout(data));
   expect(geometryPaths(downloaded.features[0].geometry)).toEqual(geometryPaths(data.features[0].geometry));
  }
 }
 expect(circuits).toBeGreaterThan(20);expect(layouts).toBeGreaterThan(59);
});

test("switching layouts clears stale borders and disables unsupported variations",async({page})=>{
 await page.goto("/?track=gb-silverstone-circuit-3571477&layout=silverstone-national");
 await expect(page.locator("#message")).toHaveText("Layout ready");await page.locator("#border-toggle").click();
 await expect(page.locator(".track-border")).toHaveCount(2);
 await page.locator("#layout").selectOption("silverstone-international");await expect(page.locator("#message")).toHaveText("Layout ready");
 await expect(page.locator("#border-toggle")).toBeDisabled();await expect(page.locator(".track-border")).toHaveCount(0);await expect(page.locator(".course-trace")).toHaveCount(1);
 await page.locator("#layout").selectOption("silverstone-national");await expect(page.locator(".track-border")).toHaveCount(2);
});

test("embedded borders work on mobile and in 3D",async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto("/?track=be-spa-francorchamps&layout=grand-prix");
 await expect(page.locator("#message")).toHaveText("Layout ready");await page.locator("#border-toggle").click();
 await expect(page.locator(".track-border")).toHaveCount(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator("#view-3d").click();await expect(page.locator("#track-3d")).toHaveAttribute("data-border-lines","2",{timeout:45000});
 await expect(page.locator("#track-3d")).toHaveAttribute("data-trace-visible","false");
 await page.locator("#border-toggle").click();await expect(page.locator("#track-3d")).toHaveAttribute("data-border-lines","0");
 await expect(page.locator("#track-3d")).toHaveAttribute("data-trace-visible","true");
});
