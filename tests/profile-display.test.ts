import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indiaTimestamp} from '../src/lib/display-time';
import {photoFormat} from '../src/lib/profile-photo';
test('announcement date and time use India timezone across UTC midnight',()=>{const text=indiaTimestamp('2026-10-08T20:00:00Z');assert.match(text,/09 Oct 2026/);assert.match(text,/01:30:00 am/i);assert.match(text,/India time/);});
test('photo upload rejects executable formats and detects PNG JPEG WebP signatures',()=>{assert.throws(()=>photoFormat(new TextEncoder().encode('<svg onload="alert(1)">')));assert.equal(photoFormat(new Uint8Array([137,80,78,71,13,10,26,10])).contentType,'image/png');assert.equal(photoFormat(new Uint8Array([255,216,255])).contentType,'image/jpeg');assert.equal(photoFormat(new TextEncoder().encode('RIFF1234WEBP')).contentType,'image/webp');});
