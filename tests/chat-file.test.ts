import test from 'node:test';
import assert from 'node:assert/strict';
import {chatFileName,inspectChatFile,formatChatFileSize,chatFileIcon,MAX_CHAT_FILE_BYTES} from '../src/lib/chat-file';
const bytes=(...values:number[])=>new Uint8Array([...values,...new Array(32).fill(0x20)]);
const text=(value:string)=>new TextEncoder().encode(value);
test('the type comes from the bytes: pictures keep the ending that matches what they really are',()=>{
  const png=bytes(137,80,78,71,13,10,26,10),jpg=bytes(0xff,0xd8,0xff,0xe0);
  assert.deepEqual(inspectChatFile('photo.png',png),{ok:true,name:'photo.png',extension:'png',contentType:'image/png',image:true});
  assert.deepEqual(inspectChatFile('Team.JPG',png),{ok:true,name:'Team.png',extension:'png',contentType:'image/png',image:true},'a PNG named .JPG is shown as a PNG');
  assert.equal((inspectChatFile('a.jpeg',jpg) as {name:string}).name,'a.jpeg');
  assert.equal((inspectChatFile('noending',jpg) as {name:string}).name,'noending.jpg');
  const webp=new Uint8Array([...text('RIFF'),1,2,3,4,...text('WEBP'),0,0]);
  assert.equal((inspectChatFile('x.webp',webp) as {contentType:string}).contentType,'image/webp');
  assert.equal((inspectChatFile('x.gif',text('GIF89a....')) as {contentType:string}).contentType,'image/gif');
});
test('documents: PDF, Office (new and old), text and CSV are allowed only with a matching ending',()=>{
  assert.equal(inspectChatFile('plan.pdf',text('%PDF-1.7 ...')).ok,true);
  assert.equal(inspectChatFile('plan.png',text('%PDF-1.7 ...')).ok,false,'a PDF with a picture ending is refused');
  const zip=bytes(0x50,0x4b,0x03,0x04);
  assert.equal((inspectChatFile('sheet.xlsx',zip) as {contentType:string}).contentType,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(inspectChatFile('archive.zip',zip).ok,false,'archives are not allowed');
  assert.equal(inspectChatFile('report.doc',bytes(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1)).ok,true);
  assert.equal(inspectChatFile('notes.txt',text('வணக்கம் team ✅')).ok,true,'Tamil and emoji text are fine');
  assert.equal(inspectChatFile('data.csv',text('a,b\n1,2')).ok,true);
  assert.equal(inspectChatFile('data.csv',new Uint8Array([97,0,98])).ok,false,'binary data is not text');
  assert.equal(inspectChatFile('bad.txt',new Uint8Array([0xff,0xfe,0x41])).ok,false,'invalid UTF-8 is refused');
});
test('dangerous or unknown files are refused, whatever they are called',()=>{
  for(const [name,data] of [['virus.exe',text('MZ....')],['page.html',text('<script>alert(1)</script>')],['logo.svg',text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],['run.js',text('alert(1)')],['photo.jpg',text('<html>not a picture</html>')]] as [string,Uint8Array][])assert.equal(inspectChatFile(name,data).ok,false,name);
  assert.equal(inspectChatFile('empty.txt',new Uint8Array()).ok,false);
});
test('size limit is 5 MB and names are cleaned',()=>{
  assert.equal(MAX_CHAT_FILE_BYTES,5242880);
  const big=new Uint8Array(MAX_CHAT_FILE_BYTES+1);big.set([137,80,78,71,13,10,26,10]);
  assert.deepEqual(inspectChatFile('big.png',big),{ok:false,message:'Files must be 5 MB or smaller.'});
  assert.equal(chatFileName('C:\\fakepath\\..\\my<>report?.pdf'),'myreport.pdf');
  assert.equal(chatFileName('../../etc/passwd'),'passwd');
  assert.equal(chatFileName('   '),'file');assert.equal(chatFileName('.hidden'),'hidden');
  const long=chatFileName('a'.repeat(300)+'.pdf');assert.equal(long.length,100);assert.ok(long.endsWith('.pdf'));
  assert.equal(formatChatFileSize(500),'500 B');assert.equal(formatChatFileSize(2048),'2 KB');assert.equal(formatChatFileSize(1572864),'1.5 MB');
  assert.deepEqual(['image/png','application/pdf','text/csv','application/vnd.ms-powerpoint','application/msword','text/plain'].map(chatFileIcon),['image','pdf','sheet','slides','doc','text']);
});
