type ConfigurationEvidence = {layoutId:string;name:string;url:string};
type NetworkIdentity = {layoutIds:string[];representation?:string;configurationEvidence?:ConfigurationEvidence[]};

export function validateNetworkIdentity(name:string,selection:NetworkIdentity){
 if(/combo/i.test(name))return;
 const evidence=selection.configurationEvidence;
 if(selection.representation!=='configuration-set'||!evidence||selection.layoutIds.length<2||evidence.length!==selection.layoutIds.length)throw new Error('Unnamed aggregate requires explicit configuration-set evidence');
 const ids=new Set<string>();
 for(const item of evidence){
  if(!selection.layoutIds.includes(item.layoutId)||ids.has(item.layoutId)||!item.name.trim())throw new Error('Configuration evidence must identify each component exactly once');
  let url:URL;try{url=new URL(item.url);}catch{throw new Error('Configuration evidence requires a public identification URL');}
  if(url.protocol!=='https:'&&url.protocol!=='http:')throw new Error('Configuration evidence requires a public identification URL');
  ids.add(item.layoutId);
 }
}
