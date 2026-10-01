import {setTimeout as delay} from 'node:timers/promises';
import {cp,mkdir,writeFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
if(process.platform!=='darwin')throw new Error('This preview installer requires macOS. Use npm run serve elsewhere.');
const service=join(homedir(),'Library/Application Support/OpenRacetrackDB');
const agents=join(homedir(),'Library/LaunchAgents');
await mkdir(service,{recursive:true});await mkdir(agents,{recursive:true});
await cp('dist',join(service,'dist'),{recursive:true});await cp('scripts/serve.mjs',join(service,'serve.mjs'));
let privateTiming=false;try{await access('.local/timing.json');await cp('.local/timing.json',join(service,'timing.json'));privateTiming=true;}catch{/* A public preview needs no private overlay. */}
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const label='local.open-racetrack.preview',plist=join(agents,`${label}.plist`),domain=`gui/${process.getuid()}`;
const env={RACETRACK_WEB_ROOT:join(service,'dist'),HOST:'127.0.0.1',PORT:'5190',...(privateTiming?{RACETRACK_TIMING_FILE:join(service,'timing.json')}: {})};
await writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(service,'serve.mjs'))}</string></array><key>WorkingDirectory</key><string>${xml(service)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k,v])=>`<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict><key>StandardOutPath</key><string>${xml(join(service,'stdout.log'))}</string><key>StandardErrorPath</key><string>${xml(join(service,'stderr.log'))}</string></dict></plist>`);
try{execFileSync('launchctl',['bootout',`${domain}/${label}`],{stdio:'ignore'});}catch{/* First install has no job. */}
// A removed job can take a moment to release its registration.
let installed=false;for(let attempt=0;attempt<12;attempt++){try{execFileSync('launchctl',['bootstrap',domain,plist],{stdio:'pipe'});installed=true;break;}catch(error){if(attempt===11)throw error;await delay(250);}}
if(!installed)throw new Error('Preview registration failed');
console.log('Installed persistent local preview on 127.0.0.1:5190. Existing Tailscale Serve routing is retained.');
