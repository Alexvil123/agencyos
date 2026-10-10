import {validCronRequest} from '@/lib/cron-auth';
import {runScheduledJob} from '@/lib/scheduled-sync';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Called by a free external scheduler with "Authorization: Bearer <CRON_SECRET>". See docs/SCHEDULED-SYNC.md.
async function handle(request:Request){
  const valid=validCronRequest(request.headers.get('authorization'),process.env.CRON_SECRET);
  if(valid===null)return Response.json({error:'Scheduler not configured'},{status:503});
  if(!valid)return Response.json({error:'Unauthorized'},{status:401});
  const job=new URL(request.url).searchParams.get('job');
  if(job!=='sales'&&job!=='jira')return Response.json({error:'Unknown job'},{status:400});
  try{return Response.json(await runScheduledJob(job),{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({ok:false,job,error:'Job failed; check CRM Sync Health.'},{status:500});}
}
export const GET=handle;
export const POST=handle;
