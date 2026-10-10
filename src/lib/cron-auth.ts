import {createHash,timingSafeEqual} from 'node:crypto';
// null = scheduler not configured (no usable secret); otherwise whether the Authorization header matches.
export function validCronRequest(authorization:string|null,secret:string|undefined){
  if(!secret||secret.length<32)return null;
  const a=createHash('sha256').update(authorization||'').digest(),b=createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a,b);
}
