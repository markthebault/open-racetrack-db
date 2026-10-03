import {bounds, networkLength} from '../src/geo';
import {validateLayout, type Track} from '../schemas/data';
import {assemble, type Segment, type Way} from './route';

export type NetworkRecipe = {
 schemaVersion:2; trackId:string; layoutId:string; sourceId:string;
 geometryKind:'network'; geometryStatus:'draft'; timingMode:'shared'|'separate';
 reviewedAt:null; notes:string[]; gates:[];
 paths:{closed:boolean;segments:Segment[]}[];
};
export function buildCourseNetwork(recipe:NetworkRecipe,ways:Way[],track:Track){
 if(recipe.schemaVersion!==2||recipe.geometryKind!=='network'||recipe.geometryStatus!=='draft'||recipe.gates.length)throw new Error('Network recipe requires a draft with no public timing');
 if(recipe.paths.length<2||recipe.paths.some(p=>!p.segments.length))throw new Error('Network requires multiple nonempty source paths');
 for(const path of recipe.paths)for(const segment of path.segments){const tags=ways.find(w=>w.id===segment.wayId)?.tags??{};if(/^pit[_ -]?lane$/i.test(tags.service??'')||/^pit[_ -]?lane$/i.test(tags.raceway??'')||/^boxes$|pit[ /_-]?(lane|road|entry|exit)/i.test(tags.name??''))throw new Error('Network includes a pit lane');}
 const paths=recipe.paths.map(p=>assemble(ways,p.segments,p.closed));
 const keys=paths.map(p=>p.slice(1).map((v,i)=>[p[i].join(','),v.join(',')].sort().join('|')).sort().join(';'));
 if(new Set(keys).size!==keys.length)throw new Error('Network contains duplicate paths');
 return validateLayout({type:'FeatureCollection',bbox:bounds(paths.flat()),metadata:{schemaVersion:2,geometryKind:'network',trackId:recipe.trackId,layoutId:recipe.layoutId,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',closed:false,geometryStatus:'draft',timingStatus:'missing',timingMode:recipe.timingMode,lengthM:networkLength(paths),reviewedAt:null,notes:recipe.notes},features:[{type:'Feature',id:'trace',properties:{role:'trace',sourceIds:[recipe.sourceId]},geometry:{type:'MultiLineString',coordinates:paths}}]},track,recipe.layoutId);
}
