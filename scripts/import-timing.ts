import {execFileSync} from 'node:child_process';
import {XMLParser} from 'fast-xml-parser';
import {mkdir,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2),archive=args[args.indexOf('--archive')+1];
if(!archive||args.indexOf('--archive')<0)throw new Error('Use --archive /absolute/path/to/racelogic-tracks-db.zip');
// Read only the timing XML. No CIR files, track edges, or track map files are opened.
const xml=execFileSync('unzip',['-p',archive,'racelogic-tracks-db/Start Finish Database/StartFinishDataBase.xml'],{maxBuffer:2e6}).toString('utf8');
const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:''}).parse(xml);
const countries=parsed.RacelogicStartFinishDatabase.country;
const circuits=countries.flatMap((c:any)=>Array.isArray(c.circuits.circuit)?c.circuits.circuit:[c.circuits.circuit]);
const mapping:Record<string,string>={
 'at-salzburgring/grand-prix':'Salzburgring',
 'fr-anneau-du-rhin/3-0-km':'Anneau Du Rhin - 3.0 km',
 'fr-anneau-du-rhin/3-7-km':'Anneau Du Rhin - 3.7 km',
 'de-nurburgring/grand-prix':'Nurburgring GP',
 'de-nurburgring/nordschleife':'Nurburgring Nordschleife',
 'de-hockenheimring/grand-prix':'Hockenheim GP',
 'de-hockenheimring/national':'Hockenheimring National',
 'de-hockenheimring/short':'Hockenheimring Short Track',
 'be-spa-francorchamps/grand-prix':'Spa Francorchamps',
 'be-zolder/main':'Zolder',
 'nl-zandvoort/grand-prix':'Zandvoort',
 'nl-assen/main':'Assen',
 'it-monza/grand-prix':'Monza',
 'it-imola/grand-prix':'Imola - without chicane',
 'it-imola/variante-bassa':'Imola',
 'it-misano/main':'Misano',
 'it-misano/short':'Misano',
 'it-mugello/grand-prix':'Mugello',
 'fr-paul-ricard/main':'Paul Ricard 1C-V2',
 'fr-paul-ricard/mistral-straight':'Paul Ricard 1A-V2',
 'fr-magny-cours/grand-prix':'Magny Cours',
 'fr-le-mans-bugatti/main':'Le Mans Bugatti',
 'es-barcelona-catalunya/grand-prix':'Catalunya GP',
 'es-barcelona-catalunya/with-chicane':'Catalunya',
 'es-jerez/grand-prix':'Jerez',
 'es-jerez/motorcycle':'Jerez',
 'es-valencia/grand-prix':'Circuit Ricardo Tormo Valencia',

};
const out:Record<string,unknown>={};
for(const [id,name] of Object.entries(mapping)){const c=circuits.find((c:any)=>c.name.trim()===name);if(!c)throw new Error(`Timing record missing: ${name}`);const pair=Boolean(c.splitinfo.Finish);const gates=[{role:pair?'start':'start_finish',data:c.splitinfo.startFinish},...(pair?[{role:'finish',data:c.splitinfo.Finish}]:[])].map(({role,data})=>{const point=[Number(data.long)/60,Number(data.lat)/60];if(!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90)throw new Error(`${name}: invalid GPS coordinates`);return {role,point};});out[id]={name,gates};}
await mkdir('.local',{recursive:true});await writeFile('.local/timing.json',JSON.stringify(out,null,2)+'\n');console.log(`Imported ${Object.keys(out).length} private timing records to ignored .local/timing.json. No boundaries read.`);
