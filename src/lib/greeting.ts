export const greetings = {morning:'Good morning',afternoon:'Good afternoon',evening:'Good evening',night:'Good night'} as const;
export type GreetingPeriod = keyof typeof greetings;
/** Greeting text and decorative imagery share the agency timezone and boundaries. */
export function indiaGreetingPeriod(date:Date):GreetingPeriod{
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(date));
 return hour>=5&&hour<12?'morning':hour>=12&&hour<17?'afternoon':hour>=17&&hour<21?'evening':'night';
}
export function indiaGreeting(date:Date){return greetings[indiaGreetingPeriod(date)];}
