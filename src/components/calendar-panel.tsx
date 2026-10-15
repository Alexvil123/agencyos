'use client';
import {useCallback,useEffect,useMemo,useRef,useState,useTransition} from 'react';
import Link from 'next/link';
import {CalendarDays,ChevronLeft,ChevronRight,Plus} from 'lucide-react';
import type {loadWorkData} from '@/app/work-actions';
import {calendarCreateTask,calendarRequirements,calendarSetup,calendarUpdateTask,type CalendarResult,type CalendarSetup} from '@/app/calendar-actions';
import {calendarTasks,dayLabel,istDay,monthDays,rangeLabel,shiftAnchor,taskDay,taskTone,tasksByDay,unscheduledTasks,weekDays,type CalendarFilters,type CalendarView} from '@/lib/calendar';
import {MONTH_PROJECTS} from '@/lib/jira-types';
import {JIRA_SITE} from '@/lib/jira-types';
import {taskClientLabel,taskDisplayStatus} from '@/lib/work-jira-sync';
import type {WorkData} from '@/lib/work-report';
import type {TimeTask} from '@/lib/time-types';
import {conditionalReader} from '@/lib/conditional-read';
import {initials} from '@/lib/text';
import {useAutoRefresh,notifyWorkspaceChange} from './use-auto-refresh';
import {WorkDrawer} from './work-drawer';

type Loaded=Awaited<ReturnType<typeof loadWorkData>>;
const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export function CalendarPanel({preview}:{preview:boolean}){
  const [data,setData]=useState<WorkData>(),[today,setToday]=useState(''),[error,setError]=useState('');
  const [view,setView]=useState<CalendarView>('month'),[anchor,setAnchor]=useState('');
  const [filters,setFilters]=useState<CalendarFilters>({employee:'all',project:'all',state:'all'});
  const [openDay,setOpenDay]=useState<string>(),[selected,setSelected]=useState<TimeTask>(),[creating,setCreating]=useState<string|null>(null);
  const [setup,setSetup]=useState<CalendarSetup>(),[result,setResult]=useState<CalendarResult>(),[busy,start]=useTransition();
  const dragged=useRef<string|undefined>(undefined),setupRequested=useRef(false);
  const [readWork]=useState(()=>conditionalReader<Loaded>('/api/work'));
  const reload=useCallback(async(fresh=true)=>{
    try{
      const response=await readWork(fresh);if(!response.changed)return true;
      const value=response.value!;
      if(value.ok&&value.data){const next=value.data as unknown as WorkData;setData(next);setToday(istDay(next.serverNow));setAnchor(previous=>previous||istDay(next.serverNow));setError('');return true;}
      setError(value.message||'The calendar could not load.');return false;
    }catch{setError('The calendar could not refresh. Check your connection and try again.');return false;}
  },[readWork]);
  useEffect(()=>{if(!preview)void Promise.resolve().then(()=>reload());},[preview,reload]);
  useAutoRefresh(()=>reload(false),!preview&&!busy);
  const owner=Boolean(data?.owner);
  useEffect(()=>{
    if(!owner||setupRequested.current||(creating===null&&!selected))return;
    setupRequested.current=true;
    void calendarSetup().then(next=>{setSetup(next);if(!next.ok)setupRequested.current=false;});
  },[owner,creating,selected]);

  const visible=useMemo(()=>data?calendarTasks(data.tasks,filters,today):[],[data,filters,today]);
  const byDay=useMemo(()=>tasksByDay(visible),[visible]);
  const unscheduled=useMemo(()=>unscheduledTasks(visible,today),[visible,today]);
  // Only the month projects that actually have tasks are offered as a filter.
  const projectsInUse=useMemo(()=>MONTH_PROJECTS.filter(p=>(data?.tasks||[]).some(t=>t.jira_project===p)),[data]);
  const labels=useMemo(()=>[...new Set((data?.tasks||[]).flatMap(t=>t.jira_labels||[]))].sort((a,b)=>a.localeCompare(b)),[data]);
  const name=(id:string)=>data?.people.find(p=>p.id===id)?.display_name||'Unassigned';
  if(preview)return <section className="panel time-panel"><h2>Calendar</h2><p>Sign in to see your tasks on the calendar.</p></section>;
  if(!data||!anchor)return <section className="panel time-panel" role="status"><h2>Calendar</h2><p>{error||'Loading your calendar…'}</p>{error&&<button className="secondary" onClick={()=>void reload()}>Retry</button>}</section>;

  const days=view==='month'?monthDays(anchor):weekDays(anchor);
  const monthKey=anchor.slice(0,7);
  const inView=days.flatMap(day=>byDay.get(day)||[]);
  const overdue=inView.filter(t=>taskTone(t,today)==='overdue').length;
  function finish(next:CalendarResult){setResult(next);notifyWorkspaceChange();void reload();}
  function reschedule(taskId:string,day:string){
    const task=data?.tasks.find(t=>t.id===taskId);
    if(!owner||!task||task.source!=='jira'||taskDay(task)===day)return;
    const form=new FormData();form.set('task',task.id);form.set('change_due','yes');form.set('due_date',day);
    setResult({ok:true,message:`Moving ${task.jira_key} to ${day} in Jira…`});
    start(async()=>finish(await calendarUpdateTask(form)));
  }
  const filterSelect=(label:string,value:string,options:[string,string][],set:(value:string)=>void)=>
    <label className="cal-filter">{label}<select value={value} onChange={e=>set(e.target.value)}>{options.map(([v,text])=><option key={v} value={v}>{text}</option>)}</select></label>;

  return <div className="cal-workspace">
    <section className="panel cal-toolbar">
      <div className="cal-title">
        <span className="cal-title-icon" aria-hidden="true"><CalendarDays size={20}/></span>
        <div><h2>{rangeLabel(anchor,view)}</h2><small>{inView.length} task{inView.length===1?'':'s'} in view{overdue?` · ${overdue} overdue`:''} · India time</small></div>
      </div>
      <div className="cal-controls">
        <div className="cal-nav" role="group" aria-label="Calendar navigation">
          <button className="icon-button" aria-label="Previous" onClick={()=>setAnchor(shiftAnchor(anchor,view,-1))}><ChevronLeft size={18}/></button>
          <button className="secondary small" onClick={()=>setAnchor(today)}>Today</button>
          <button className="icon-button" aria-label="Next" onClick={()=>setAnchor(shiftAnchor(anchor,view,1))}><ChevronRight size={18}/></button>
        </div>
        <div className="tabs cal-view" role="group" aria-label="Calendar view">{(['month','week'] as const).map(v=><button key={v} className={view===v?'selected':''} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='month'?'Month':'Week'}</button>)}</div>
        {owner&&<button className="primary small" onClick={()=>setCreating(today)}><Plus size={15}/> New Jira task</button>}
      </div>
      <div className="cal-filters">
        {data.manager&&filterSelect('Employee',filters.employee,[['all','Everyone'],...data.people.map(p=>[p.id,p.display_name] as [string,string])],v=>setFilters(f=>({...f,employee:v})))}
        {filterSelect('Project',filters.project,[['all','All projects'],...projectsInUse.map(p=>[p,p] as [string,string])],v=>setFilters(f=>({...f,project:v})))}
        {filterSelect('Status',filters.state,[['all','All'],['open','Open'],['done','Done']],v=>setFilters(f=>({...f,state:v as CalendarFilters['state']})))}
        <ul className="cal-legend" aria-label="Legend"><li className="tone-todo">To do</li><li className="tone-progress">In progress</li><li className="tone-hold">On hold</li><li className="tone-overdue">Overdue</li><li className="tone-done">Done</li></ul>
      </div>
    </section>
    {error&&<p role="alert" className="notice">{error}</p>}
    {result&&<p role="status" className={`form-message ${result.ok?'success':'error'}`}>{busy?'Saving to Jira…':result.message}</p>}
    {!owner&&<p className="notice">Your assigned tasks appear on their due date. The Owner creates and assigns Jira tasks from this calendar; changes sync to Jira.</p>}
    <div className="cal-layout">
      <section className={`panel cal-board cal-${view}`} aria-label="Calendar">
        <div className="cal-grid" role="grid" aria-label={rangeLabel(anchor,view)}>
          {WEEKDAYS.map(d=><div className="cal-weekday" role="columnheader" key={d}>{d}</div>)}
          {days.map(day=>{
            const items=byDay.get(day)||[],shown=view==='month'?items.slice(0,3):items,outside=view==='month'&&day.slice(0,7)!==monthKey;
            return <div key={day} role="gridcell" tabIndex={0} aria-label={`${dayLabel(day)}: ${items.length} task${items.length===1?'':'s'}`}
              className={`cal-day${day===today?' today':''}${outside?' outside':''}${new Date(`${day}T00:00:00Z`).getUTCDay()===0?' sunday':''}`}
              onClick={()=>setOpenDay(day)} onKeyDown={e=>{if(e.key==='Enter'&&e.target===e.currentTarget)setOpenDay(day);}}
              onDragOver={e=>{if(owner&&dragged.current)e.preventDefault();}}
              onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain')||dragged.current;dragged.current=undefined;if(id)reschedule(id,day);}}>
              <div className="cal-day-head"><span className="cal-daynum">{Number(day.slice(8))}{view==='week'&&<small> {WEEKDAYS[(new Date(`${day}T00:00:00Z`).getUTCDay()+6)%7]}</small>}</span>{items.length>0&&<span className="cal-count" aria-hidden="true">{items.length}</span>}</div>
              <div className="cal-chips">
                {shown.map(t=><TaskChip key={t.id} task={t} tone={taskTone(t,today)} who={name(t.membership_id)} draggable={owner&&t.source==='jira'} onDragStart={()=>{dragged.current=t.id;}} onOpen={()=>setSelected(t)}/>)}
                {items.length>shown.length&&<button className="cal-more" onClick={e=>{e.stopPropagation();setOpenDay(day);}}>+{items.length-shown.length} more</button>}
              </div>
            </div>;
          })}
        </div>
      </section>
      {owner&&<aside className="panel cal-tray" aria-label="Tasks without a due date">
        <h3>No due date</h3>
        <p className="subtle">Drag a task onto a day to schedule it in Jira.</p>
        {unscheduled.length?<div className="cal-chips">{unscheduled.slice(0,40).map(t=><TaskChip key={t.id} task={t} tone="todo" who={name(t.membership_id)} draggable onDragStart={()=>{dragged.current=t.id;}} onOpen={()=>setSelected(t)}/>)}{unscheduled.length>40&&<small>+{unscheduled.length-40} more in Work</small>}</div>:<p className="subtle">Every open task has a date.</p>}
      </aside>}
    </div>

    {openDay&&<WorkDrawer label={dayLabel(openDay)} busy={busy} onClose={()=>setOpenDay(undefined)}>
      <section className="panel time-panel cal-drawer">
        <div className="time-heading"><div><span className="eyebrow">{openDay===today?'TODAY':'DAY'}</span><h2>{dayLabel(openDay)}</h2></div><button className="secondary" onClick={()=>setOpenDay(undefined)}>Close</button></div>
        {owner&&<button className="primary small" onClick={()=>{setCreating(openDay);setOpenDay(undefined);}}><Plus size={15}/> New Jira task on this day</button>}
        {(byDay.get(openDay)||[]).length?<ul className="cal-day-list">{(byDay.get(openDay)||[]).map(t=><li key={t.id}><TaskChip task={t} tone={taskTone(t,today)} who={name(t.membership_id)} draggable={false} onDragStart={()=>undefined} onOpen={()=>{setOpenDay(undefined);setSelected(t);}}/><small>{taskDisplayStatus(t)} · {name(t.membership_id)}</small></li>)}</ul>:<p className="subtle">No tasks on this day.</p>}
      </section>
    </WorkDrawer>}

    {selected&&<WorkDrawer label={`${selected.jira_key||'Task'} details`} busy={busy} onClose={()=>setSelected(undefined)}>
      <TaskDetails task={selected} data={data} setup={setup} owner={owner} busy={busy} who={name(selected.membership_id)}
        onClose={()=>setSelected(undefined)}
        onSave={form=>{setSelected(undefined);setResult({ok:true,message:'Saving to Jira…'});start(async()=>finish(await calendarUpdateTask(form)));}}/>
    </WorkDrawer>}

    {creating!==null&&owner&&<WorkDrawer label="Create Jira task" busy={busy} onClose={()=>setCreating(null)}>
      <CreateTask day={creating} setup={setup} labels={labels} busy={busy} onClose={()=>setCreating(null)}
        onSubmit={form=>start(async()=>{const next=await calendarCreateTask(form);finish(next);if(next.ok)setCreating(null);})}/>
    </WorkDrawer>}
  </div>;
}

function TaskChip({task,tone,who,draggable,onDragStart,onOpen}:{task:TimeTask;tone:string;who:string;draggable:boolean;onDragStart:()=>void;onOpen:()=>void}){
  return <button type="button" className={`cal-chip tone-${tone}`} draggable={draggable} title={`${task.jira_key} · ${task.title} · ${who}`}
    onDragStart={e=>{onDragStart();e.dataTransfer.setData('text/plain',task.id);e.dataTransfer.effectAllowed='move';}}
    onClick={e=>{e.stopPropagation();onOpen();}}>
    <span className="cal-chip-key">{task.jira_key}</span><span className="cal-chip-title">{task.title}</span><span className="cal-avatar" aria-hidden="true">{initials(who)}</span>
  </button>;
}

function TaskDetails({task,data,setup,owner,busy,who,onClose,onSave}:{task:TimeTask;data:WorkData;setup?:CalendarSetup;owner:boolean;busy:boolean;who:string;onClose:()=>void;onSave:(form:FormData)=>void}){
  const day=taskDay(task)||'',editable=owner&&task.source==='jira'&&task.jira_project!=='SOURCE';
  // An unassigned Jira task has no member; use '' so the form never sends the text "null".
  const current=task.membership_id||'';
  const [due,setDue]=useState(day),[assignee,setAssignee]=useState(current);
  const changed=due!==day||assignee!==current;
  return <section className="panel time-panel cal-drawer">
    <div className="time-heading"><div><span className="eyebrow">JIRA TASK</span><h2>{task.title}</h2></div><button className="secondary" onClick={onClose}>Close</button></div>
    <dl className="cal-meta">
      <div><dt>Key</dt><dd><a href={`${JIRA_SITE}/browse/${encodeURIComponent(task.jira_key||'')}`} target="_blank" rel="noopener noreferrer">{task.jira_key} ↗</a></dd></div>
      <div><dt>Status</dt><dd>{taskDisplayStatus(task)}</dd></div>
      <div><dt>Assigned to</dt><dd>{who}</dd></div>
      <div><dt>Due</dt><dd>{day||'No due date'}</dd></div>
      <div><dt>Client / labels</dt><dd>{taskClientLabel(task,data.clients)}</dd></div>
      {task.jira_project&&<div><dt>Project</dt><dd>{task.jira_project}</dd></div>}
    </dl>
    {task.description&&<p className="work-description">{task.description}</p>}
    {editable?<form className="stack time-form" onSubmit={e=>{
      e.preventDefault();
      const form=new FormData();form.set('task',task.id);
      form.set('change_due',due!==day?'yes':'no');form.set('due_date',due);
      form.set('change_assignee',assignee!==current?'yes':'no');form.set('assignee',assignee);
      onSave(form);
    }}>
      <h3>Reschedule or reassign in Jira</h3>
      <label>Assign to<select value={assignee} onChange={e=>setAssignee(e.target.value)} disabled={!setup?.ok}>
        {!setup&&<option value={current}>{who}</option>}
        {setup?.assignees.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        {setup?.assignees.every(a=>a.id!==current)&&<option value={current}>{who}</option>}
      </select></label>
      <label>Due date<input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
      {setup&&!setup.ok&&<p role="alert" className="form-message error">{setup.message}</p>}
      <button className="primary" disabled={busy||!changed||!setup?.ok}>Save to Jira</button>
      <p className="subtle">Changes are sent to Jira, read back, then shown here. Work timers and recorded time are not affected.</p>
    </form>:<p className="subtle">The Owner can reschedule or reassign this task.</p>}
    <div className="time-controls"><Link className="secondary" href={`/work?task=${task.id}`}>Open in Work</Link></div>
  </section>;
}

function CreateTask({day,setup,labels,busy,onClose,onSubmit}:{day:string;setup?:CalendarSetup;labels:string[];busy:boolean;onClose:()=>void;onSubmit:(form:FormData)=>void}){
  // Projects come from Jira (months that exist); the month of the chosen day is preselected when it exists.
  const projects=setup?.projects||[],[picked,setProject]=useState(''),[ticket]=useState(()=>crypto.randomUUID());
  const project=projects.includes(picked)?picked:(projects.find(p=>p===MONTH_PROJECTS[Number(day.slice(5,7))-1])||projects[projects.length-1]||'');
  const types=setup?.issueTypes[project]||[],[typeId,setTypeId]=useState('');
  const chosen=types.some(t=>t.id===typeId)?typeId:(types.find(t=>/^task$/i.test(t.name))||types[0])?.id||'';
  const [requirements,setRequirements]=useState<{key:string;missing:string[];error:string}>();
  useEffect(()=>{
    if(!chosen)return;let cancelled=false;
    void calendarRequirements(project,chosen).then(r=>{if(!cancelled)setRequirements({key:`${project}:${chosen}`,missing:r.missing,error:r.ok?'':r.message});});
    return()=>{cancelled=true;};
  },[project,chosen]);
  const checked=requirements?.key===`${project}:${chosen}`?requirements:undefined,blocked=Boolean(checked?.missing.length);
  return <section className="panel time-panel cal-drawer">
    <div className="time-heading"><div><span className="eyebrow">CREATED IN JIRA</span><h2>New Jira task</h2></div><button className="secondary" onClick={onClose}>Close</button></div>
    {!setup&&<p role="status">Loading Jira projects and employees…</p>}
    {setup&&!setup.ok&&<p role="alert" className="form-message error">{setup.message}</p>}
    <form className="stack time-form" action={form=>onSubmit(form)}>
      <input type="hidden" name="ticket" value={ticket}/>
      <label>Title<input name="summary" required maxLength={255} placeholder="What needs to be done?" autoFocus/></label>
      <label>Description<textarea name="description" maxLength={20000} rows={4} placeholder="Optional details, links, references"/></label>
      <div className="cal-form-row">
        <label>Jira project<select name="project" value={project} onChange={e=>setProject(e.target.value)} disabled={!projects.length}>{projects.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
        <label>Issue type<select name="issue_type" required disabled={!types.length} value={chosen} onChange={e=>setTypeId(e.target.value)}>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      </div>
      <div className="cal-form-row">
        <label>Assign to<select name="assignee" defaultValue=""><option value="">Unassigned</option>{setup?.assignees.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Due date<input name="due_date" type="date" defaultValue={day}/></label>
      </div>
      <label>Client label<input name="label" list="cal-labels" maxLength={255} placeholder="Existing client label (optional)"/><datalist id="cal-labels">{labels.map(l=><option key={l} value={l}/>)}</datalist></label>
      {blocked&&<p role="alert" className="form-message error">Jira also requires: {checked!.missing.join(", ")}. This form cannot fill {checked!.missing.length===1?"that field":"those fields"}, so create this kind of task in Jira directly.</p>}
      {checked?.error&&<p role="status" className="subtle">{checked.error}</p>}
      <label className="checkbox-label"><input name="confirmed" type="checkbox" value="yes" required/>Create this task in Jira now. The assignee will see it in their Work list.</label>
      <button className="primary" disabled={busy||!setup?.ok||!types.length||blocked}>{busy?'Creating in Jira…':'Create in Jira'}</button>
    </form>
  </section>;
}
