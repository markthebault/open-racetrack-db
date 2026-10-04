import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.env.RACETRACK_WEB_ROOT??'dist');
const overlay=process.env.RACETRACK_TIMING_FILE;
const base=process.env.RACETRACK_BASE_PATH??'/';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith(base)){res.writeHead(404);res.end('Not found');return;}
  const relative=pathname.slice(base.length);
  if(relative==='local/timing.json'&&overlay){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(await readFile(overlay));return;}
  const file=resolve(root,relative||'index.html');
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end('Forbidden');return;}
  if(!(await stat(file)).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('X-Content-Type-Options','nosniff');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT??5190),process.env.HOST??'0.0.0.0',()=>console.log(`Racetrack preview on port ${process.env.PORT??5190}`));
