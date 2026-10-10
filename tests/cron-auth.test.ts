import test from 'node:test';
import assert from 'node:assert/strict';
import {validCronRequest} from '../src/lib/cron-auth';
const secret='s'.repeat(40);
test('scheduler endpoint needs a long secret and an exact bearer header',()=>{
  assert.equal(validCronRequest('Bearer '+secret,undefined),null);
  assert.equal(validCronRequest('Bearer short','short'),null);
  assert.equal(validCronRequest(null,secret),false);
  assert.equal(validCronRequest('Bearer '+secret+'x',secret),false);
  assert.equal(validCronRequest(secret,secret),false);
  assert.equal(validCronRequest('Bearer '+secret,secret),true);
});
