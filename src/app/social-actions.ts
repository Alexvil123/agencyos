'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {socialData,type SocialPlatformResult} from '@/lib/social-server';
import type {SocialAccount,SocialPost} from '@/lib/social';
const input=z.object({from:z.iso.date(),to:z.iso.date(),fresh:z.boolean().default(false)});
export type SocialResult={ok:boolean;message:string;posts:SocialPost[];accounts:SocialAccount[];platforms:SocialPlatformResult[];fetchedAt:string};
// Post performance is read-only and shown to the Owner and to employees the Owner allowed in Settings. Credentials never leave the server.
export async function loadSocial(range:{from:string;to:string;fresh?:boolean}):Promise<SocialResult>{
  const empty={posts:[] as SocialPost[],accounts:[] as SocialAccount[],platforms:[] as SocialPlatformResult[],fetchedAt:''};
  try{
    const ctx=await workspaceContext();
    if(ctx.preview||ctx.kind!=='employee'||!(ctx.roles.includes('Owner')||ctx.modules.includes('analytics')))return {ok:false,message:'Analytics access has not been given to this account.',...empty};
    const parsed=input.parse(range);
    return {ok:true,message:'',...await socialData({from:parsed.from,to:parsed.to},ctx.organizationId,parsed.fresh)};
  }catch(error){return {ok:false,message:error instanceof z.ZodError?'Choose a valid date range.':error instanceof Error&&error.message.startsWith('Choose a')?error.message:'Social analytics could not be loaded.',...empty};}
}
