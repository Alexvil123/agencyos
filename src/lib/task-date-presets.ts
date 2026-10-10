import {indiaDate} from './work-report';
export type TaskDatePreset='all'|'today'|'yesterday'|'this_week'|'last_week'|'this_month'|'previous_month';
export function taskDateRange(preset:TaskDatePreset,now:string):{from:string;to:string}{
 if(preset==='all')return {from:'',to:''};
 const today=new Date(`${indiaDate(now)}T00:00:00Z`),from=new Date(today),to=new Date(today);
 if(preset==='yesterday'){from.setUTCDate(from.getUTCDate()-1);to.setUTCDate(to.getUTCDate()-1);}
 if(preset==='this_week'||preset==='last_week'){
  const monday=(today.getUTCDay()+6)%7,offset=preset==='last_week'?7:0;
  from.setUTCDate(today.getUTCDate()-monday-offset);to.setTime(from.getTime());to.setUTCDate(to.getUTCDate()+6);
 }
 if(preset==='this_month'||preset==='previous_month'){
  from.setUTCDate(1);if(preset==='previous_month')from.setUTCMonth(from.getUTCMonth()-1);
  to.setTime(from.getTime());to.setUTCMonth(to.getUTCMonth()+1);to.setUTCDate(0);
 }
 return {from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10)};
}
