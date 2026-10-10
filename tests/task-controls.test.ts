import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TaskTimerControls} from '../src/components/task-timer-controls';
import {TaskEndStatus} from '../src/components/task-end-status';
import type {TimeTask,TimeLog} from '../src/lib/time-types';
const task={id:'task',membership_id:'me',title:'Video edit',source:'jira',jira_key:'OCT-123'} as TimeTask;
function buttons(state?:TimeLog['state'],overrides={}){
 const html=renderToStaticMarkup(createElement(TaskTimerControls,{task,log:state?{id:'log',task_id:'task',membership_id:'me',state}:undefined,mine:true,closed:false,clocked:true,onBreak:false,busy:false,onTimer:()=>{},...overrides}));
 return Object.fromEntries([...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(m=>[m[2].replace(/<[^>]+>/g,'').trim(),!m[1].includes('disabled')]));
}
test('task controls show one Start/Hold/Resume action plus End with permission and break guards',()=>{
 assert.deepEqual(buttons(),{Start:true,End:false});
 assert.deepEqual(buttons('running'),{Hold:true,End:true});
 assert.deepEqual(buttons('paused'),{Resume:true,End:true});
 assert.deepEqual(buttons('paused',{onBreak:true}),{Resume:false,End:true});
 assert.deepEqual(buttons(undefined,{clocked:false}),{Start:false,End:false});
 assert.deepEqual(buttons(undefined,{mine:false}),{Start:false,End:false});
});
test('ending work shows only the issue’s actual Jira transitions and preserves a saved-time message on failure',()=>{
 const html=renderToStaticMarkup(createElement(TaskEndStatus,{task,details:{ok:true,message:'',issue:{status_name:'Design In Progress',jira_updated:'2026-10-08T10:00:00Z'} as never,transitions:[{id:'42',name:'Send for review',to:{id:'review',name:'Client Design Approval'}}]},loading:false,busy:false,message:{ok:false,message:'Task changed in Jira. Refresh status choices before saving. Recorded work is preserved.'},onRefresh:()=>{},onSave:()=>{},onClose:()=>{}}));
 assert.match(html,/WORK TIME SAVED/);assert.match(html,/Client Design Approval/);assert.match(html,/value="42"/);assert.match(html,/Keep current status/);assert.match(html,/Recorded work is preserved/);assert.doesNotMatch(html,/>Done</);
});
test('completed manual work can Start again, but closed Jira and cancelled work remain blocked',()=>{
 const manual={...task,source:'manual',work_status:'completed'} as TimeTask;
 assert.deepEqual(buttons(undefined,{task:manual,closed:true}),{Start:true,End:false});
 assert.deepEqual(buttons(undefined,{task:manual,closed:true,onBreak:true}),{Start:false,End:false});
 assert.deepEqual(buttons(undefined,{task:manual,closed:true,clocked:false}),{Start:false,End:false});
 assert.deepEqual(buttons(undefined,{task:{...manual,work_status:'cancelled'},closed:true}),{Start:false,End:false});
 assert.deepEqual(buttons(undefined,{closed:true}),{Start:false,End:false});
 assert.deepEqual(buttons('stopped',{task:manual,closed:true}),{Start:true,End:false});
});
