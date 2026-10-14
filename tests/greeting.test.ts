import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indiaGreeting} from '../src/lib/greeting';
test('greetings switch at the exact India-time boundaries, independent of UTC date',()=>{
 for(const [instant,expected] of [['2026-10-12T23:29:59Z','Good night'],['2026-10-12T23:30:00Z','Good morning'],['2026-10-13T06:29:59Z','Good morning'],['2026-10-13T06:30:00Z','Good afternoon'],['2026-10-13T11:29:59Z','Good afternoon'],['2026-10-13T11:30:00Z','Good evening'],['2026-10-13T15:29:59Z','Good evening'],['2026-10-13T15:30:00Z','Good night'],['2026-10-13T18:30:00Z','Good night']])assert.equal(indiaGreeting(new Date(instant)),expected,instant);
});
