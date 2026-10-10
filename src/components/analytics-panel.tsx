'use client';
import '../app/analytics.css';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
import type {loadWorkData} from '@/app/work-actions';
import {conditionalReader} from '@/lib/conditional-read';
import {workRecordScope} from '@/lib/work-record-scope';
import {clockDuration,csvCell,indiaDate,type WorkData} from '@/lib/work-report';
import {ANALYTICS_PRESETS,analyticsRange,analyticsSummary,completedByDay,openMix,trackedBy,trackedByDay,type AnalyticsPreset,type Breakdown} from '@/lib/analytics';
import {useAutoRefresh} from './use-auto-refresh';

const hours=(seconds:number)=>Math.round(seconds/360)/10;
const hm=(seconds:number)=>{const value=Math.max(0,Math.round(seconds/60));return `${Math.floor(value/60)}h ${String(value%60).padStart(2,'0')}m`;};
const shortDay=(day:string)=>new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',day:'numeric',month:'short'}).format(new Date(`${day}T00:00:00Z`));

function BarChart({title,unit,bars}:{title:string;unit:string;bars:{label:string;value:number;detail:string}[]}){
  const width=720,height=190,left=34,bottom=26,top=10,max=Math.max(1,...bars.map(b=>b.value)),inner=width-left-8,step=inner/Math.max(1,bars.length),barWidth=Math.max(2,Math.min(26,step*0.7));
  const every=Math.max(1,Math.ceil(bars.length/12));
  return <figure className="an-chart"><figcaption>{title}</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${bars.map(b=>`${b.label} ${b.detail}`).join(', ')}`} preserveAspectRatio="none">
      {[0,0.5,1].map(f=><g key={f}><line className="an-grid" x1={left} x2={width-8} y1={top+(height-top-bottom)*(1-f)} y2={top+(height-top-bottom)*(1-f)}/><text className="an-axis" x={left-6} y={top+(height-top-bottom)*(1-f)+4} textAnchor="end">{Math.round(max*f*10)/10}</text></g>)}
      {bars.map((bar,index)=>{const h=(height-top-bottom)*(bar.value/max),x=left+index*step+(step-barWidth)/2;return <g key={bar.label+index}><rect className="an-bar" x={x} y={height-bottom-h} width={barWidth} height={Math.max(bar.value>0?2:0,h)} rx={3}><title>{`${bar.label}: ${bar.detail}`}</title></rect>{index%every===0&&<text className="an-axis" x={x+barWidth/2} y={height-8} textAnchor="middle">{bar.label}</text>}</g>;})}
    </svg><small>{unit}</small></figure>;
}
function Bars({title,rows,empty}:{title:string;rows:Breakdown[];empty:string}){
  const max=Math.max(1,...rows.map(r=>r.seconds));
  return <section className="an-card"><h3>{title}</h3>{rows.length?<ul className="an-hbars">{rows.slice(0,8).map(row=><li key={row.key}><span className="an-hlabel" title={row.label}>{row.label}</span><span className="an-htrack"><i style={{width:`${Math.max(2,(row.seconds/max)*100)}%`}}/></span><b>{hm(row.seconds)}</b><small>{row.tasks} task{row.tasks===1?'':'s'}</small></li>)}</ul>:<p className="subtle">{empty}</p>}{rows.length>8&&<small className="subtle">Top 8 of {rows.length} shown. Export for the full list.</small>}</section>;
}

export function AnalyticsPanel({preview=false}:{preview?:boolean}){
  const [data,setData]=useState<WorkData>(),[error,setError]=useState(''),[preset,setPreset]=useState<AnalyticsPreset>('30d'),[employee,setEmployee]=useState('all'),[readWork]=useState(()=>conditionalReader<Awaited<ReturnType<typeof loadWorkData>>>('/api/work'));
  const reload=useCallback(async(fresh=true)=>{
    try{const response=await readWork(fresh);if(!response.changed)return true;const result=response.value!;if(result.ok&&result.data){setData(result.data as unknown as WorkData);setError('');return true;}setError(result.message||'Analytics could not load.');return false;}
    catch{setError('Analytics could not load. Check your connection and refresh.');return false;}
  },[readWork]);
  useEffect(()=>{if(!preview)void Promise.resolve().then(()=>reload());},[preview,reload]);
  useAutoRefresh(()=>reload(false),!preview,60000);
  const now=data?.serverNow||new Date().toISOString(),today=indiaDate(now),range=useMemo(()=>analyticsRange(preset,today),[preset,today]);
  const view=useMemo(()=>{
    if(!data)return undefined;
    const scoped:WorkData={...data,tasks:workRecordScope(data.tasks,false)};
    const daily=trackedByDay(data,range,employee),done=completedByDay(data,range,employee);
    return {summary:analyticsSummary(data,range,now,employee),daily,done,mix:openMix(scoped,now,employee),clients:trackedBy(data,range,'client',employee),people:trackedBy(data,range,'employee',employee),projects:trackedBy(data,range,'project',employee),completed:done.reduce((sum,d)=>sum+d.count,0),tracked:daily.reduce((sum,d)=>sum+d.seconds,0)};
  },[data,range,now,employee]);
  function exportCsv(){
    if(!view)return;
    const lines=[['Section','Name','Seconds','Hours','Tasks'],...view.daily.map(d=>['Tracked per day',d.day,d.seconds,hours(d.seconds),'']),...view.done.map(d=>['Completed per day',d.day,'','',d.count]),...view.clients.map(r=>['By client',r.label,r.seconds,hours(r.seconds),r.tasks]),...view.people.map(r=>['By employee',r.label,r.seconds,hours(r.seconds),r.tasks]),...view.projects.map(r=>['By project',r.label,r.seconds,hours(r.seconds),r.tasks])];
    const blob=new Blob([lines.map(row=>row.map(csvCell).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`analytics-${range.from}-${range.to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(preview)return <section className="panel"><h2>Analytics</h2><p>Sign in to see operational analytics for your workspace.</p></section>;
  if(!data||!view)return <section className="panel"><p role={error?'alert':'status'}>{error||'Loading analytics…'}</p>{error&&<button className="secondary" onClick={()=>void reload()}>Retry</button>}</section>;
  const mixTotal=view.mix.pending+view.mix.in_progress+view.mix.on_hold+view.mix.overdue;
  const mixParts=[['In progress',view.mix.in_progress,'progress'],['To do',view.mix.pending,'todo'],['On hold',view.mix.on_hold,'hold'],['Overdue',view.mix.overdue,'overdue']] as const;
  return <div className="analytics">
    <section className="panel an-controls">
      <div className="an-presets" role="group" aria-label="Period">{ANALYTICS_PRESETS.map(p=><button key={p.key} className={preset===p.key?'selected':''} onClick={()=>setPreset(p.key)}>{p.label}</button>)}</div>
      {data.manager&&<label>Employee<select value={employee} onChange={e=>setEmployee(e.target.value)}><option value="all">Whole team</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>}
      <div className="an-actions"><button className="secondary small" onClick={()=>void reload()}><RefreshCw size={14}/> Refresh</button><button className="secondary small" onClick={exportCsv}><Download size={14}/> Export CSV</button></div>
      <p className="subtle">{shortDay(range.from)} – {shortDay(range.to)} · India time · {view.summary.days} days</p>
    </section>
    {error&&<p role="alert" className="notice">{error}</p>}
    {data.limited&&<p role="alert" className="notice">Record loading limit reached. Totals may be incomplete.</p>}
    <section className="an-kpis" aria-label="Key figures">
      {[['Tracked work',hm(view.tracked),'Closed task sessions'],['Completed tasks',String(view.completed),'Finished in this period'],['Assigned tasks',String(view.summary.assigned),'Assigned in this period'],['Overdue now',String(view.mix.overdue),'Open past their due date'],['Average completion',view.summary.averageCompletionSeconds===null?'—':hm(view.summary.averageCompletionSeconds),'Assignment to completion'],['People working',String(view.summary.activeEmployees),'With recorded work']].map(([label,value,note])=><div className="an-kpi" key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></div>)}
    </section>
    <section className="an-grid2">
      <BarChart title="Tracked hours per day" unit="hours" bars={view.daily.map(d=>({label:shortDay(d.day),value:hours(d.seconds),detail:`${hm(d.seconds)} (${clockDuration(d.seconds)})`}))}/>
      <BarChart title="Tasks completed per day" unit="tasks" bars={view.done.map(d=>({label:shortDay(d.day),value:d.count,detail:`${d.count} completed`}))}/>
    </section>
    <section className="an-card"><h3>Open work right now</h3>{mixTotal?<><div className="an-mix" role="img" aria-label={mixParts.map(([l,v])=>`${l} ${v}`).join(', ')}>{mixParts.filter(([,v])=>v>0).map(([label,value,tone])=><span key={label} className={`an-mix-${tone}`} style={{flexGrow:value}} title={`${label}: ${value}`}>{value}</span>)}</div><ul className="an-legend">{mixParts.map(([label,value,tone])=><li key={label}><i className={`an-mix-${tone}`}/>{label} <b>{value}</b></li>)}</ul></>:<p className="subtle">No open tasks.</p>}</section>
    <section className="an-grid3">
      <Bars title="Hours by client" rows={view.clients} empty="No recorded work in this period."/>
      {data.manager&&employee==='all'&&<Bars title="Hours by employee" rows={view.people} empty="No recorded work in this period."/>}
      <Bars title="Hours by project" rows={view.projects} empty="No recorded work in this period."/>
    </section>
    <details className="an-definitions"><summary>How these numbers are calculated</summary>
      <ul>
        <li><b>Tracked work</b> is the sum of closed task-timer sessions in the period. Running sessions, attendance time and breaks are never included. A session that crosses midnight is split between both days.</li>
        <li><b>Completed tasks</b> are counted on the day Jira (or the CRM for manual tasks) recorded the completion.</li>
        <li><b>Assigned tasks</b> and <b>average completion</b> follow the Reports rules: tasks assigned in the period, completion measured from assignment to completion.</li>
        <li><b>Overdue now</b> counts open tasks whose due date has passed, as of the latest server time. <b>SOURCE</b> reference records are never counted as work.</li>
        <li>Figures describe workload and effort. They are not a productivity score for any person.</li>
      </ul>
    </details>
  </div>;
}
