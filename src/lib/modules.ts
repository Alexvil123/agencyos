export const modules = [
  { key: '', name: 'Overview', group: 'Workspace', icon: 'dashboard', description: 'A clear view of your agency.' },
  { key: 'sales', name: 'Sales', group: 'Workspace', icon: 'sales', description: 'Business Development visits, leads, and follow-ups from Google Sheets.' },
  { key: 'clients', name: 'Clients', group: 'Workspace', icon: 'clients', description: 'Your client directory, connected to your agency.' },
  { key: 'work', name: 'Work', group: 'Workspace', icon: 'work', description: 'Jira tasks, your production workflow, and assigned work.' },
  { key: 'calendar', name: 'Calendar', group: 'Workspace', icon: 'calendar', description: 'Tasks by due date. The Owner creates and assigns Jira tasks here. Employees the Owner allows can view it.' },
  { key: 'source', name: 'Source', group: 'Workspace', icon: 'source', description: 'Jira SOURCE records, separate from work tasks and timers.' },
  { key: 'attendance', name: 'Attendance', group: 'Workspace', icon: 'attendance', description: 'Attendance, breaks, task timers, timesheets, and corrections.' },
  { key: 'communication', name: 'Announcements', group: 'Workspace', icon: 'chat', description: 'Company announcements. Owner only.' },
  { key: 'chat', name: 'Team Chat', group: 'Workspace', icon: 'chat', description: 'Personal conversations and employee group chats.' },
  { key: 'campaigns', name: 'Campaigns', group: 'Management', icon: 'campaigns', description: 'Meta Ads and Google Ads spend and results. Owner, and employees the Owner allows.' },
  { key: 'analytics', name: 'Analytics', group: 'Management', icon: 'analytics', description: 'Instagram, Facebook and YouTube post views, likes and engagement. Owner, and employees the Owner allows.' },
  { key: 'finance', name: 'Finance', group: 'Management', icon: 'finance', description: 'Invoices, payments, and outstanding balances. Owner, Finance roles and employees the Owner allows.' },
  { key: 'team', name: 'Team', group: 'Management', icon: 'team', description: 'Your people and departments.' },
  { key: 'reports', name: 'Reports', group: 'Management', icon: 'reports', description: 'Team attendance, task time, client time, overtime, and deadlines.' },
  { key: 'settings', name: 'Settings', group: 'System', icon: 'settings', description: 'Company, users, permissions, integrations, and audit history.' },
] as const;
export function moduleFor(key: string) { return modules.find(module => module.key === key); }
// Sales is for the Sales team the Owner picks. Calendar, Campaigns, Finance and Analytics are Owner-only unless the Owner grants an employee access in Settings (modules). Announcements are Owner-only.
// Menus are hidden from people who cannot use them; the server still enforces access.
export const GRANTABLE_MODULES = ['calendar', 'campaigns', 'finance', 'analytics'] as const;
// Settings has something to show only to the Owner and to people holding a settings, user-management or audit permission. The setup preview (no workspace connected yet) shows it so the setup steps can be reached.
const SETTINGS_PERMISSIONS = ['settings.read', 'settings.manage', 'users.manage', 'audit.read'];
// The sidebar shows a group heading only when at least one menu under it is visible to this person.
const MODULE_GROUPS = ['Workspace', 'Management', 'System'] as const;
export function visibleGroups(access: { owner: boolean; permissions: string[]; modules: string[]; preview?: boolean }) {
  return MODULE_GROUPS.filter(group => modules.some(m => m.group === group && moduleVisible(m.key, access)));
}
export function moduleVisible(key: string, access: { owner: boolean; permissions: string[]; modules: string[]; preview?: boolean }) {
  if (key === 'settings') return Boolean(access.preview) || access.owner || SETTINGS_PERMISSIONS.some(p => access.permissions.includes(p));
  if (key === 'communication') return access.owner;
  if (key === 'sales') return access.owner || access.modules.includes('sales');
  if (key === 'finance') return access.owner || access.permissions.includes('finance.read') || access.modules.includes('finance');
  if (key === 'calendar' || key === 'campaigns' || key === 'analytics') return access.owner || access.modules.includes(key);
  return true;
}
