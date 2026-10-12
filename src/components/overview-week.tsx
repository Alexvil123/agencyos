import {EXPECTED_SECONDS,formatDuration} from '@/lib/time-core';
import type {WeekDay} from '@/lib/employee-day';
/** Seven days of time at work: working time (solid) and breaks (amber) stacked, with the daily target as a dashed tick. */
export function OverviewWeek({days}:{days:WeekDay[]}){
  const scale=12*3600,LONG=16*3600,total=days.reduce((n,d)=>n+d.working+d.breaks,0),active=days.filter(d=>d.working+d.breaks>0).length;
  const pct=(seconds:number)=>Math.min(100,Math.round(seconds/scale*1000)/10);
  return <section className="panel ov-week" aria-label="Time at work this week">
    <div className="time-heading"><div><h2>This week</h2><p>Clock in to clock out, with breaks. The dashed line is the 9h 30m daily target. A ⚠ marks a day over 16h, usually a missed clock-out.</p></div><div className="ov-week-total"><strong>{formatDuration(total)}</strong><small>{active?`over ${active} day${active===1?'':'s'}`:'no attendance yet'}</small></div></div>
    <ul className="ov-bars">
      {days.map((d,i)=><li key={d.date} className={[d.today?'today':'',d.working+d.breaks>LONG?'long':''].filter(Boolean).join(' ')||undefined} title={`${d.label} ${d.date} · ${formatDuration(d.working)} working · ${formatDuration(d.breaks)} break${d.working+d.breaks>LONG?' · very long day: check the clock-out in Attendance':''}`}>
        <span className="ov-bar-value">{d.working+d.breaks>LONG?'⚠ ':''}{d.working+d.breaks?formatDuration(d.working+d.breaks):'–'}</span>
        <span className="ov-bar-track"><i className="ov-target" style={{bottom:`${pct(EXPECTED_SECONDS)}%`}} aria-hidden="true"/><span className="ov-bar" style={{height:`${pct(d.working+d.breaks)}%`,animationDelay:`${i*70}ms`}}><i className="work" style={{flexGrow:d.working}}/><i className="rest" style={{flexGrow:d.breaks}}/></span></span>
        <small>{d.label}</small>
      </li>)}
    </ul>
  </section>;
}
