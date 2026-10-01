import {readFileSync} from 'node:fs';
import {europeanCountries} from './europe-countries';
export const worldCountries:typeof europeanCountries=JSON.parse(readFileSync(new URL('../sources/world/countries.json',import.meta.url),'utf8')).countries;
export const additionalCountries=worldCountries.filter(c=>!europeanCountries.some(e=>e.code===c.code)||c.code==='RU');
const priority=['US','CA','MX','BR','AR','CL','AU','NZ','JP','CN','KR','MY','TH','ID','IN','AE','BH','QA','SA','ZA','RU'];
additionalCountries.sort((a,b)=>(priority.includes(a.code)?priority.indexOf(a.code):999)-(priority.includes(b.code)?priority.indexOf(b.code):999)||a.code.localeCompare(b.code));
