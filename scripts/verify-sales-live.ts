import {readFile} from 'node:fs/promises';
import {JWT} from 'google-auth-library';
import {parseNativeSales,type NativeWorkbook,type NativeSheet} from '../src/lib/sales-native';
import {SALES_SPREADSHEET_ID,salesColumn} from '../src/lib/sales-sheet';
async function main(){
 const config=JSON.parse(await readFile('.sales-google.local.json','utf8'));
 const auth=new JWT({email:config.email,key:config.key,scopes:['https://www.googleapis.com/auth/spreadsheets']}),url=`https://sheets.googleapis.com/v4/spreadsheets/${SALES_SPREADSHEET_ID}`;
 const {data:metadata}=await auth.request<{sheets:NativeSheet[]}>({url,params:{fields:'sheets(properties)'},timeout:20000,retry:false});
 for(const sheet of metadata.sheets){const tab=sheet.properties.title,bounds=sheet.properties.gridProperties;
 const fields='properties(title),sheets(properties,merges,protectedRanges(range,warningOnly),data(rowData(values(formattedValue,userEnteredValue,effectiveValue,dataValidation,chipRuns,textFormatRuns,userEnteredFormat,effectiveFormat(numberFormat,backgroundColor,textFormat)))))';
 const {data}=await auth.request<NativeWorkbook>({url,params:{ranges:`'${tab.replaceAll("'","''")}'!A1:${salesColumn(bounds.columnCount-1)}${bounds.rowCount}`,includeGridData:true,fields},timeout:20000,retry:false});
 const {grid}=parseNativeSales(data,tab);console.log(JSON.stringify({tab,rows:grid.rows.length,columns:grid.headers.length,editableRows:grid.rows.filter(r=>r.editable).length,deletableRows:grid.rows.filter(r=>r.editable&&r.deletable).length,formulas:grid.rows.flatMap(r=>r.cells).filter(c=>c.formula).length}));}
 console.log('Read-only verification completed. No spreadsheet writes.');
}
main().catch(()=>{console.error('Live read verification failed. No spreadsheet writes.');process.exitCode=1;});
