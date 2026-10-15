// Shared display calculations. Persisted clock events must use database/server time.
export const EXPECTED_SECONDS=9.5*60*60;
type TimeSpan={start:string;end:string|null;excluded?:boolean};
type OvertimeBasis='combined'|'working';
function instant(value:string){const result=Date.parse(value);if(!Number.isFinite(result)||!/(Z|[+-]\d\d:\d\d)$/.test(value))throw new Error('Timestamp requires a timezone');return result;}
export function attendanceTotals(clockIn:string,clockOut:string|null,breaks:TimeSpan[],now:string,basis:OvertimeBasis){
 const start=instant(clockIn),finish=instant(clockOut||now);if(finish<start)throw new Error('Clock out precedes clock in');
 const spans=breaks.filter(b=>!b.excluded).map(b=>({start:Math.max(start,instant(b.start)),end:Math.min(finish,instant(b.end||clockOut||now))})).filter(b=>b.end>b.start).sort((a,b)=>a.start-b.start);
 let breakMs=0,previousEnd=start;
 for(const b of spans){breakMs+=Math.max(0,b.end-Math.max(b.start,previousEnd));previousEnd=Math.max(previousEnd,b.end);}
 const excludedMs=breaks.filter(b=>b.excluded).reduce((n,b)=>n+Math.max(0,Math.min(finish,instant(b.end||now))-Math.max(start,instant(b.start))),0);
 const combinedSeconds=Math.max(0,Math.floor((finish-start-excludedMs)/1000)),breakSeconds=Math.min(combinedSeconds,Math.floor(breakMs/1000)),workingSeconds=combinedSeconds-breakSeconds;
 return {combinedSeconds,breakSeconds,workingSeconds,overtimeSeconds:Math.max(0,(basis==='combined'?combinedSeconds:workingSeconds)-EXPECTED_SECONDS),provisional:clockOut===null};
}
export function formatDuration(seconds:number){if(!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid duration');const minutes=Math.floor(seconds/60);return `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m`;}
