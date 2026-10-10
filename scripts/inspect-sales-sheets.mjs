import {readFile} from 'node:fs/promises';
import {JWT} from 'google-auth-library';
const config=JSON.parse(await readFile('.sales-google.local.json','utf8'));
const auth=new JWT({email:config.email,key:config.key,scopes:['https://www.googleapis.com/auth/spreadsheets']});
const base='https://sheets.googleapis.com/v4/spreadsheets/1-4r9F5klbkqpgM4f8iy74UjSuipfwEkNICXAkGLNEI8';
try{
 const {data:meta}=await auth.request({url:base,params:{fields:'sheets(properties,merges,protectedRanges(range,warningOnly))'},timeout:20000,retry:false});
 for(const sheet of meta.sheets){const p=sheet.properties,h=Math.max(1,p.gridProperties.frozenRowCount||0);const {data}=await auth.request({url:base,params:{ranges:`'${p.title.replaceAll("'","''")}'!A1:Z${Math.max(h,3)}`,includeGridData:true,fields:'sheets(data(rowData(values(formattedValue,userEnteredValue,dataValidation,chipRuns))))'},timeout:20000,retry:false});const rows=data.sheets[0].data?.[0]?.rowData||[];
 console.log(JSON.stringify({tab:p.title,sheetId:p.sheetId,columns:p.gridProperties.columnCount,headerRows:h,headers:rows.slice(0,h).map(r=>(r.values||[]).map(c=>c.formattedValue||'')),merges:sheet.merges?.length||0,protectedRanges:sheet.protectedRanges?.length||0,formulasInSample:rows.flatMap(r=>r.values||[]).filter(c=>c.userEnteredValue?.formulaValue).length}));}
}catch{console.error('Sales inspection failed; no sheet values were changed.');process.exitCode=1;}
