import test from 'node:test';
import assert from 'node:assert/strict';
import {taskDepartmentId} from '../src/lib/work-report';
test('imported Jira tasks use the assignee department; an explicit task department wins',()=>{
  const data={employeeDepartments:[{membership_id:'m1',department_id:'d1'},{membership_id:'m2',department_id:null}]};
  assert.equal(taskDepartmentId(data,{membership_id:'m1',department_id:null}),'d1');
  assert.equal(taskDepartmentId(data,{membership_id:'m1',department_id:'d9'}),'d9');
  assert.equal(taskDepartmentId(data,{membership_id:'m2'}),null);
  assert.equal(taskDepartmentId({},{membership_id:'m1'}),null);
});
