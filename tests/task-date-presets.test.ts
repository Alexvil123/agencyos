import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskDateRange} from '../src/lib/task-date-presets';
test('task date presets use India day, Monday weeks and complete calendar months',()=>{
 const now='2026-10-08T20:00:00Z';
 assert.deepEqual(taskDateRange('today',now),{from:'2026-10-09',to:'2026-10-09'});
 assert.deepEqual(taskDateRange('yesterday',now),{from:'2026-10-08',to:'2026-10-08'});
 assert.deepEqual(taskDateRange('this_week',now),{from:'2026-10-05',to:'2026-10-11'});
 assert.deepEqual(taskDateRange('last_week',now),{from:'2026-09-28',to:'2026-10-04'});
 assert.deepEqual(taskDateRange('this_month',now),{from:'2026-10-01',to:'2026-10-31'});
 assert.deepEqual(taskDateRange('previous_month',now),{from:'2026-09-01',to:'2026-09-30'});
 assert.deepEqual(taskDateRange('previous_month','2024-03-01T04:00:00Z'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(taskDateRange('previous_month','2026-01-02T04:00:00Z'),{from:'2025-12-01',to:'2025-12-31'});
 assert.deepEqual(taskDateRange('all',now),{from:'',to:''});
});
