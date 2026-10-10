import {jiraAutoFetch} from '../src/lib/jira-sync-settings-server';
import {reconcileConnectedJira} from '../src/lib/jira-reconciliation-server';
async function main(){const org='6b6f9be3-6d3f-42a5-9901-32f736c95e2b';
const setting=await jiraAutoFetch(org);
if(!setting.ready||setting.enabled)throw new Error('Set Automatic Fetch Off before running this read-only check.');
const result=await reconcileConnectedJira(org);
if(!result.ok||!('skipped' in result)||!result.skipped)throw new Error('Background import did not skip.');
console.log(JSON.stringify({settingReady:setting.ready,automaticFetch:setting.enabled,backgroundImportSkipped:result.skipped}));
}
void main().catch(()=>{console.error('Automatic fetch read-only verification failed.');process.exitCode=1;});
