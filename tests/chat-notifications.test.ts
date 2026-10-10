import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newChatNotices,chatNoticeLink,type ChatNotice} from '../src/lib/chat-notifications';
const item:ChatNotice={conversationId:'chat-a',messageId:'message-a',sender:'Employee',group:null,body:'Hello',createdAt:'2026-10-10T06:00:00Z',unread:2};
test('startup unread messages do not produce a burst of historical popups',()=>{assert.deepEqual(newChatNotices([item],null,''),[]);});
test('new messages notify once and visible conversation messages do not interrupt reading',()=>{
 assert.deepEqual(newChatNotices([item],{'chat-a':'message-a'},''),[]);
 assert.deepEqual(newChatNotices([item],{'chat-a':'older'},'chat-a'),[]);
 assert.deepEqual(newChatNotices([item],{'chat-a':'older'},'chat-b'),[item]);
 assert.deepEqual(newChatNotices([item],{},''),[item]);
});
test('personal and group notifications deep link to their exact conversation safely',()=>{assert.equal(chatNoticeLink('a&b'),'/chat?conversation=a%26b');});
