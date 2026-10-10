'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {socialData,type SocialPlatformResult} from '@/lib/social-server';
import type {SocialPost} from '@/lib/social';
const input=z.object({from:z.iso.date(),to:z.iso.date(),fresh:z.boolean().default(false)});
export type SocialResult={ok:boolean;message:string;posts:SocialPost[];platforms:SocialPlatformResult[];fetchedAt:string};
// Post performance is read-only and shown to every active employee (the social team needs it). Credentials never leave the server.
export async function loadSocial(range:{from:string;to:string;fresh?:boolean}):Promise<SocialResult>{
  const empty={posts:[] as SocialPost[],platforms:[] as SocialPlatformResult[],fetchedAt:''};
  try{
    const ctx=await workspaceContext();
    if(ctx.preview||ctx.kind!=='employee')return {ok:false,message:'Sign in with an employee account to see social analytics.',...empty};
    const parsed=input.parse(range);
    return {ok:true,message:'',...await socialData({from:parsed.from,to:parsed.to},parsed.fresh)};
  }catch(error){return {ok:false,message:error instanceof z.ZodError?'Choose a valid date range.':error instanceof Error&&error.message.startsWith('Choose a')?error.message:'Social analytics could not be loaded.',...empty};}
}
