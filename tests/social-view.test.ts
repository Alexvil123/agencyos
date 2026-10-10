import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SocialView} from '../src/components/social-view';
import type {SocialResult} from '../src/app/social-actions';
import type {SocialPost} from '../src/lib/social';
const post=(patch:Partial<SocialPost>):SocialPost=>({platform:'instagram',account:'1',accountName:'@brand',id:'a',title:'Launch reel',url:'https://instagram.com/reel/a',thumbnail:'https://img/a.jpg',kind:'Reel',publishedAt:'2026-10-09T10:00:00+05:30',views:5400,likes:120,comments:8,shares:15,saves:20,...patch});
const result:SocialResult={ok:true,message:'',fetchedAt:'2026-10-10T08:00:00Z',platforms:[{platform:'instagram',configured:true,ok:true},{platform:'facebook',configured:true,ok:false,error:'Facebook rejected the saved credentials.'},{platform:'youtube',configured:false,ok:false}],posts:[post({}),post({id:'b',platform:'youtube',kind:'Video',title:'Behind the scenes',url:'https://youtube.com/watch?v=b',thumbnail:null,views:12000,likes:null,comments:45,shares:null,saves:null,accountName:'Brand TV'}),post({id:'c',title:'Photo post',views:null,likes:30,comments:1,shares:null,saves:null,kind:'Photo'})]};
const props={range:{from:'2026-10-01',to:'2026-10-10'},preset:'30d' as const,platform:'all' as 'all'|'instagram'|'facebook'|'youtube',sort:{key:'views' as const,direction:-1 as const},loading:false,onPreset:()=>undefined,onPlatform:()=>undefined,onSort:()=>undefined,onRefresh:()=>undefined};
const render=(r:SocialResult,extra:Partial<typeof props>={})=>renderToStaticMarkup(createElement(SocialView,{result:r,...props,...extra}));
test('the social view shows totals, per-platform bars, top posts and every post with honest dashes',()=>{
  const html=render(result);
  assert.match(html,/Launch reel/);assert.match(html,/Behind the scenes/);assert.match(html,/Photo post/);
  assert.match(html,/17,400/,'total views 5,400 + 12,000');assert.match(html,/Top posts by views/);assert.match(html,/By platform/);assert.match(html,/Views by publish day/);
  assert.match(html,/Facebook: needs attention/);assert.match(html,/Facebook rejected the saved credentials/);assert.match(html,/YouTube: not connected/);assert.match(html,/Instagram: connected/);
  assert.match(html,/Not reported by the platform/,'a post without views is marked, not shown as zero');
  assert.ok(html.indexOf('Behind the scenes')<html.indexOf('Launch reel'),'sorted by views, highest first');
  assert.match(html,/href="https:\/\/youtube.com\/watch\?v=b" target="_blank" rel="noopener noreferrer"/);
});
test('platform filter and empty period are handled',()=>{
  const youtubeOnly=render(result,{platform:'youtube'});assert.match(youtubeOnly,/Behind the scenes/);assert.doesNotMatch(youtubeOnly,/Launch reel/);
  const empty=render({...result,posts:[]});assert.match(empty,/No posts were published in this period/);assert.doesNotMatch(empty,/Top posts by views/);
});
test('without any configured platform the view explains which server variables to set, without values',()=>{
  const html=render({...result,platforms:[{platform:'instagram',configured:false,ok:false},{platform:'facebook',configured:false,ok:false},{platform:'youtube',configured:false,ok:false}],posts:[]});
  for(const name of ['META_SOCIAL_ACCESS_TOKEN','INSTAGRAM_ACCOUNT_IDS','FACEBOOK_PAGE_IDS','YOUTUBE_API_KEY','YOUTUBE_CHANNEL_IDS'])assert.match(html,new RegExp(name));
  assert.match(html,/Connect Instagram, Facebook and YouTube/);
});
