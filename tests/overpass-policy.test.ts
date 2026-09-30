import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retryDelay} from '../scripts/overpass-policy';
test('Overpass throttling always waits at least thirty seconds',()=>{
 for(const status of [406,429])for(const header of [null,'0','-1','malformed'])assert.equal(retryDelay(status,header),30);
 assert.equal(retryDelay(429,'90'),90);
});
test('retry dates respect the same minimum and a future server delay',()=>{
 const now=Date.parse('2026-09-30T00:00:00Z');
 assert.equal(retryDelay(429,'Wed, 30 Sep 2026 00:01:00 GMT',now),60);
 assert.equal(retryDelay(429,'Tue, 29 Sep 2026 00:00:00 GMT',now),30);
});
