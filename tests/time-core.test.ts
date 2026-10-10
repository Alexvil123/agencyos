import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attendanceTotals,shiftStart,lateness,formatDuration} from '../src/lib/time-core';
test('both approved shifts span 9:30 in India time',()=>{
 assert.equal(shiftStart('2026-10-06','early'),'2026-10-06T08:30:00+05:30');
 assert.equal(shiftStart('2026-10-06','late'),'2026-10-06T09:00:00+05:30');
 assert.throws(()=>shiftStart('2026-02-30','early'));
});
test('break time and work add up to elapsed attendance; duplicate spans cannot double-count',()=>{
 const total=attendanceTotals('2026-10-06T08:30:00+05:30','2026-10-06T18:00:00+05:30',[
 {start:'2026-10-06T13:00:00+05:30',end:'2026-10-06T14:00:00+05:30'},
 {start:'2026-10-06T13:30:00+05:30',end:'2026-10-06T14:00:00+05:30'}],'2026-10-06T19:00:00+05:30','combined');
 assert.equal(total.combinedSeconds,34200);assert.equal(total.breakSeconds,3600);assert.equal(total.workingSeconds,30600);assert.equal(total.overtimeSeconds,0);assert.equal(total.provisional,false);
});
test('overtime calculation supports a reviewed policy, without treating breaks as task work',()=>{
 const args=['2026-10-06T09:00:00+05:30','2026-10-06T19:00:00+05:30',[{start:'2026-10-06T13:00:00+05:30',end:'2026-10-06T14:00:00+05:30'}],'2026-10-06T19:00:00+05:30'] as const;
 assert.equal(attendanceTotals(args[0],args[1],[...args[2]],args[3],'combined').overtimeSeconds,1800);
 assert.equal(attendanceTotals(args[0],args[1],[...args[2]],args[3],'working').overtimeSeconds,0);
});
test('active break and unfinished attendance are provisional; invalid clocks fail',()=>{
 const total=attendanceTotals('2026-10-06T09:00:00+05:30',null,[{start:'2026-10-06T10:00:00+05:30',end:null}],'2026-10-06T10:15:00+05:30','combined');
 assert.equal(total.breakSeconds,900);assert.equal(total.workingSeconds,3600);assert.equal(total.provisional,true);
 assert.throws(()=>attendanceTotals('2026-10-06T09:00:00',null,[],'2026-10-06T10:00:00Z','combined'));
 assert.throws(()=>attendanceTotals('2026-10-06T09:00:00Z','2026-10-06T08:00:00Z',[],'2026-10-06T10:00:00Z','combined'));
});
test('five-minute grace is inclusive and durations preserve total hours',()=>{
 assert.equal(lateness('2026-10-06T08:35:00+05:30',shiftStart('2026-10-06','early')).late,false);
 assert.equal(lateness('2026-10-06T08:35:01+05:30',shiftStart('2026-10-06','early')).late,true);
 assert.equal(formatDuration(34200),'9h 30m');
});
test('approved re-entry excludes off-clock gaps from work, breaks and daily attendance',()=>{
 const t=attendanceTotals('2026-10-09T09:00:00+05:30','2026-10-09T12:00:00+05:30',[{start:'2026-10-09T10:00:00+05:30',end:'2026-10-09T11:00:00+05:30',excluded:true},{start:'2026-10-09T11:00:00+05:30',end:'2026-10-09T11:15:00+05:30'}],'2026-10-09T12:00:00+05:30','working');
 assert.equal(t.combinedSeconds,7200);assert.equal(t.breakSeconds,900);assert.equal(t.workingSeconds,6300);
});
