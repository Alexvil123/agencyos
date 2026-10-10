/** Polling is automatic while the page is visible; failures back off. Never retry writes. */
export function refreshLoop({refresh,active,schedule,cancel,interval=30000}:{refresh:()=>Promise<boolean|void>;active:()=>boolean;schedule:(fn:()=>void,delay:number)=>unknown;cancel:(handle:unknown)=>void;interval?:number}){
 let stopped=false,running=false,failures=0,handle:unknown;
 const plan=()=>{if(!stopped)handle=schedule(()=>void tick(),Math.min(120000,interval*2**failures));};
 async function tick(){if(stopped||running)return;if(!active()){plan();return;}running=true;try{failures=await refresh()===false?Math.min(3,failures+1):0;}catch{failures=Math.min(3,failures+1);}finally{running=false;plan();}}
 plan();
 return {wake(){if(stopped||running)return;cancel(handle);void tick();},stop(){stopped=true;cancel(handle);}};
}
