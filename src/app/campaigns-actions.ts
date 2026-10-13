'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {campaignData,type PlatformResult} from '@/lib/campaigns-server';
import type {CampaignRow} from '@/lib/campaigns';
const input=z.object({from:z.iso.date(),to:z.iso.date(),fresh:z.boolean().default(false)});
export type CampaignsResult={ok:boolean;message:string;rows:CampaignRow[];platforms:PlatformResult[];fetchedAt:string};
// Ad spend is sensitive: only the Owner, and employees the Owner allowed in Settings, can read it. Credentials never leave the server.
export async function loadCampaigns(range:{from:string;to:string;fresh?:boolean}):Promise<CampaignsResult>{
  const empty={rows:[] as CampaignRow[],platforms:[] as PlatformResult[],fetchedAt:''};
  try{
    const ctx=await workspaceContext();
    if(ctx.preview||ctx.kind!=='employee'||!(ctx.roles.includes('Owner')||ctx.modules.includes('campaigns')))return {ok:false,message:'Campaigns access has not been given to this account.',...empty};
    const parsed=input.parse(range);
    return {ok:true,message:'',...await campaignData({from:parsed.from,to:parsed.to},ctx.organizationId,parsed.fresh)};
  }catch(error){return {ok:false,message:error instanceof z.ZodError?'Choose a valid date range.':error instanceof Error&&error.message.startsWith('Choose a')?error.message:'Campaigns could not be loaded.',...empty};}
}
