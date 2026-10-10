import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchInstagram,fetchFacebook,fetchYouTube,insightValue,engagement,socialTotals,viewsByDay,byPlatform,byKind,postingTimes,isoTime,isoDurationSeconds,effectiveStatus,normalizeMetaId,normalizeChannelId,SocialApiError,type SocialPost,type MetaSocialConfig} from '../src/lib/social';
const range={from:'2026-10-01',to:'2026-10-10'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const meta:MetaSocialConfig={token:'secret-token',version:'v25.0',facebookPages:['1122334455'],instagramAccounts:['9988776655']};
test('account IDs are validated and timestamps are normalised for every browser',()=>{
  assert.equal(normalizeMetaId(' 1234567890 '),'1234567890');assert.throws(()=>normalizeMetaId('page-name'));
  assert.equal(normalizeChannelId('UCabcdefghijklmnopqrstuv'),'UCabcdefghijklmnopqrstuv');assert.throws(()=>normalizeChannelId('@handle'));
  assert.equal(insightValue({data:[{name:'views',values:[{value:'42'}]}]},'views'),42);assert.equal(insightValue({data:[{name:'x',total_value:{value:7}}]},'x'),7);assert.equal(insightValue(undefined,'views'),null);
  assert.equal(isoTime('2026-10-09T10:00:00+0000'),'2026-10-09T10:00:00.000Z');assert.equal(isoTime('2026-10-09T10:00:00+0530'),'2026-10-09T04:30:00.000Z');assert.equal(isoTime('garbage'),'');assert.equal(isoTime(undefined),'');
  assert.equal(isoDurationSeconds('PT1M30S'),90);assert.equal(isoDurationSeconds('PT1H2M3S'),3723);assert.equal(isoDurationSeconds('PT45S'),45);assert.equal(isoDurationSeconds('P0D'),0);assert.equal(isoDurationSeconds('nonsense'),null);
});
test('Meta body error codes decide the message, not the HTTP 400 they arrive with',()=>{
  assert.equal(effectiveStatus('instagram',400,190),401);assert.equal(effectiveStatus('facebook',400,10),403);assert.equal(effectiveStatus('facebook',400,200),403);assert.equal(effectiveStatus('instagram',400,4),429);assert.equal(effectiveStatus('instagram',400,100),400);assert.equal(effectiveStatus('youtube',400,190),400);
  assert.match(new SocialApiError('facebook',400,190).message,/rejected the saved credentials/);assert.match(new SocialApiError('instagram',400,17).message,/rate limit/);
});
test('Instagram posts in range get views and reach from insights, likes from the media, and account figures',async()=>{
  const calls:string[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{
    calls.push(url);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer secret-token');
    if(url.includes('/9988776655?fields=username'))return json({username:'brand_official',followers_count:15200,media_count:340});
    if(url.includes('/9988776655/media'))return json({data:[
      {id:'m1',caption:'Launch day\n\nbig news',media_type:'VIDEO',media_product_type:'REELS',permalink:'https://instagram.com/reel/1',timestamp:'2026-10-09T10:00:00+0000',like_count:120,comments_count:8,thumbnail_url:'https://img/1.jpg'},
      {id:'m2',caption:'Photo',media_type:'IMAGE',permalink:'https://instagram.com/p/2',timestamp:'2026-10-05T10:00:00+0000',like_count:30,comments_count:1,media_url:'https://img/2.jpg'},
      {id:'m4',caption:'Clip without thumbnail',media_type:'VIDEO',timestamp:'2026-10-04T10:00:00+0000',like_count:2,comments_count:0,media_url:'https://cdn/video.mp4'},
      {id:'old',caption:'Old',media_type:'IMAGE',timestamp:'2026-08-01T10:00:00+0000',like_count:1,comments_count:0}]});
    if(url.includes('/m1/insights'))return json({data:[{name:'views',values:[{value:5400}]},{name:'reach',values:[{value:4000}]},{name:'saved',values:[{value:20}]},{name:'shares',values:[{value:15}]}]});
    // Photos reject the combined call (one metric is unsupported), so each metric is asked alone and only the supported ones survive.
    if(url.includes('/m2/insights')&&url.includes('metric=views,reach,saved,shares'))return json({error:{message:'metric not supported',code:100}},400);
    if(url.includes('/m2/insights')&&/metric=(views|reach|saved)$/.test(url))return json({data:[{name:url.split('metric=')[1],values:[{value:url.endsWith('views')?900:url.endsWith('reach')?700:3}]}]});
    if(url.includes('/m2/insights'))return json({error:{code:100}},400);
    if(url.includes('/m4/insights'))return json({data:[]});
    return json({},404);
  }) as unknown as typeof fetch;
  const {posts,accounts}=await fetchInstagram(meta,range,fetcher);
  assert.deepEqual(posts.map(p=>[p.id,p.kind,p.views,p.reach,p.likes,p.comments,p.shares,p.saves]),[['m1','Reel',5400,4000,120,8,15,20],['m2','Photo',900,700,30,1,null,3],['m4','Video',null,null,2,0,null,null]]);
  assert.equal(posts[0].accountName,'@brand_official');assert.equal(posts[0].title,'Launch day big news');assert.equal(posts[0].thumbnail,'https://img/1.jpg');
  assert.equal(posts[0].publishedAt,'2026-10-09T10:00:00.000Z','Meta +0000 timestamps become ISO strings');
  assert.equal(posts[2].thumbnail,null,'a video file is never used as an image source');
  assert.deepEqual(accounts,[{platform:'instagram',account:'9988776655',name:'@brand_official',followers:15200,items:340,totalViews:null}]);
  assert.ok(calls.every(u=>!u.includes('secret-token')));assert.ok(!calls.some(u=>u.includes('/old/')));
  const down=(async(url:string)=>url.includes('/media')?json({data:[{id:'m3',timestamp:'2026-10-08T00:00:00+0000',like_count:1,comments_count:0}]}):url.includes('insights')?json({},500):json({username:'x'})) as unknown as typeof fetch;
  assert.equal((await fetchInstagram(meta,range,down)).posts[0].views,null);
});
test('Facebook uses the Page token, post_media_view, reaction totals and the follower count',async()=>{
  const seen:{url:string;auth:string|null}[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{
    seen.push({url,auth:new Headers(init?.headers).get('authorization')});
    if(url.includes('/1122334455?fields=name,access_token'))return json({name:'Brand Page',access_token:'page-token',followers_count:8800});
    if(url.includes('/published_posts'))return json({data:[{id:'1122334455_1',message:'New offer',created_time:'2026-10-08T09:00:00+0000',permalink_url:'https://facebook.com/1',full_picture:'https://img/f.jpg',shares:{count:4},reactions:{summary:{total_count:66}},comments:{summary:{total_count:5}}},{id:'1122334455_2',message:'Broken time',created_time:'not a date'}]});
    if(url.includes('post_media_view'))return json({data:[{name:'post_media_view',period:'lifetime',values:[{value:2300}]}]});
    return json({},404);
  }) as unknown as typeof fetch;
  const {posts,accounts}=await fetchFacebook(meta,range,fetcher);
  assert.equal(posts.length,1,'a post whose timestamp cannot be read is dropped instead of crashing the page');
  assert.deepEqual([posts[0].views,posts[0].likes,posts[0].comments,posts[0].shares,posts[0].accountName,posts[0].kind,posts[0].publishedAt],[2300,66,5,4,'Brand Page','Post','2026-10-08T09:00:00.000Z']);
  assert.equal(accounts[0].followers,8800);
  assert.equal(seen[0].auth,'Bearer secret-token');assert.ok(seen.slice(1).every(c=>c.auth==='Bearer page-token'));
  assert.match(seen.find(c=>c.url.includes('published_posts'))!.url,/since=\d+&until=\d+/);
  const expired=(async()=>json({error:{code:190,message:'Error validating access token secret-token'}},400)) as unknown as typeof fetch;
  await assert.rejects(()=>fetchFacebook(meta,range,expired),(e:unknown)=>e instanceof SocialApiError&&e.status===401&&/rejected the saved credentials/.test(e.message)&&!/secret-token/.test(e.message));
  const evil=(async(url:string)=>url.includes('published_posts')?json({data:[],paging:{next:'https://evil.example.com/x'}}):json({name:'P'})) as unknown as typeof fetch;
  await assert.rejects(()=>fetchFacebook(meta,range,evil),(e:unknown)=>e instanceof SocialApiError&&e.status===502);
});
test('YouTube reads the uploads playlist, splits Shorts, reads channel totals and sends the key as a header',async()=>{
  const calls:{url:string;key:string|null}[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{
    calls.push({url,key:new Headers(init?.headers).get('x-goog-api-key')});
    if(url.includes('/channels?'))return json({items:[{snippet:{title:'Brand TV'},contentDetails:{relatedPlaylists:{uploads:'UUuploads'}},statistics:{subscriberCount:'5400',viewCount:'1200000',videoCount:'88'}}]});
    if(url.includes('/playlistItems?'))return json({items:[{contentDetails:{videoId:'v1',videoPublishedAt:'2026-10-09T05:00:00Z'}},{contentDetails:{videoId:'v2',videoPublishedAt:'2026-10-02T05:00:00Z'}},{contentDetails:{videoId:'vold',videoPublishedAt:'2026-07-02T05:00:00Z'}}],nextPageToken:'more'});
    if(url.includes('/videos?'))return json({items:[{id:'v1',snippet:{title:'Big video',publishedAt:'2026-10-09T05:00:00Z',thumbnails:{medium:{url:'https://yt/1.jpg'}}},contentDetails:{duration:'PT12M5S'},statistics:{viewCount:'12000',likeCount:'800',commentCount:'45'}},{id:'v2',snippet:{title:'Likes hidden',publishedAt:'2026-10-02T05:00:00Z'},contentDetails:{duration:'PT42S'},statistics:{viewCount:'300'}}]});
    return json({},404);
  }) as unknown as typeof fetch;
  const {posts,accounts}=await fetchYouTube({apiKey:'yt-key',channelIds:['UCabcdefghijklmnopqrstuv']},range,fetcher);
  assert.deepEqual(posts.map(p=>[p.id,p.kind,p.views,p.likes,p.comments]),[['v1','Video',12000,800,45],['v2','Short (≤3 min)',300,null,null]]);
  assert.equal(posts[0].url,'https://www.youtube.com/watch?v=v1');assert.equal(posts[0].accountName,'Brand TV');
  assert.deepEqual(accounts,[{platform:'youtube',account:'UCabcdefghijklmnopqrstuv',name:'Brand TV',followers:5400,items:88,totalViews:1200000}]);
  assert.ok(calls.every(c=>c.key==='yt-key'&&!c.url.includes('yt-key')));
  assert.ok(calls.find(c=>c.url.includes('/videos?'))!.url.includes('id=v1%2Cv2'));
  assert.equal(calls.filter(c=>c.url.includes('/playlistItems?')).length,1,'stops paging once videos older than the range are reached');
  const quota=(async()=>json({error:{errors:[{reason:'quotaExceeded'}]}},403)) as unknown as typeof fetch;
  await assert.rejects(()=>fetchYouTube({apiKey:'yt-key',channelIds:['UCabcdefghijklmnopqrstuv']},range,quota),(e:unknown)=>e instanceof SocialApiError&&e.status===429&&/quota/.test(e.message));
  const badKey=(async()=>json({error:{errors:[{reason:'keyInvalid'}]}},400)) as unknown as typeof fetch;
  await assert.rejects(()=>fetchYouTube({apiKey:'yt-key',channelIds:['UCabcdefghijklmnopqrstuv']},range,badKey),(e:unknown)=>e instanceof SocialApiError&&e.status===401);
});
const post=(patch:Partial<SocialPost>):SocialPost=>({platform:'instagram',account:'a',accountName:'a',id:'1',title:'t',url:'',thumbnail:null,kind:'Post',publishedAt:'2026-10-05T10:00:00+05:30',views:null,reach:null,likes:null,comments:null,shares:null,saves:null,...patch});
test('totals ignore missing numbers, engagement uses views and per-day and per-platform summaries add up',()=>{
  const posts=[post({views:1000,likes:80,comments:10,shares:5,saves:5}),post({id:'2',platform:'youtube',views:500,likes:20,comments:5}),post({id:'3',platform:'facebook',views:null,likes:7,publishedAt:'2026-10-06T10:00:00+05:30'})];
  assert.equal(engagement(posts[0]),10);assert.equal(engagement(posts[2]),null);
  const t=socialTotals(posts);assert.deepEqual([t.posts,t.views,t.likes,t.comments,t.interactions],[3,1500,107,15,132]);assert.equal(Math.round(t.engagementRate!*100)/100,8.33);
  const days=viewsByDay(posts,['2026-10-05','2026-10-06','2026-10-07']);assert.deepEqual(days.map(d=>d.views),[1500,0,0]);
  assert.deepEqual(byPlatform(posts).map(p=>[p.platform,p.posts,p.views]),[['instagram',1,1000],['facebook',1,0],['youtube',1,500]]);
  assert.equal(socialTotals([]).engagementRate,null);
  assert.deepEqual(viewsByDay([post({publishedAt:''})],['2026-10-05']).map(d=>d.views),[0],'an unreadable time is skipped');
});
test('content types and posting times compare averages and use India time',()=>{
  const posts=[post({id:'a',kind:'Reel',views:1000,likes:100,publishedAt:'2026-10-05T10:00:00+05:30'}),post({id:'b',kind:'Reel',views:3000,likes:300,publishedAt:'2026-10-12T10:30:00+05:30'}),post({id:'c',kind:'Photo',views:200,likes:10,publishedAt:'2026-10-06T21:00:00+05:30'}),post({id:'d',kind:'Photo',views:null,likes:2,publishedAt:'2026-10-07T21:00:00+05:30'})];
  const kinds=byKind(posts);assert.deepEqual(kinds.map(k=>[k.kind,k.posts,k.avgViews,k.avgLikes]),[['Reel',2,2000,200],['Photo',2,200,6]]);
  const times=postingTimes(posts);assert.equal(times.sample,3);
  assert.deepEqual(times.weekdays.filter(d=>d.posts).map(d=>[d.label,d.posts,d.avgViews]),[['Mon',2,2000],['Tue',1,200]]);
  assert.deepEqual(times.slots.filter(s=>s.posts).map(s=>[s.label,s.posts,s.avgViews]),[['09–12h',2,2000],['21–24h',1,200]]);
  assert.equal(postingTimes([]).sample,0);
});
