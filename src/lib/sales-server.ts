import 'server-only';
import {retryRead,transientReadError} from './read-retry';
import {JWT} from 'google-auth-library';
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {SALES_SPREADSHEET_ID,salesColumn,type SalesGrid} from './sales-sheet';
import {parseNativeSales,type NativeWorkbook,type NativeSheet,type NativeSales} from './sales-native';
import {recordSyncHealth} from './sync-health-server';
import {salesTeamMembers} from './sales-team-server';
const file=join(process.cwd(),'.sales-google.local.json');
const schema=z.object({organizationId:z.uuid(),email:z.email().refine(v=>v.endsWith('.iam.gserviceaccount.com')),key:z.string().max(10000).refine(v=>v.includes('PRIVATE KEY')),members:z.array(z.uuid()).max(500)});
export type SalesConfig=z.infer<typeof schema>;
const authClients=new Map<string,JWT>();
const snapshots=new Map<string,{expires:number;pending?:boolean;promise:Promise<NativeSales>}>();
const metadataCache=new Map<string,{expires:number;pending?:boolean;promise:Promise<{sheets:NativeSheet[]}>}>();
function configKey(config:SalesConfig){return version([config.organizationId,config.email,config.key]);}
export async function salesConfig(org:string):Promise<SalesConfig|null>{
 if(process.env.GOOGLE_SHEETS_ORGANIZATION_ID===org&&process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON){const members=await salesTeamMembers(org);try{const key=JSON.parse(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON);return schema.parse({organizationId:org,email:key.client_email,key:key.private_key,members});}catch{throw new Error('Google Sheets server configuration is invalid.');}}
 if(process.env.NODE_ENV==='production')return null;
 try{const config=schema.parse(JSON.parse(await readFile(file,'utf8')));return config.organizationId===org?{...config,members:await salesTeamMembers(org)}:null;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw new Error('Sales configuration could not be verified.');}
}
export async function saveSalesConfig(config:SalesConfig){if(process.env.NODE_ENV==='production')throw new Error('Use managed hosting environment settings for Google credentials and sales membership IDs.');const temp=`${file}.${randomUUID()}`;try{await writeFile(temp,JSON.stringify(schema.parse(config)),{mode:0o600,flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}}
export function serviceAccount(value:unknown,organizationId:string):SalesConfig{const x=z.object({type:z.literal('service_account'),client_email:z.string(),private_key:z.string()}).parse(value);return schema.parse({organizationId,email:x.client_email,key:x.private_key,members:[]});}
export async function sheetsRequest<T>(config:SalesConfig,path:string,body?:unknown):Promise<T>{
 const key=configKey(config);let auth=authClients.get(key);if(!auth){auth=new JWT({email:config.email,key:config.key,scopes:['https://www.googleapis.com/auth/spreadsheets']});authClients.clear();authClients.set(key,auth);}
 try{const request=()=>auth!.request<T>({url:`https://sheets.googleapis.com/v4/spreadsheets/${SALES_SPREADSHEET_ID}${path}`,method:body?(path===':batchUpdate'?'POST':'PUT'):'GET',data:body,timeout:20000,retry:false});const result=await (body?request():retryRead(request,transientReadError));return result.data;}catch(error){const status=(error as {response?:{status?:number}}).response?.status;throw new Error(status===403?'Google denied access. Enable Sheets API and share this spreadsheet with the service account as Editor.':status===401?'Google rejected the service account. Check its key.':'Google Sheets could not confirm this operation. Refresh before retrying.');}
}
const version=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function sheetMetadata(config:SalesConfig){const key=configKey(config),existing=metadataCache.get(key);if(existing&&(existing.pending||existing.expires>Date.now()))return existing.promise;const entry={pending:true,expires:Date.now()+15000,promise:sheetsRequest<{sheets:NativeSheet[]}>(config,'?fields=sheets(properties)')};metadataCache.set(key,entry);try{const result=await entry.promise;entry.pending=false;entry.expires=Date.now()+15000;return result;}catch(e){if(metadataCache.get(key)===entry)metadataCache.delete(key);throw e;}}
export async function liveSalesTabs(config:SalesConfig){const meta=await sheetMetadata(config);return meta.sheets.map(s=>s.properties.title);}
export async function readNativeSales(config:SalesConfig,tab:string,fresh=false):Promise<NativeSales>{
 const key=`${configKey(config)}:${tab}`,existing=snapshots.get(key);if(!fresh&&existing&&(existing.pending||existing.expires>Date.now()))return existing.promise;
 const promise=fetchNativeSales(config,tab),entry={pending:true,expires:Date.now()+15000,promise};snapshots.set(key,entry);
 try{const value=await promise;entry.pending=false;entry.expires=Date.now()+15000;await recordSyncHealth(config.organizationId,'organization','google_read',true);return value;}catch(e){await recordSyncHealth(config.organizationId,'organization','google_read',false);if(snapshots.get(key)===entry)snapshots.delete(key);throw e;}
}
export async function readSalesGrid(config:SalesConfig,tab:string,fresh=false):Promise<SalesGrid>{return (await readNativeSales(config,tab,fresh)).grid;}
export function invalidateSales(config:SalesConfig){metadataCache.delete(configKey(config));const prefix=configKey(config)+':';for(const key of snapshots.keys())if(key.startsWith(prefix))snapshots.delete(key);}
async function fetchNativeSales(config:SalesConfig,tab:string):Promise<NativeSales>{
 if(tab.length>150)throw new Error('Invalid sheet tab.');
 const metadata=await sheetMetadata(config);const properties=metadata.sheets.find(s=>s.properties.title===tab)?.properties;
 if(!properties)throw new Error('The selected Google sheet tab is missing.');const bounds=properties.gridProperties;
 if(bounds.rowCount>10000||bounds.columnCount>256||bounds.rowCount*bounds.columnCount>1000000)throw new Error('Sheet exceeds configured integration bounds.');
 const range=`'${tab.replaceAll("'","''")}'!A1:${salesColumn(bounds.columnCount-1)}${bounds.rowCount}`;
 const fields='properties(title),sheets(properties,merges,protectedRanges(range,warningOnly),data(rowData(values(formattedValue,userEnteredValue,effectiveValue,dataValidation,chipRuns,textFormatRuns,userEnteredFormat,effectiveFormat(numberFormat,backgroundColor,textFormat)))))';
 const body=await sheetsRequest<NativeWorkbook>(config,`?ranges=${encodeURIComponent(range)}&includeGridData=true&fields=${encodeURIComponent(fields)}`);
 return parseNativeSales(body,tab);
}
