export function indiaTimestamp(value:string){return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(new Date(value))+' · India time';}
// "5 Oct" for a YYYY-MM-DD calendar day.
export const shortDay=(day:string)=>new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',day:'numeric',month:'short'}).format(new Date(`${day}T00:00:00Z`));
