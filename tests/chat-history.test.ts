import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeChatHistory, type ChatMessage} from '../src/lib/chat-history';
const message=(id:string):ChatMessage=>({id,author_id:'worker',body:id,created_at:`2026-10-09T10:00:${id.padStart(2,'0')}Z`});
test('latest polling preserves exhausted older history and deduplicates overlap',()=>{
 const older=mergeChatHistory({ok:true,messages:[message('2'),message('3')],more:true},{ok:true,messages:[message('1'),message('2')],more:false},true);
 const polled=mergeChatHistory(older,{ok:true,messages:[message('3'),message('4')],more:true});
 assert.deepEqual(polled.messages.map(m=>m.id),['1','2','3','4']);assert.equal(polled.more,false);
});
test('failed polling retains already loaded messages while reporting failure',()=>{
 const previous={ok:true,messages:[message('1')],more:true};
 const failed=mergeChatHistory(previous,{ok:false,messages:[],more:false});
 assert.equal(failed.ok,false);assert.deepEqual(failed.messages,previous.messages);assert.equal(failed.more,true);
});
test('recovery after failed polling preserves exhausted history instead of reopening pagination',()=>{
 const previous={ok:true,messages:[message('1'),message('2')],more:false};
 const failed=mergeChatHistory(previous,{ok:false,messages:[],more:false});
 const recovered=mergeChatHistory(failed,{ok:true,messages:[message('2'),message('3')],more:true});
 assert.equal(recovered.ok,true);assert.equal(recovered.more,false);
 assert.deepEqual(recovered.messages.map(m=>m.id),['1','2','3']);
});
