import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchInstagram,fetchFacebook,fetchYouTube,insightValue,engagement,socialTotals,viewsByDay,byPlatform,normalizeMetaId,normalizeChannelId,SocialApiError,type SocialPost,type MetaSocialConfig} from '../src/lib/social';
const range={from:'2026-10-01',to:'2026-10-10'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const meta:MetaSocialConfig={token:'secret-token',version:'v25.0',facebookPages:['1122334455'],instagramAccounts:['9988776655']};
test('account IDs are validated',()=>{
  assert.equal(normalizeMetaId(' 1234567890 '),'1234567890');assert.throws(()=>normalizeMetaId('page-name'));
  assert.equal(normalizeChannelId('UCabcdefghijklmnopqrstuv'),'UCabcdefghijklmnopqrstuv');assert.throws(()=>normalizeChannelId('@handle'));
  assert.equal(insightValue({data:[{name:'views',values:[{value:'42'}]}]},'views'),42);assert.equal(insightValue({data:[{name:'x',total_value:{value:7}}]},'x'),7);assert.equal(insightValue(undefined,'views'),null);
});
test('Instagram posts in range get views from insights, likes from the media and an honest null when insights fail',async()=>{
  const calls:string[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{
    calls.push(url);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer secret-token');
    if(url.includes('/9988776655?fields=username'))return json({username:'brand_official'});
    if(url.includes('/9988776655/media'))return json({data:[
      {id:'m1',caption:'Launch day\n\nbig news',media_type:'VIDEO',media_product_type:'REELS',permalink:'https://instagram.com/reel/1',timestamp:'2026-10-09T10:00:00+0000',like_count:120,comments_count:8,thumbnail_url:'https://img/1.jpg'},
      {id:'m2',caption:'Photo',media_type:'IMAGE',permalink:'https://instagram.com/p/2',timestamp:'2026-10-05T10:00:00+0000',like_count:30,comments_count:1,media_url:'https://img/2.jpg'},
      {id:'old',caption:'Old',media_type:'IMAGE',timestamp:'2026-08-01T10:00:00+0000',like_count:1,comments_count:0}]});
    if(url.includes('/m1/insights'))return json({data:[{name:'views',values:[{value:5400}]},{name:'reach',values:[{value:4000}]},{name:'saved',values:[{value:20}]},{name:'shares',values:[{value:15}]}]});
    if(url.includes('/m2/insights')&&url.includes('metric=views,reach'))return json({error:{message:'metric not supported'}},400);
    if(url.includes('/m2/insights'))return json({data:[{name:'views',values:[{value:900}]}]});
    return json({},404);
  }) as unknown as typeof fetch;
  const posts=await fetchInstagram(meta,range,fetcher);
  assert.deepEqual(posts.map(p=>[p.id,p.kind,p.views,p.likes,p.comments,p.shares,p.saves]),[['m1','Reel',5400,120,8,15,20],['m2','Photo',900,30,1,null,null]]);
  assert.equal(posts[0].accountName,'@brand_official');assert.equal(posts[0].title,'Launch day big news');assert.equal(posts[0].thumbnail,'https://img/1.jpg');
  assert.ok(calls.every(u=>!u.includes('secret-token')));assert.ok(!calls.some(u=>u.includes('/old/')));
  const down=(async(url:string)=>url.includes('/media')?json({data:[{id:'m3',timestamp:'2026-10-08T00:00:00+0000',like_count:1,comments_count:0}]}):url.includes('insights')?json({},500):json({username:'x'})) as unknown as typeof fetch;
  assert.equal((await fetchInstagram(meta,range,down))[0].views,null);
});
test('Facebook uses the Page token, post_media_view and reaction totals',async()=>{
  const seen:{url:string;auth:string|null}[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{
    seen.push({url,auth:new Headers(init?.headers).get('authorization')});
    if(url.includes('/1122334455?fields=name,access_token'))return json({name:'Brand Page',access_token:'page-token'});
    if(url.includes('/published_posts'))return json({data:[{id:'1122334455_1',message:'New offer',created_time:'2026-10-08T09:00:00+0000',permalink_url:'https://facebook.com/1',full_picture:'https://img/f.jpg',shares:{count:4},reactions:{summary:{total_count:66}},comments:{summary:{total_count:5}}}]});
    if(url.includes('post_media_view'))return json({data:[{name:'post_media_view',period:'lifetime',values:[{value:2300}]}]});
    return json({},404);
  }) as unknown as typeof fetch;
  const [post]=await fetchFacebook(meta,range,fetcher);
  assert.deepEqual([post.views,post.likes,post.comments,post.shares,post.accountName,post.kind],[2300,66,5,4,'Brand Page','Post']);
  assert.equal(seen[0].auth,'Bearer secret-token');assert.ok(seen.slice(1).every(c=>c.auth==='Bearer page-token'));
  assert.match(seen.find(c=>c.url.includes('published_posts'))!.url,/since=\d+&until=\d+/);
  const refused=(async()=>json({error:{}},401)) as unknown as typeof fetch;
  await assert.rejects(()=>fetchFacebook(meta,range,refused),(e:unknown)=>e instanceof SocialApiError&&e.status===401&&!/secret-token/.test(e.message));
  const evil=(async(url:string)=>url.includes('published_posts')?json({data:[],paging:{next:'https://evil.example.com/x'}}):json({name:'P'})) as unknown as typeof fetch;
  await assert.rejects(()=>fetchFacebook(meta,range,evil),(e:unknown)=>e instanceof SocialApiError&&e.status===502);
});
test('YouTube reads the uploads playlist, batches video statistics and sends the key as a header',async()=>{
  const calls:{url:string;key:string|null}[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{
    calls.push({url,key:new Headers(init?.headers).get('x-goog-api-key')});
    if(url.includes('/channels?'))return json({items:[{snippet:{title:'Brand TV'},contentDetails:{relatedPlaylists:{uploads:'UUuploads'}}}]});
    if(url.includes('/playlistItems?'))return json({items:[{contentDetails:{videoId:'v1',videoPublishedAt:'2026-10-09T05:00:00Z'}},{contentDetails:{videoId:'v2',videoPublishedAt:'2026-10-02T05:00:00Z'}},{contentDetails:{videoId:'vold',videoPublishedAt:'2026-07-02T05:00:00Z'}}],nextPageToken:'more'});
    if(url.includes('/videos?'))return json({items:[{id:'v1',snippet:{title:'Big video',publishedAt:'2026-10-09T05:00:00Z',thumbnails:{medium:{url:'https://yt/1.jpg'}}},statistics:{viewCount:'12000',likeCount:'800',commentCount:'45'}},{id:'v2',snippet:{title:'Likes hidden',publishedAt:'2026-10-02T05:00:00Z'},statistics:{viewCount:'300'}}]});
    return json({},404);
  }) as unknown as typeof fetch;
  const posts=await fetchYouTube({apiKey:'yt-key',channelIds:['UCabcdefghijklmnopqrstuv']},range,fetcher);
  assert.deepEqual(posts.map(p=>[p.id,p.views,p.likes,p.comments]),[['v1',12000,800,45],['v2',300,null,null]]);
  assert.equal(posts[0].url,'https://www.youtube.com/watch?v=v1');assert.equal(posts[0].accountName,'Brand TV');
  assert.ok(calls.every(c=>c.key==='yt-key'&&!c.url.includes('yt-key')));
  assert.ok(calls.find(c=>c.url.includes('/videos?'))!.url.includes('id=v1%2Cv2'));
  assert.equal(calls.filter(c=>c.url.includes('/playlistItems?')).length,1,'stops paging once videos older than the range are reached');
  const quota=(async()=>json({error:{errors:[{reason:'quotaExceeded'}]}},403)) as unknown as typeof fetch;
  await assert.rejects(()=>fetchYouTube({apiKey:'yt-key',channelIds:['UCabcdefghijklmnopqrstuv']},range,quota),(e:unknown)=>e instanceof SocialApiError&&e.status===403&&/quota/.test(e.message));
});
test('totals ignore missing numbers, engagement uses views and per-day and per-platform summaries add up',()=>{
  const post=(patch:Partial<SocialPost>):SocialPost=>({platform:'instagram',account:'a',accountName:'a',id:'1',title:'t',url:'',thumbnail:null,kind:'Post',publishedAt:'2026-10-05T10:00:00+0530',views:null,likes:null,comments:null,shares:null,saves:null,...patch});
  const posts=[post({views:1000,likes:80,comments:10,shares:5,saves:5}),post({id:'2',platform:'youtube',views:500,likes:20,comments:5}),post({id:'3',platform:'facebook',views:null,likes:7,publishedAt:'2026-10-06T10:00:00+0530'})];
  assert.equal(engagement(posts[0]),10);assert.equal(engagement(posts[2]),null);
  const t=socialTotals(posts);assert.deepEqual([t.posts,t.views,t.likes,t.comments,t.interactions],[3,1500,107,15,132]);assert.equal(Math.round(t.engagementRate!*100)/100,8.33);
  const days=viewsByDay(posts,['2026-10-05','2026-10-06','2026-10-07']);assert.deepEqual(days.map(d=>d.views),[1500,0,0]);
  assert.deepEqual(byPlatform(posts).map(p=>[p.platform,p.posts,p.views]),[['instagram',1,1000],['facebook',1,0],['youtube',1,500]]);
  assert.equal(socialTotals([]).engagementRate,null);
});
