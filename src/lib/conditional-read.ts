/** Read-only polling stays outside the Server Action mutation queue. */
export function conditionalReader<T>(url:string,request:typeof fetch=fetch,timeoutMs=30000){
 let etag:string|undefined,inflight:Promise<{changed:boolean;value?:T}>|undefined;
 function read(fresh=false):Promise<{changed:boolean;value?:T}>{
  // A post-mutation read must not reuse a request that began before the mutation.
  if(inflight)return fresh?inflight.then(()=>read(true),()=>read(true)):inflight;
  const pending=(async()=>{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),timeoutMs);
   try{
    const response=await request(url,{signal:controller.signal,cache:'no-store',credentials:'same-origin',headers:!fresh&&etag?{'If-None-Match':etag}:{}});
    if(response.status===304){if(!etag)throw Error('No verified prior response');return {changed:false};}
    if(!response.ok||response.redirected)throw Error('Workspace read unavailable');
    const value=await response.json() as T;etag=response.headers.get('etag')||undefined;
    return {changed:true,value};
   }catch(error){etag=undefined;throw error;}finally{clearTimeout(timeout);}
  })();
  inflight=pending;
  void pending.finally(()=>{if(inflight===pending)inflight=undefined;}).catch(()=>{});
  return pending;
 }
 return read;
}
