// Re-fetch pinned anonymous public tiles through the ordinary publisher viewer.
/* global fetch, btoa */
import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {log} from 'node:console';

const destination=process.argv[2];
if(!destination)throw new Error('Pass a destination directory');
const manifest=JSON.parse(await readFile(new URL('./agea-adria-2024-import.json',import.meta.url),'utf8'));
await mkdir(destination,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto('https://geoportale.agea.gov.it/',{waitUntil:'networkidle'});
 for(const tile of manifest.tiles){
  const result=await page.evaluate(async url=>{
   const response=await fetch(url);
   if(!response.ok)throw new Error(`Public tile HTTP ${response.status}`);
   const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
   for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
   return btoa(binary);
  },tile.url);
  const bytes=Buffer.from(result,'base64');
  if(createHash('sha256').update(bytes).digest('hex')!==tile.sha256)throw new Error(`Changed public tile: ${tile.url}`);
  await writeFile(resolve(destination,tile.file),bytes);
 }
 log(`Verified ${manifest.tiles.length} public tiles`);
}finally{await browser.close();}
