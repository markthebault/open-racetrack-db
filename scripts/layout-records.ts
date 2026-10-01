import {readFileSync,existsSync} from 'node:fs';
const explicitRecords:Record<string,string>={
 'at-salzburgring/grand-prix':'Salzburgring',
 'fr-anneau-du-rhin/3-0-km':'Anneau Du Rhin - 3.0 km',
 'fr-anneau-du-rhin/3-7-km':'Anneau Du Rhin - 3.7 km',
 'de-nurburgring/grand-prix':'Nurburgring GP',
 'de-nurburgring/nordschleife':'Nurburgring Nordschleife',
 'de-nurburgring/gp-without-mb-arena':'Nurburgring GP without MB Arena',
 'de-nurburgring/sprintstrecke':'Nurburgring Sprintstrecke',
 'de-nurburgring/24hr':'Nurburgring 24Hr',
 'de-nurburgring/nls':'Nurburgring NLS Circuit',
 'de-nurburgring/nordschleife-btg':'Nurburgring BTG',
 'de-nurburgring/industry-pool':'Nurburgring Industry Pool',
 'de-nurburgring/lap-record':'Nurburgring Lap Record',
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

const path=new URL('../sources/reference/layout-matches.json',import.meta.url);
const named:Record<string,{name:string}>=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
export const layoutRecords:Record<string,string>={...Object.fromEntries(Object.entries(named).map(([id,r])=>[id,r.name])),...explicitRecords};
