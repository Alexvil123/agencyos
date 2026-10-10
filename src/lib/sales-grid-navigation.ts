export type SalesDirection='up'|'down'|'left'|'right';
export function salesNeighbor(row:number,column:number,rowCount:number,columns:number[],direction:SalesDirection){
 const position=columns.indexOf(column);if(position<0||row<0||row>=rowCount)return null;
 const nextRow=row+(direction==='down'?1:direction==='up'?-1:0),nextColumn=position+(direction==='right'?1:direction==='left'?-1:0);
 if(nextRow<0||nextRow>=rowCount||nextColumn<0||nextColumn>=columns.length)return null;
 return {row:nextRow,column:columns[nextColumn]};
}
export function salesWindow(count:number,scrollTop:number,height:number,rowHeight=36){
 const start=Math.max(0,Math.min(Math.floor(Math.max(0,scrollTop)/rowHeight)-8,Math.max(0,count-1))),end=Math.min(count,start+Math.ceil(height/rowHeight)+17);
 return {start,end,before:start*rowHeight,after:(count-end)*rowHeight};
}
