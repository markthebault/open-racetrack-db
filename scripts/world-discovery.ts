export function worldQuery(codes:string[]){
 if(!codes.length||codes.length>12||new Set(codes).size!==codes.length||codes.some(c=>! /^[A-Z]{2}$/.test(c)))throw new Error('Expected 1–12 distinct country codes');
 return `[out:json][timeout:90][maxsize:268435456];area["ISO3166-1"~"^(${codes.join('|')})$"]->.countries;foreach.countries->.country(.country out tags;(way["highway"="raceway"](area.country);nwr["leisure"~"^(sports_centre|sports_complex)$"]["sport"~"motor"](area.country);relation["type"="site"]["site"~"^(raceway|motorsport|racetrack)$"](area.country););out meta geom;);\n`;
}
export function splitCountries(elements:any[],codes:string[]){
 const result=new Map(codes.map(code=>[code,new Map<string,any>()]));let current:string|undefined;
 for(const e of elements){
  if(e.type==='area'){current=e.tags?.['ISO3166-1'];if(!current||!result.has(current))throw new Error('Unrecognised country-area marker');}
  if(!current)throw new Error('Source object has no country-area marker');
  const group=result.get(current)!,key=`${e.type}/${e.id}`,previous=group.get(key);
  if(previous&&JSON.stringify(previous)!==JSON.stringify(e))throw new Error('Conflicting duplicate source object');
  group.set(key,e);
 }
 return new Map([...result].map(([code,group])=>[code,[...group.values()]]));
}
