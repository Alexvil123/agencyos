// Persistent local workers are unsuitable for a frozen serverless instance.
// Managed production uses its scheduler/webhook rather than development files.
export async function register(){if(process.env.NODE_ENV==='development'&&process.env.NEXT_RUNTIME==='nodejs'){const {startJiraReconciliationWorker}=await import('./lib/jira-reconciliation-server');startJiraReconciliationWorker();}}
