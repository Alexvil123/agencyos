import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskTiming} from '../src/lib/task-timing';
import type {WorkSession} from '../src/lib/work-report';
import type {TimeLog} from '../src/lib/time-types';
test('employee start/hold/resume/end summaries exclude held gaps and other employee work',()=>{
 const sessions=[{log_id:'log',task_id:'t',employee_id:'a',started_at:'2026-10-07T09:00:00Z',ended_at:'2026-10-07T09:20:00Z',paused_at:'2026-10-07T09:20:00Z'},{task_id:'t',employee_id:'a',started_at:'2026-10-07T10:00:00Z',ended_at:null},{task_id:'t',employee_id:'b',started_at:'2026-10-07T08:00:00Z',ended_at:'2026-10-07T09:00:00Z'}] as WorkSession[];
 const logs=[{id:'log',task_id:'t',membership_id:'a',state:'running'}] as TimeLog[];
 const active=taskTiming('t',sessions,logs,'2026-10-07T10:10:00Z','a');assert.equal(active.seconds,1800);assert.equal(active.state,'running');assert.equal(active.endedAt,undefined);assert.equal(active.heldAt,'2026-10-07T09:20:00Z');
 const held=taskTiming('t',sessions.slice(0,1),[{...logs[0],state:'paused'}],'2026-10-07T12:00:00Z','a');assert.equal(held.seconds,1200);assert.equal(held.state,'paused');assert.equal(held.endedAt,undefined);
 const stoppedWhileHeld=taskTiming('t',sessions.slice(0,1),[{...logs[0],state:'stopped',stopped_at:'2026-10-07T10:00:00Z'}],'2026-10-07T12:00:00Z','a');assert.equal(stoppedWhileHeld.endedAt,'2026-10-07T10:00:00Z');assert.equal(stoppedWhileHeld.seconds,1200);
 const ended=taskTiming('t',[{...sessions[1],ended_at:'2026-10-07T10:10:00Z'}],[{...logs[0],state:'stopped'}],'2026-10-07T12:00:00Z','a');assert.equal(ended.state,'ended');assert.equal(ended.endedAt,'2026-10-07T10:10:00Z');assert.equal(ended.seconds,600);
 assert.equal(taskTiming('new',sessions,logs,'2026-10-07T10:10:00Z','a').state,'not_started');
});
