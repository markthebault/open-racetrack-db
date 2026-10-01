export function retryDelay(status:number,header:string|null,now=Date.now()){
 const floor=[406,429].includes(status)?30:5;
 if(!header)return floor;
 const numeric=Number(header),requested=Number.isFinite(numeric)?numeric:(Date.parse(header)-now)/1000;
 return Math.max(floor,Number.isFinite(requested)?requested:0);
}
