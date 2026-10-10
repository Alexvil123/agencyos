import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conditionalReader} from '../src/lib/conditional-read';
import {workReadResponse} from '../src/lib/work-read-response';
const fixture=(serverNow='2026-10-09T06:00:00Z',title='Task')=>({ok:true,autoFetch:{enabled:false},data:{serverNow,self:'employee',tasks:[{title}]}});
test('unchanged Work data skips payload; task/permission/fetch-setting changes invalidate the validator',async()=>{
 const first=workReadResponse(fixture(),null),tag=first.headers.get('etag')!;
 const same=workReadResponse(fixture('2026-10-09T06:00:30Z'),tag);
 assert.equal(same.status,304);assert.equal(await same.text(),'');
 assert.equal(same.headers.get('cache-control'),'private, no-store');assert.equal(same.headers.get('vary'),'Cookie');
 assert.equal(workReadResponse(fixture(undefined,'Updated task'),tag).status,200);
 const changed=fixture();changed.autoFetch.enabled=true;assert.equal(workReadResponse(changed,tag).status,200);
 const scoped=fixture();scoped.data.self='another employee';assert.equal(workReadResponse(scoped,tag).status,200);
 assert.equal(workReadResponse({ok:false,data:null},tag).status,503);
});
test('overlapping polls share one read and the next unchanged poll returns no replacement data',async()=>{
 let calls=0,release!:(r:Response)=>void;
 const request=(async(_url,init)=>{calls++;if(calls===1)return new Promise<Response>(resolve=>{release=resolve;});assert.equal(new Headers(init?.headers).get('if-none-match'),'"v1"');return new Response(null,{status:304});}) as typeof fetch;
 const read=conditionalReader<{value:number}>('/api/work',request),first=read(),second=read();assert.equal(calls,1);
 release(Response.json({value:1},{headers:{etag:'"v1"'}}));assert.deepEqual(await first,await second);
 assert.deepEqual(await read(),{changed:false});assert.equal(calls,2);
});
test('post-mutation read waits for the old poll and fetches again without its old validator',async()=>{
 let calls=0,release!:(r:Response)=>void;
 const request=(async(_url,init)=>{calls++;if(calls===1)return new Promise<Response>(resolve=>{release=resolve;});assert.equal(new Headers(init?.headers).has('if-none-match'),false);return Response.json({value:2},{headers:{etag:'"v2"'}});}) as typeof fetch;
 const read=conditionalReader<{value:number}>('/api/work',request),poll=read(),saved=read(true);assert.equal(calls,1);
 release(Response.json({value:1},{headers:{etag:'"v1"'}}));await poll;assert.deepEqual(await saved,{changed:true,value:{value:2}});assert.equal(calls,2);
});
test('failed authorization clears the validator; an unsolicited 304 cannot reuse prior access',async()=>{
 let calls=0;const request=(async(_url,init)=>{calls++;if(calls===1)return Response.json({value:1},{headers:{etag:'"v1"'}});if(calls===2)return new Response(null,{status:403});assert.equal(new Headers(init?.headers).has('if-none-match'),false);return new Response(null,{status:304});}) as typeof fetch;
 const read=conditionalReader<{value:number}>('/api/work',request);await read();await assert.rejects(read());await assert.rejects(read(),/No verified prior/);
});
test('a hung read aborts and releases the polling slot so a fresh read can recover',async()=>{
 let calls=0;
 const request=(async(_url,init)=>{
  calls++;
  if(calls===1)return new Promise<Response>((_resolve,reject)=>{
   init?.signal?.addEventListener('abort',()=>reject(new Error('Read timed out')),{once:true});
  });
  assert.equal(new Headers(init?.headers).has('if-none-match'),false);
  return Response.json({value:2},{headers:{etag:'"recovered"'}});
 }) as typeof fetch;
 const read=conditionalReader<{value:number}>('/api/work',request,20);
 await assert.rejects(read(),/Read timed out/);
 assert.deepEqual(await read(true),{changed:true,value:{value:2}});
 assert.equal(calls,2);
});
