'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {oauthDb} from '@/lib/jira-oauth-server';
import {salesAccess,salesValue,salesTabAccess,SALES_TABS} from '@/lib/sales-sheet';
import {readSalesGrid,readNativeSales,liveSalesTabs,invalidateSales,salesConfig,saveSalesConfig,serviceAccount,sheetsRequest} from '@/lib/sales-server';
import {freshSalesRow,salesUpdateRequests,salesInsertRequests,salesDeleteRequest,assertSalesStructure} from '@/lib/sales-native';
import {salesSnapshot} from '@/lib/sales-snapshot';
import {salesTeamMembers} from '@/lib/sales-team-server';
import {recordSyncHealth} from '@/lib/sync-health-server';
function message(e:unknown){return e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Invalid Sales request.';}
async function access(ownerOnly=false){const ctx=await workspaceContext();if(ctx.preview||ctx.kind!=='employee')throw new Error('Sign in with an active employee account.');const config=await salesConfig(ctx.organizationId),imported=config?null:await salesSnapshot(ctx.organizationId);const snapshot=imported?{...imported,members:await salesTeamMembers(ctx.organizationId)}:null;if((ownerOnly&&!ctx.roles.includes('Owner'))||!salesAccess(ctx.roles.includes('Owner'),ctx.kind,ctx.membershipId,config?.members||snapshot?.members||[]))throw new Error('Owner must add you to the Sales team.');return {ctx,config,snapshot,tabAccess:(tab:string)=>salesTabAccess(ctx.roles.includes('Owner'),tab,ctx.kind,ctx.membershipId,config?.members||snapshot?.members||[])};}
async function audit(ctx:Awaited<ReturnType<typeof workspaceContext>>,action:string,newValue:unknown){const {error}=await oauthDb().from('audit_logs').insert({organization_id:ctx.organizationId,actor_id:ctx.userId,action,entity_type:'sales_sheet',new_value:newValue});if(error)throw new Error('Sales audit could not be recorded.');}
export async function salesConnection(){try{const {ctx,config,snapshot,tabAccess}=await access();const owner=ctx.roles.includes('Owner');return {ok:true,owner,available:Boolean(config||snapshot),configured:Boolean(config),tabs:(config?await liveSalesTabs(config):snapshot?.tabs||[...SALES_TABS]).filter(tabAccess),importedAt:snapshot?.fetchedAt||'',email:owner?config?.email||'':'',members:owner?config?.members||snapshot?.members||[]:[],message:''};}catch(e){return {ok:false,owner:false,available:false,configured:false,tabs:[] as string[],importedAt:'',email:'',members:[] as string[],message:message(e)};}}
export async function connectSales(form:FormData){try{const {ctx,config,snapshot}=await access(true);if(form.get('confirmed')!=='yes')throw new Error('Confirm the spreadsheet connection.');const file=form.get('credential');if(!(file instanceof File)||file.size<1||file.size>20000)throw new Error('Upload the Google service account JSON key.');let parsed:unknown;try{parsed=JSON.parse(await file.text());}catch{throw new Error('Upload a valid service account JSON file.');}const next=serviceAccount(parsed,ctx.organizationId);next.members=config?.members||snapshot?.members||[];await readSalesGrid(next,'Tracksheet');await readSalesGrid(next,'Leads');await audit(ctx,'sales_connection_requested',{spreadsheet:'Business Development',email:next.email});await saveSalesConfig(next,ctx.userId);await audit(ctx,'sales_connection_saved',{email:next.email});return {ok:true,message:'Google Sheets connected. All accessible tabs are ready.'};}catch(e){return {ok:false,message:message(e)};}}
export async function loadSales(tab:string){try{const {config,snapshot,tabAccess}=await access();if(!tabAccess(tab))throw new Error('This sheet tab is not available to your Sales account.');if(config){const [grid,tabs]=await Promise.all([readSalesGrid(config,tab),liveSalesTabs(config)]);return {ok:true,message:'',grid,tabs:tabs.filter(tabAccess)};}const grid=snapshot&&Object.hasOwn(snapshot.grids,tab)?snapshot.grids[tab]:null;if(!grid)throw new Error('This tab has not been imported or connected.');return {ok:true,message:'',grid,tabs:(snapshot?.tabs||[]).filter(tabAccess)};}catch(e){return {ok:false,message:message(e),grid:null,tabs:[] as string[]};}}
export async function mutateSalesRow(form:FormData){
 let writeScope:string|undefined;
 try{
  const {ctx,config,tabAccess}=await access();if(!config)throw new Error('Live Google connection required.');
  const input=z.object({tab:z.string().min(1).max(150),operation:z.enum(['edit','add','delete']),id:z.string().min(1).max(200),rowVersion:z.string().length(64),gridVersion:z.string().length(64),ticket:z.uuid(),confirmed:z.string().optional()}).parse(Object.fromEntries(form));
  if(!tabAccess(input.tab))throw new Error('This sheet tab is not available to your Sales account.');
  const {grid,native}=await readNativeSales(config,input.tab,true),row=freshSalesRow(grid,input.id,input.rowVersion);
  const values:Record<string,string>={};for(const [key,value] of form.entries())if(key.startsWith('cell.')){if(typeof value!=='string')throw new Error('Invalid cell value.');values[key.slice(5)]=value;}
  const supplied=z.record(z.string().regex(/^\d{1,3}$/),z.string().max(10000)).parse(values);if(Object.keys(supplied).length>256)throw new Error('Too many cell values.');
  let requests:unknown[],insertedNumber:number|undefined;
  if(input.operation==='delete'){
   if(input.confirmed!=='yes')throw new Error('Confirm deletion of this complete Google Sheets row.');
   assertSalesStructure(grid,input.gridVersion);requests=[salesDeleteRequest(grid,row)];
  }else if(input.operation==='add'){
   assertSalesStructure(grid,input.gridVersion);const plan=salesInsertRequests(grid,row.number,supplied);requests=plan.requests;insertedNumber=plan.number;
  }else{requests=salesUpdateRequests(grid,row,supplied);if(!requests.length)return {ok:true,message:'No values changed.',grid};}
  // Audit primary key reserves a single-use operation ticket across server instances.
  const {error}=await oauthDb().from('audit_logs').insert({id:input.ticket,organization_id:ctx.organizationId,actor_id:ctx.userId,action:'sales_'+input.operation+'_requested',entity_type:'sales_sheet',new_value:{tab:input.tab,row:row.number,ticket:input.ticket}});
  if(error)throw new Error('This operation was already attempted or could not be audited. Refresh and check the sheet before retrying.');
  if(input.operation==='delete'){
   // The complete row is saved durably before anything is deleted; if this fails the sheet is left untouched.
   const {error:backupError}=await oauthDb().from('audit_logs').insert({organization_id:ctx.organizationId,actor_id:ctx.userId,action:'sales_delete_backup',entity_type:'sales_sheet',new_value:{ticket:input.ticket,tab:input.tab,sheetId:grid.sheetId,row:row.number,deletedAt:new Date().toISOString(),native:native.data?.[0]?.rowData?.[row.number-1]??null}});
   if(backupError)throw new Error('The row could not be backed up, so nothing was deleted. Try again.');
  }
  writeScope=ctx.organizationId;
  await sheetsRequest(config,':batchUpdate',{requests});invalidateSales(config);
  const after=await readSalesGrid(config,input.tab,true);
  if(input.operation==='delete'){
   if(after.rowCount!==(grid.rowCount||0)-1)throw new Error('Deletion readback is uncertain. Check Google Sheets before attempting another deletion.');
  }else{
   const changed=input.operation==='add'?after.rows.find(r=>r.number===insertedNumber):after.rows.find(r=>r.id===row.id);
   if(!changed)throw new Error('Saved row could not be confirmed. Refresh and check Google Sheets.');
   for(const [key,value] of Object.entries(supplied)){const column=Number(key);if(column===grid.identityColumn&&input.operation==='add')continue;const expected=salesValue(row.cells[column],value),actual=changed.cells[column]?.raw;if(expected===''?[null,''].includes(actual as null|string):typeof expected==='number'&&typeof actual==='number'?Math.abs(expected-actual)<1e-8:actual===expected)continue;throw new Error('Save readback is uncertain. Refresh and check the sheet before retrying.');}
   if(input.operation==='add'&&after.rowCount!==(grid.rowCount||0)+1)throw new Error('Insertion readback is uncertain. Refresh before retrying.');
  }
  await audit(ctx,'sales_'+input.operation+'_confirmed',{tab:input.tab,row:input.operation==='add'?insertedNumber:row.number,ticket:input.ticket});
  await recordSyncHealth(ctx.organizationId,'organization','google_write',true);
  return {ok:true,message:input.operation==='delete'?'Row deleted from Google Sheets.':input.operation==='add'?'New row added and verified in Google Sheets.':'Changes saved and verified in Google Sheets.',grid:after};
 }catch(e){if(writeScope)await recordSyncHealth(writeScope,'organization','google_write',false);return {ok:false,message:message(e),grid:null};}
}
