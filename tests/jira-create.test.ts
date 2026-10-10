import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jiraCreateFields} from '../src/lib/jira-create';
test('Jira create carries exact client labels and rejects invalid label syntax',()=>{
 const input={project:'OCT',issue_type:'10001',summary:'Fixture',description:'Test',labels:'NTT\nClient_Name\nNTT'};
 assert.deepEqual(jiraCreateFields(input).labels,['NTT','Client_Name']);
 assert.throws(()=>jiraCreateFields({...input,labels:'Client Name'}));
 assert.throws(()=>jiraCreateFields({...input,project:'UNAPPROVED'}));
});
