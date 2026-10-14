import test from 'node:test';
import assert from 'node:assert/strict';
import {EMOJI_GROUPS,EMOJI_COUNT,rememberEmoji,insertAtCaret,RECENT_LIMIT} from '../src/lib/emoji-data';
test('the emoji pack is large, grouped, and has no blanks or repeats inside a group',()=>{
  assert.ok(EMOJI_COUNT>=700,`expected a big pack, got ${EMOJI_COUNT}`);
  assert.ok(EMOJI_GROUPS.length>=8);
  for(const group of EMOJI_GROUPS){
    assert.ok(group.emojis.length>=30,group.id);
    assert.equal(new Set(group.emojis).size,group.emojis.length,`${group.id} has a repeated emoji`);
    assert.ok(group.emojis.every(e=>e.trim()&&!/\s/.test(e)&&!/^[a-z0-9]+$/i.test(e)),`${group.id} has a blank or a plain letter`);
  }
  const all=EMOJI_GROUPS.flatMap(g=>g.emojis);
  for(const common of ['😀','😂','👍','🙏','❤️','🎉','🔥','✅','👏','🙌','💪','🤝','👨‍💻','☕'])assert.ok(all.includes(common),common);
});
test('recent emojis keep the newest first, no repeats, and a fixed limit',()=>{
  assert.deepEqual(rememberEmoji(['😀','👍'],'👍'),['👍','😀']);
  assert.deepEqual(rememberEmoji([],'🎉'),['🎉']);
  const many=Array.from({length:40},(_,i)=>String.fromCodePoint(0x1f600+i));
  assert.equal(rememberEmoji(many,'🔥').length,RECENT_LIMIT);assert.equal(rememberEmoji(many,'🔥')[0],'🔥');
});
test('an emoji is inserted at the caret or over a selection, and never past the message limit',()=>{
  assert.deepEqual(insertAtCaret('Hello world','👍',5,5),{text:'Hello👍 world',caret:7});
  assert.deepEqual(insertAtCaret('Hello world','🙏',6,11),{text:'Hello 🙏',caret:8},'a selection is replaced');
  assert.deepEqual(insertAtCaret('','😀',0,0),{text:'😀',caret:2});
  assert.deepEqual(insertAtCaret('abc','!',99,99),{text:'abc!',caret:4},'a caret past the end is clamped');
  assert.equal(insertAtCaret('x'.repeat(4000),'😀',4000,4000),null);
  assert.deepEqual(insertAtCaret('abc','!',2,1),{text:'ab!c',caret:3},'a backwards selection is clamped');
});
