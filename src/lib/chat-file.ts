// Files and pictures shared in Team Chat. The type is decided from the file's own bytes, never from what the browser says it is.
// Allowed: JPEG, PNG, GIF and WebP pictures, PDF, Word/Excel/PowerPoint (old and new), plain text and CSV. No SVG, HTML, scripts or archives.
// 5 MB: a server action carries the file in one request, and Netlify's functions accept about 6 MB per request.
export const MAX_CHAT_FILE_BYTES=5*1024*1024;
export const CHAT_FILE_ACCEPT='.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
type ChatFileInfo={ok:true;name:string;extension:string;contentType:string;image:boolean}|{ok:false;message:string};
const OFFICE:Record<string,string>={
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc:'application/msword',xls:'application/vnd.ms-excel',ppt:'application/vnd.ms-powerpoint',
};
const startsWith=(bytes:Uint8Array,signature:number[])=>bytes.length>=signature.length&&signature.every((value,i)=>bytes[i]===value);
const ascii=(bytes:Uint8Array,from:number,to:number)=>String.fromCharCode(...bytes.slice(from,to));
/** A readable file name: no folders, no control characters, at most 100 characters, the extension kept. */
export function chatFileName(raw:string){
  const base=raw.split(/[\\/]/).pop()||'';
  const clean=base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g,'').replace(/\s+/g,' ').trim().replace(/^\.+/,'');
  if(!clean)return 'file';
  if(clean.length<=100)return clean;
  const dot=clean.lastIndexOf('.'),extension=dot>0&&clean.length-dot<=8?clean.slice(dot):'';
  return clean.slice(0,100-extension.length)+extension;
}
export function inspectChatFile(rawName:string,bytes:Uint8Array):ChatFileInfo{
  const name=chatFileName(rawName),dot=name.lastIndexOf('.'),declared=dot>0?name.slice(dot+1).toLowerCase():'';
  if(!bytes.length)return {ok:false,message:'That file is empty.'};
  if(bytes.length>MAX_CHAT_FILE_BYTES)return {ok:false,message:'Files must be 5 MB or smaller.'};
  const image=(extension:string,contentType:string):ChatFileInfo=>({ok:true,name:rename(name,declared,extension),extension,contentType,image:true});
  if(startsWith(bytes,[0xff,0xd8,0xff]))return image('jpg','image/jpeg');
  if(startsWith(bytes,[137,80,78,71,13,10,26,10]))return image('png','image/png');
  if(ascii(bytes,0,4)==='GIF8')return image('gif','image/gif');
  if(ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,12)==='WEBP')return image('webp','image/webp');
  if(ascii(bytes,0,5)==='%PDF-'){return declared==='pdf'?{ok:true,name,extension:'pdf',contentType:'application/pdf',image:false}:{ok:false,message:'This PDF has the wrong file ending. Rename it to .pdf.'};}
  const office=(allowed:string[],message:string):ChatFileInfo=>allowed.includes(declared)?{ok:true,name,extension:declared,contentType:OFFICE[declared],image:false}:{ok:false,message};
  if(startsWith(bytes,[0x50,0x4b,0x03,0x04]))return office(['docx','xlsx','pptx'],'Only Word, Excel and PowerPoint files are allowed; archives are not.');
  if(startsWith(bytes,[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))return office(['doc','xls','ppt'],'This Office file has the wrong file ending.');
  if(declared==='txt'||declared==='csv'){
    const head=bytes.slice(0,8192);
    if(head.includes(0))return {ok:false,message:'That does not look like a text file.'};
    try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return {ok:false,message:'Text files must be UTF-8.'};}
    return {ok:true,name,extension:declared,contentType:declared==='csv'?'text/csv':'text/plain',image:false};
  }
  return {ok:false,message:'Send a picture, PDF, Word, Excel, PowerPoint, text or CSV file.'};
}
// A picture saved with the wrong ending (a PNG named .jpg) is shown with the ending that matches what it really is.
function rename(name:string,declared:string,real:string){
  if(!declared)return `${name}.${real}`;
  const same=declared===real||(declared==='jpeg'&&real==='jpg');
  return same?name:`${name.slice(0,name.length-declared.length)}${real}`;
}
export const formatChatFileSize=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1048576?`${Math.round(bytes/1024)} KB`:`${(bytes/1048576).toFixed(1)} MB`;
export const chatFileIcon=(contentType:string)=>contentType.startsWith('image/')?'image':contentType==='application/pdf'?'pdf':contentType.includes('sheet')||contentType.includes('excel')||contentType==='text/csv'?'sheet':contentType.includes('presentation')||contentType.includes('powerpoint')?'slides':contentType.includes('word')?'doc':'text';
