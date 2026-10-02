import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTimingXml} from '../scripts/reference-timing';
import {timingResearchRequirement} from '../scripts/timing-research';

test('separate timing endpoints require open-route evidence even without a distance',()=>{
 const [open,shared]=parseTimingXml('<database><country name="Example"><circuits><circuit name="Open"><splitinfo><startFinish lat="3000" long="60"/><Finish lat="3001" long="61"/></splitinfo></circuit><circuit name="Shared"><splitinfo><startFinish lat="3000" long="60"/></splitinfo></circuit></circuits></country></database>');
 assert.equal(open.nominalLengthM,undefined);
 assert.equal(timingResearchRequirement(open)?.reason,'open-course-evidence-required');
 assert.equal(timingResearchRequirement({...open,nominalLengthM:1000})?.reason,'open-course-evidence-required');
 assert.equal(timingResearchRequirement(shared)?.reason,'configuration-evidence-required');
 assert.equal(timingResearchRequirement({...shared,nominalLengthM:1000}),null);
});
