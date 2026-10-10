import {test} from 'node:test';
import assert from 'node:assert/strict';
import {refreshLoop} from '../src/lib/auto-refresh';
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('automatic refresh backs off failed reads, recovers, skips hidden pages and cleans up',async()=>{
 const pending=new Map<number,()=>void>(),delays:number[]=[];let next=0,visible=true,calls=0;
 const loop=refreshLoop({refresh:async()=>{calls++;return calls>2;},active:()=>visible,schedule:(fn,delay)=>{delays.push(delay);pending.set(++next,fn);return next;},cancel:handle=>pending.delete(handle as number)});
 const fire=async()=>{const [id,fn]=pending.entries().next().value!;pending.delete(id);fn();await flush();};
 await fire();await fire();await fire();assert.deepEqual(delays,[30000,60000,120000,30000]);
 visible=false;await fire();assert.equal(calls,3);
 visible=true;loop.wake();await flush();assert.equal(calls,4);
 loop.stop();assert.equal(pending.size,0);loop.wake();assert.equal(calls,4);
});
test('focus and change signals never overlap an active refresh or reschedule after unmount',async()=>{
 let release!:()=>void,calls=0;const pending=new Map<number,()=>void>();let next=0;
 const loop=refreshLoop({refresh:()=>{calls++;return new Promise<void>(resolve=>{release=resolve;});},active:()=>true,schedule:fn=>{pending.set(++next,fn);return next;},cancel:handle=>pending.delete(handle as number)});
 loop.wake();loop.wake();assert.equal(calls,1);loop.stop();release();await flush();assert.equal(pending.size,0);
});
