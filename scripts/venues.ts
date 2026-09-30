import {existsSync,readFileSync} from 'node:fs';
const pilotVenues = [
  {id:'at-salzburgring',name:'Salzburgring',country:{code:'AT',name:'Austria',slug:'austria'},slug:'salzburgring',bbox:[13.14,47.81,13.19,47.84]},
  {id:'fr-anneau-du-rhin',name:'Anneau du Rhin',country:{code:'FR',name:'France',slug:'france'},slug:'anneau-du-rhin',bbox:[7.39,47.93,7.45,47.97]},
  {id:'de-nurburgring',name:'Nürburgring',country:{code:'DE',name:'Germany',slug:'germany'},slug:'nurburgring',bbox:[6.89,50.31,7.04,50.40]},
  {id:'de-hockenheimring',name:'Hockenheimring',country:{code:'DE',name:'Germany',slug:'germany'},slug:'hockenheimring',bbox:[8.54,49.31,8.60,49.35]},
  {id:'be-spa-francorchamps',name:'Circuit de Spa-Francorchamps',country:{code:'BE',name:'Belgium',slug:'belgium'},slug:'spa-francorchamps',bbox:[5.94,50.42,6.00,50.46]},
  {id:'be-zolder',name:'Circuit Zolder',country:{code:'BE',name:'Belgium',slug:'belgium'},slug:'zolder',bbox:[5.24,50.97,5.29,51.01]},
  {id:'nl-zandvoort',name:'Circuit Zandvoort',country:{code:'NL',name:'Netherlands',slug:'netherlands'},slug:'zandvoort',bbox:[4.53,52.37,4.57,52.41]},
  {id:'nl-assen',name:'TT Circuit Assen',country:{code:'NL',name:'Netherlands',slug:'netherlands'},slug:'assen',bbox:[6.50,52.94,6.55,52.99]},
  {id:'it-monza',name:'Autodromo Nazionale Monza',country:{code:'IT',name:'Italy',slug:'italy'},slug:'monza',bbox:[9.26,45.60,9.31,45.64]},
  {id:'it-imola',name:'Autodromo Enzo e Dino Ferrari',country:{code:'IT',name:'Italy',slug:'italy'},slug:'imola',bbox:[11.69,44.32,11.74,44.37]},
  {id:'it-misano',name:'Misano World Circuit',country:{code:'IT',name:'Italy',slug:'italy'},slug:'misano',bbox:[12.66,43.94,12.71,43.98]},
  {id:'it-mugello',name:'Mugello Circuit',country:{code:'IT',name:'Italy',slug:'italy'},slug:'mugello',bbox:[11.35,43.98,11.39,44.02]},
  {id:'fr-paul-ricard',name:'Circuit Paul Ricard',country:{code:'FR',name:'France',slug:'france'},slug:'paul-ricard',bbox:[5.77,43.24,5.81,43.27]},
  {id:'fr-magny-cours',name:'Circuit de Nevers Magny-Cours',country:{code:'FR',name:'France',slug:'france'},slug:'magny-cours',bbox:[3.14,46.84,3.18,46.88]},
  {id:'fr-le-mans-bugatti',name:'Le Mans Bugatti Circuit',country:{code:'FR',name:'France',slug:'france'},slug:'le-mans-bugatti',bbox:[0.198,47.944,0.226,47.971]},
  {id:'es-barcelona-catalunya',name:'Circuit de Barcelona-Catalunya',country:{code:'ES',name:'Spain',slug:'spain'},slug:'barcelona-catalunya',bbox:[2.24,41.55,2.28,41.59]},
  {id:'es-jerez',name:'Circuito de Jerez',country:{code:'ES',name:'Spain',slug:'spain'},slug:'jerez',bbox:[-6.05,36.69,-6.01,36.72]},
  {id:'es-valencia',name:'Circuit Ricardo Tormo',country:{code:'ES',name:'Spain',slug:'spain'},slug:'valencia',bbox:[-0.65,39.47,-0.60,39.51]},
];
const bootstrapPath=new URL('../sources/europe/bootstrap.json',import.meta.url);
export const venues=[...pilotVenues,...(existsSync(bootstrapPath)?JSON.parse(readFileSync(bootstrapPath,'utf8')):[])];

const worldBootstrapPath=new URL('../sources/world/bootstrap.json',import.meta.url);
if(existsSync(worldBootstrapPath))venues.push(...JSON.parse(readFileSync(worldBootstrapPath,'utf8')));
