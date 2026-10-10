export const modules = [
  { key: '', name: 'Overview', group: 'Workspace', icon: 'dashboard', description: 'A clear view of your agency.' },
  { key: 'sales', name: 'Sales', group: 'Workspace', icon: 'sales', description: 'Business Development visits, leads, and follow-ups from Google Sheets.' },
  { key: 'clients', name: 'Clients', group: 'Workspace', icon: 'clients', description: 'Your client directory, connected to your agency.' },
  { key: 'work', name: 'Work', group: 'Workspace', icon: 'work', description: 'Jira tasks, your production workflow, and assigned work.' },
  { key: 'source', name: 'Source', group: 'Workspace', icon: 'source', description: 'Jira SOURCE records, separate from work tasks and timers.' },
  { key: 'me', name: 'My account & time', group: 'Workspace', icon: 'team', description: 'Your attendance, timesheets, corrections and account.' },
  { key: 'attendance', name: 'Attendance', group: 'Workspace', icon: 'attendance', description: 'Attendance, breaks, task timers, timesheets, and corrections.' },
  { key: 'communication', name: 'Announcements', group: 'Workspace', icon: 'chat', description: 'Company announcements for all team members.', pending: true },
  { key: 'chat', name: 'Team Chat', group: 'Workspace', icon: 'chat', description: 'Personal conversations and employee group chats.' },
  { key: 'campaigns', name: 'Campaigns', group: 'Management', icon: 'campaigns', description: 'Meta, Google, and other campaigns.', pending: true },
  { key: 'analytics', name: 'Analytics', group: 'Management', icon: 'analytics', description: 'Operational trends with transparent metric definitions.', pending: true },
  { key: 'finance', name: 'Finance', group: 'Management', icon: 'finance', description: 'Invoices, payments, and outstanding balances.', pending: true },
  { key: 'team', name: 'Team', group: 'Management', icon: 'team', description: 'Your people and departments.' },
  { key: 'reports', name: 'Reports', group: 'Management', icon: 'reports', description: 'Team attendance, task time, client time, overtime, and deadlines.' },
  { key: 'settings', name: 'Settings', group: 'System', icon: 'settings', description: 'Company, users, permissions, integrations, and audit history.' },
] as const;
export function moduleFor(key: string) { return modules.find(module => module.key === key); }
export const policyDecisions: Record<string, string[]> = {
  attendance: ['Working schedule and timezone', 'Break allowance and counted work', 'Late arrival, half day, and overtime', 'Leave and correction approval rules'],
  work: ['Task completion and client approval stages', 'Jira environment and synchronization direction', 'Jira status and client mappings'],
  communication: ['Channel membership and client participation', 'Message retention and editing permissions', 'Private-message oversight policy'],
  finance: ['Currency, taxes, and invoice numbering', 'Payment and revenue accounting rules', 'Financial approval workflow'],
  sales: ['Lead pipeline stages', 'Client handover and proposal approval'],
  clients: ['Client services and renewal workflow', 'Client portal sharing and approvals'],
  campaigns: ['Connected platform accounts', 'Campaign metric sources and reporting windows'],
  analytics: ['Metric definitions and denominators', 'Workload and cycle-time definitions'],
  reports: ['Report calculations and access scope', 'Export branding and retention'],
};
