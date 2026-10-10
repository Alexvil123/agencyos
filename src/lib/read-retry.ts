/** Only use for read operations. Writes must never be retried after an uncertain outcome. */
export async function retryRead<T>(read:()=>Promise<T>,retryable:(error:unknown)=>boolean){
 for(let attempt=0;;attempt++){try{return await read();}catch(error){if(attempt>=1||!retryable(error))throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
}
export function transientReadError(error:unknown){const e=error as {response?:{status?:number};code?:string};const status=e?.response?.status;return status===429||(status!==undefined&&status>=500)||['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENOTFOUND'].includes(e?.code||'');}
