import {readFile} from 'node:fs/promises';
import {reconcileConnectedJira} from '../src/lib/jira-reconciliation-server';
async function main(){const config=JSON.parse(await readFile('.sales-google.local.json','utf8'));const result=await reconcileConnectedJira(config.organizationId);if(!result.ok)throw new Error('Background reconciliation failed');console.log(JSON.stringify({ok:result.ok,issuesFetchedAndCached:result.count,checkedAt:result.checkedAt,jiraWrites:false,timerActions:false}));}
main().catch(()=>{console.error('Background sync could not be verified. No Jira or timer actions were sent.');process.exitCode=1;});
