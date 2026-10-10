import {createHash} from 'node:crypto';
/** Call only after the current request's authentication and RLS reads have completed. */
export function workReadResponse(result:{ok:boolean;data?:{serverNow:string}|null},previous:string|null){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
 if(!result.ok||!result.data)return Response.json(result,{status:503,headers});
 const {serverNow,...data}=result.data;void serverNow;
 const etag='"'+createHash('sha256').update(JSON.stringify({...result,data})).digest('hex')+'"';
 return previous===etag?new Response(null,{status:304,headers:{...headers,ETag:etag}}):Response.json(result,{headers:{...headers,ETag:etag}});
}
