import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateNetworkIdentity} from '../scripts/network-identity';

test('a normal layout cannot silently become a multi-configuration network',()=>{
 assert.throws(()=>validateNetworkIdentity('Inner Circuit',{layoutIds:['inner','gearbox']}),/explicit configuration-set evidence/);
 validateNetworkIdentity('Circuit Combo',{layoutIds:['inner','gearbox']});
});
test('an explicitly reviewed set requires complete, unique, public component identification',()=>{
 const selection={layoutIds:['inner','gearbox'],representation:'configuration-set',configurationEvidence:[{layoutId:'inner',name:'Inner Circuit',url:'https://example.com/inner'},{layoutId:'gearbox',name:'Gearbox Circuit',url:'https://example.com/gearbox'}]};
 validateNetworkIdentity('Circuit',selection);
 assert.throws(()=>validateNetworkIdentity('Circuit',{...selection,configurationEvidence:selection.configurationEvidence.slice(0,1)}),/explicit configuration-set evidence/);
 assert.throws(()=>validateNetworkIdentity('Circuit',{...selection,configurationEvidence:[selection.configurationEvidence[0],selection.configurationEvidence[0]]}),/exactly once/);
 assert.throws(()=>validateNetworkIdentity('Circuit',{...selection,configurationEvidence:[selection.configurationEvidence[0],{...selection.configurationEvidence[1],layoutId:'pit'}]}),/exactly once/);
 assert.throws(()=>validateNetworkIdentity('Circuit',{...selection,configurationEvidence:[selection.configurationEvidence[0],{...selection.configurationEvidence[1],url:'file:///tmp/private.png'}]}),/public identification URL/);
});
