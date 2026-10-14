/** Workspace greetings follow the agency timezone, regardless of browser location. */
export function indiaGreeting(date:Date){
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(date));
 return hour>=5&&hour<12?'Good morning':hour>=12&&hour<17?'Good afternoon':hour>=17&&hour<21?'Good evening':'Good night';
}
