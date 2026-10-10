import {workspaceContext} from '@/lib/access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const recent=new Map<string,number[]>();
// Browser errors from signed-in users land in the hosting log (Netlify → Logs → Functions). No data is stored.
export async function POST(request:Request){
  let user='';
  try{const ctx=await workspaceContext();if(ctx.preview)return new Response(null,{status:204});user=ctx.membershipId;}catch{return new Response(null,{status:401});}
  const now=Date.now(),hits=(recent.get(user)||[]).filter(t=>now-t<60000);if(hits.length>=20)return new Response(null,{status:429});recent.set(user,[...hits,now]);
  const text=await request.text();if(text.length>4000)return new Response(null,{status:413});
  try{
    const body=JSON.parse(text) as {message?:unknown;stack?:unknown;page?:unknown;kind?:unknown};
    const cut=(v:unknown,n:number)=>typeof v==='string'?v.slice(0,n):'';
    console.error('[client-error]',JSON.stringify({member:user,kind:cut(body.kind,20),page:cut(body.page,120),message:cut(body.message,400),stack:cut(body.stack,1200)}));
  }catch{return new Response(null,{status:400});}
  return new Response(null,{status:204});
}
