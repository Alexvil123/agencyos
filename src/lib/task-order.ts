/** Keep surviving saved IDs; newly fetched tasks join the end without reshuffling. */
export function taskQueue(ids:string[],saved:readonly string[]):string[] {
 const allowed=new Set(ids),first=[...new Set(saved)].filter(id=>allowed.has(id)),seen=new Set(first);
 return [...first,...ids.filter(id=>!seen.has(id))];
}
export function orderedTasks<T extends {id:string}>(tasks:T[],queue:readonly string[]):T[] {
 const positions=new Map(queue.map((id,index)=>[id,index]));
 return [...tasks].sort((a,b)=>(positions.get(a.id)??Infinity)-(positions.get(b.id)??Infinity));
}
/** Move only the dragged task; filtered-out tasks keep their relative order. */
export function moveQueuedTask(queue:readonly string[],moving:string,before:string):string[] {
 if(moving===before||!queue.includes(moving)||!queue.includes(before))return [...queue];
 const next=queue.filter(id=>id!==moving),from=queue.indexOf(moving),to=queue.indexOf(before);
 next.splice(next.indexOf(before)+(from<to?1:0),0,moving);
 return next;
}
