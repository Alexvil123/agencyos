import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workRecordScope} from '../src/lib/work-record-scope';
import type {TimeTask} from '../src/lib/time-types';

test('SOURCE references stay out of work and manual tasks stay out of Source',()=>{
 const records=[{id:'source',source:'jira',jira_project:'SOURCE'},{id:'oct',source:'jira',jira_project:'OCT'},{id:'sep',source:'jira',jira_project:'SEP'},{id:'manual',source:'manual',jira_project:null}] as TimeTask[];
 assert.deepEqual(workRecordScope(records).map(t=>t.id),['oct','sep','manual']);
 assert.deepEqual(workRecordScope(records,true).map(t=>t.id),['source']);
 assert.equal(records.length,4,'Filtering never deletes cached records or history');
});
