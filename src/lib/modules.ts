export const modules = [
  { key: '', name: 'Overview', group: 'Workspace', icon: 'dashboard', description: 'A clear view of your agency.' },
  { key: 'sales', name: 'Sales', group: 'Workspace', icon: 'sales', description: 'Business Development visits, leads, and follow-ups from Google Sheets.' },
  { key: 'clients', name: 'Clients', group: 'Workspace', icon: 'clients', description: 'Your client directory, connected to your agency.' },
  { key: 'work', name: 'Work', group: 'Workspace', icon: 'work', description: 'Jira tasks, your production workflow, and assigned work.' },
  { key: 'calendar', name: 'Calendar', group: 'Workspace', icon: 'calendar', description: 'Tasks by due date. The Owner creates and assigns Jira tasks here.' },
  { key: 'source', name: 'Source', group: 'Workspace', icon: 'source', description: 'Jira SOURCE records, separate from work tasks and timers.' },
  { key: 'attendance', name: 'Attendance', group: 'Workspace', icon: 'attendance', description: 'Attendance, breaks, task timers, timesheets, and corrections.' },
  { key: 'communication', name: 'Announcements', group: 'Workspace', icon: 'chat', description: 'Company announcements for all team members.' },
  { key: 'chat', name: 'Team Chat', group: 'Workspace', icon: 'chat', description: 'Personal conversations and employee group chats.' },
  { key: 'campaigns', name: 'Campaigns', group: 'Management', icon: 'campaigns', description: 'Meta Ads and Google Ads spend and results. Owner only.' },
  { key: 'analytics', name: 'Analytics', group: 'Management', icon: 'analytics', description: 'Instagram, Facebook and YouTube post views, likes and engagement.' },
  { key: 'finance', name: 'Finance', group: 'Management', icon: 'finance', description: 'Invoices, payments, and outstanding balances. Owner and Finance roles.' },
  { key: 'team', name: 'Team', group: 'Management', icon: 'team', description: 'Your people and departments.' },
  { key: 'reports', name: 'Reports', group: 'Management', icon: 'reports', description: 'Team attendance, task time, client time, overtime, and deadlines.' },
  { key: 'settings', name: 'Settings', group: 'System', icon: 'settings', description: 'Company, users, permissions, integrations, and audit history.' },
] as const;
export function moduleFor(key: string) { return modules.find(module => module.key === key); }
// Menus that expose sensitive data are hidden from people who cannot use them. The server still enforces access.
export function moduleVisible(key: string, access: { owner: boolean; permissions: string[] }) {
  if (key === 'campaigns') return access.owner;
  if (key === 'finance') return access.owner || access.permissions.includes('finance.read');
  return true;
}
