'use client';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { Activity, ArrowDownLeft, CalendarDays, ArrowRight, ArrowUpRight, Bell, Building2, ChevronDown, CircleHelp, Clock3, Command, FileBarChart2, Globe, Library, Layers3, LayoutDashboard, LockKeyhole, Menu, MessageSquare, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Target, Users, Wallet, X, Zap } from 'lucide-react';
import type { WorkspaceContext } from '@/lib/access';
import type { WorkspaceData } from '@/lib/data';
import { modules, moduleFor, moduleVisible } from '@/lib/modules';
import { createDepartment, saveCompany } from '@/app/actions';
import { inviteMember, changeMember } from '@/app/user-actions';
import { TeamPanel } from './team-panel';
import { EmployeeForm } from './employee-form';
import { PasswordChangeForm } from './record-editor';
import { ThemeToggle } from './theme-toggle';
import {JiraClients} from './jira-clients';
import {SalesConversionPanel} from './sales-conversion-panel';
import { JiraConnection } from './jira-connection';
import {WorkPanel} from './work-panel';
import {WorkSettings} from './work-settings';
import {TimePanel} from './time-panel';
import {CalendarPanel} from './calendar-panel';
import {AnalyticsPanel} from './analytics-panel';
import {CampaignsPanel} from './campaigns-panel';
import {FinancePanel} from './finance-panel';
import {OverviewTime} from './overview-time';
import {EmployeeSelfService} from './employee-self-service';
import {SalesPanel} from './sales-panel';
import {useWorkspaceInsights,SyncHealthCentre} from './workspace-insights';

import {useAnnouncements,Announcements} from './announcements';
import {TeamChat} from './team-chat';
import {useChatNotifications,ChatToasts} from './chat-notifications';
import {ClientErrorReporter} from './client-error-reporter';

const icons = { calendar: CalendarDays, dashboard: LayoutDashboard, sales: Target, clients: Building2, work: Layers3, source: Library, attendance: Clock3, chat: MessageSquare, campaigns: Globe, analytics: Activity, finance: Wallet, team: Users, reports: FileBarChart2, settings: Settings2 };
type Modal = 'search' | 'create' | 'employee' | 'department' | 'invite' | 'notifications' | 'help' | null;
export function Workspace({ context: ctx, data, moduleKey }: { context: WorkspaceContext; data: WorkspaceData; moduleKey: string }) {
  const announcements=useAnnouncements(ctx.preview);
  const chatNotifications=useChatNotifications(!ctx.preview,`${ctx.organizationId}:${ctx.membershipId}`);
  const router=useRouter();
  const settingsQuery=useSearchParams().toString();
  const [modal, setModal] = useState<Modal>(null);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [settingsTab, setSettingsTab] = useState('company');
  const insights=useWorkspaceInsights(ctx.preview,moduleKey==='settings'&&settingsTab==='health');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const navigationKey = `agency-navigation:${ctx.organizationId || 'preview'}`;
  function rememberNavigation() {
    try { sessionStorage.setItem(navigationKey,String(navigation.current?.scrollTop || 0)); } catch { /* Storage may be unavailable in private browsing. */ }
  }
  useLayoutEffect(() => {
    try { if(navigation.current) navigation.current.scrollTop=Number(sessionStorage.getItem(navigationKey)) || 0; } catch { /* Keep navigation usable without storage. */ }
    window.scrollTo({top:0,left:0,behavior:'instant'});
  },[moduleKey,navigationKey]);
  const current = moduleFor(moduleKey)!;
  const manage = !ctx.preview && ctx.permissions.includes('directory.manage');
  const settingsManage = !ctx.preview && ctx.permissions.includes('settings.manage');
  const userManage = !ctx.preview && ctx.permissions.includes('users.manage');
  useEffect(()=>{if(moduleKey==='settings'){const params=new URLSearchParams(settingsQuery),tab=params.get('tab');if(params.has('jira_oauth'))startTransition(()=>setSettingsTab('integrations'));else if(tab&&['company','users','permissions','integrations','audit','health'].includes(tab))startTransition(()=>setSettingsTab(tab));}},[moduleKey,settingsQuery]);
  useEffect(() => {
    function key(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setQuery(''); setModal('search'); } }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => { if (modal) { dialog.current?.showModal(); if (modal === 'search') searchInput.current?.focus(); } else dialog.current?.close(); }, [modal]);
  function open(value: Modal) { setInviteEmail(''); setResult(null); setQuery(''); setModal(value); }
  function submit(action: (form: FormData) => Promise<{ ok: boolean; message: string }>, form: FormData) {
    startTransition(async () => { const outcome = await action(form); setResult(outcome); });
  }
  const filteredEmployees = data.employees.filter(e => `${e.display_name} ${e.email} ${e.job_title}`.toLowerCase().includes(query.toLowerCase()));
  const menuAccess = { owner: ctx.roles.includes('Owner'), permissions: ctx.permissions };
  const filteredModules = modules.filter(m => moduleVisible(m.key, menuAccess) && `${m.name} ${m.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="app-shell">
    <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
      <Link className="brand" href="/"><span className="brand-mark">a</span> agency<span className="brand-os">os</span><span className="brand-dot"/></Link>
      <div className="workspace-switch"><span className="workspace-icon"><Zap size={18}/></span><div><strong>{ctx.company}</strong><small>Agency workspace</small></div><ChevronDown size={14}/></div>
      <nav ref={navigation} aria-label="Main navigation" onScroll={rememberNavigation}>{['Workspace', 'Management', 'System'].map(group => <div className="nav-group" key={group}><div className="nav-label">{group}</div>{modules.filter(m => m.group === group && moduleVisible(m.key, menuAccess)).map(m => { const Icon = icons[m.icon]; return <Link key={m.key} href={`/${m.key}`} scroll={false} onClick={() => { rememberNavigation(); setMobile(false); setQuery(''); }} className={`nav-item ${moduleKey === m.key ? 'active' : ''}`} aria-current={moduleKey === m.key ? 'page' : undefined}><Icon size={18}/><span>{m.name}</span>{m.key==='chat'&&chatNotifications.unread>0&&<span className="chat-unread-badge" aria-label={`${chatNotifications.unread} unread chat messages`}>{chatNotifications.unread>99?'99+':chatNotifications.unread}</span>}{moduleKey === m.key && <span className="active-dot"/>}</Link>; })}</div>)}</nav>
      <div className="sidebar-bottom"><button className="help-link" onClick={() => open('help')}><CircleHelp size={18}/> Help & getting started <ArrowUpRight size={14}/></button><div className="profile"><span className="avatar purple">{initials(ctx.name)}</span><div><strong>{ctx.name}</strong><small>{ctx.roles.join(', ') || 'Member'}</small></div>{ctx.preview ? <Link href="/login" aria-label="Open sign in"><MoreHorizontal size={18}/></Link> : <form action="/auth/signout" method="post"><button className="icon-button" title="Sign out" aria-label="Sign out"><ArrowDownLeft size={18}/></button></form>}</div></div>
    </aside>
    {mobile && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-toggle" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={20}/></button><strong className="header-workspace-name">{current.name}</strong></div><div className="topbar-actions"><ThemeToggle/><button className="command-trigger" aria-label="Search workspace" onClick={() => open('search')}><Search size={16}/><span>Search workspace…</span><kbd>⌘ K</kbd></button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => open('notifications')}><Bell size={19}/>{!!announcements.unread&&<span className="notification-count">{announcements.unread}</span>}</button><span className="topbar-date">{new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date())}<small>India · Asia/Kolkata</small></span><button className="primary small" onClick={() => open('create')}><Plus size={16}/> Create</button></div></header>
      {ctx.preview && <div className="preview-banner"><span><span className="status-dot amber"/> Setup preview · Empty workspace · No real data connected</span><Link href="/settings">View setup <ArrowRight size={13}/></Link></div>}
      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow">{moduleKey ? current.group.toUpperCase() : 'YOUR AGENCY AT A GLANCE'}</div><h1>{moduleKey ? current.name : `Good morning${ctx.name === 'Alex' ? ', Alex' : `, ${ctx.name.split(' ')[0]}`}`}<span className="heading-dot">.</span></h1><p>{moduleKey ? current.description : 'Let’s build something great today.'}</p></div><div className="heading-actions">{moduleKey === 'team' && manage ? <button className="primary" onClick={() => open('employee')}><Plus size={16}/> Add employee</button> : <span className="workspace-state"><span className="status-dot green"/>{ctx.preview ? 'Ready for setup' : 'Workspace connected'}</span>}</div></div>
        {moduleKey === 'work' && <WorkPanel preview={ctx.preview}/>}
        {moduleKey === 'calendar' && <CalendarPanel preview={ctx.preview}/>}
        {moduleKey === 'sales' && <SalesPanel owner={ctx.roles.includes('Owner')} preview={ctx.preview} employees={data.employees}/>}
        {moduleKey === 'source' && <WorkPanel preview={ctx.preview} sourceRecords/>}
        {moduleKey === 'settings' && settingsTab === 'integrations' && <section className="panel settings-panel"><JiraConnection owner={ctx.roles.includes('Owner')} preview={ctx.preview}/><WorkSettings owner={!ctx.preview&&ctx.roles.includes('Owner')}/><SalesConversionPanel owner={ctx.roles.includes('Owner')} preview={ctx.preview}/></section>}
        {!moduleKey && <><OverviewTime preview={ctx.preview}/></>}
        {moduleKey === 'team' && <TeamPanel isOwner={!ctx.preview && ctx.roles.includes('Owner')} key={query} data={data} canManage={manage} preview={ctx.preview} initialQuery={query} onAddEmployee={() => open('employee')} onAddDepartment={() => open('department')}/>}
        {moduleKey === 'clients' && <><SalesConversionPanel owner={ctx.roles.includes('Owner')} preview={ctx.preview}/><JiraClients preview={ctx.preview}/></>}
        {moduleKey === 'settings' && <><div className="tabs">{['company', 'users', 'permissions', 'integrations', 'audit', ...(ctx.roles.includes('Owner')?['health']:[])].map(tab => <button key={tab} className={settingsTab === tab ? 'selected' : ''} onClick={() => {setSettingsTab(tab); setResult(null);}}>{tab === 'audit' ? 'Audit history' : tab === 'health' ? 'Sync health' : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div><section className="panel settings-panel">
          {settingsTab === 'company' && <><PanelTitle title="Company settings" subtitle="The identity of your agency workspace"/><form className="settings-form stack" action={f => submit(saveCompany, f)}><label>Agency display name<input name="display_name" defaultValue={ctx.company} minLength={2} maxLength={100} required disabled={!settingsManage}/></label><div className="settings-detail"><span>Organization structure</span><strong>One agency · One office</strong></div><div className="settings-detail"><span>Initial owner</span><strong>Alex</strong></div><div className="settings-detail"><span>Attendance timezone & daily target</span><strong>Mon–Sat · Asia/Kolkata · Actual clock-in · 9h 30m including breaks</strong></div><button className="primary" disabled={!settingsManage || pending}>{pending ? 'Saving…' : 'Save changes'}</button>{result && <p className={`form-message ${result.ok ? 'success' : 'error'}`} role="status">{result.message}</p>}</form></>}
          {settingsTab === 'users' && <><PanelTitle title="Workspace access" subtitle="Accounts and permissions are separate from employee records" right={userManage ? <button className="primary small" onClick={() => open('invite')}><Plus size={14}/> Invite user</button> : undefined}/>{data.members.length ? <div className="table-scroll"><table><thead><tr><th>Member</th><th>Roles</th><th>Status</th><th>Manage</th></tr></thead><tbody>{data.members.map(member => <tr key={member.id}><td><strong>{member.display_name}</strong><small className="block">{member.email}</small></td><td>{member.roles.join(', ') || 'No roles'}</td><td><span className="neutral-pill">{member.active ? 'Active' : 'Inactive'}</span></td><td>{ctx.roles.includes('Owner')&&<details><summary>Change password</summary><PasswordChangeForm membershipId={member.id} email={member.email}/></details>}{member.user_id !== ctx.userId && <MemberControl member={member} roles={data.roles} isOwner={ctx.roles.includes('Owner')} onResult={setResult}/>}</td></tr>)}</tbody></table></div> : <Empty icon={<LockKeyhole size={24}/>} title="Access starts with the owner" text={ctx.preview ? 'Alex’s owner account will use the confirmed email. Connect the workspace to activate account management.' : 'Only authorized account administrators can view and manage memberships.'}/>} {result && <p role="status" className={`form-message ${result.ok ? 'success' : 'error'}`}>{result.message}</p>}</>}
          {settingsTab === 'permissions' && <><PanelTitle title="Roles & permissions" subtitle="Assigned scope, explicit access, server-enforced controls"/><div className="permission-grid">{[{ name: 'Owner', text: 'Full agency access. Only Owner can grant or transfer ownership.' }, { name: 'System Administrator', text: 'Invitations, standard roles, normal-account activation, and configuration.' }, { name: 'Managers', text: 'Assigned departments, clients, and operational responsibilities.' }, { name: 'Employee / Client', text: 'Own or explicitly assigned information. No user administration.' }, { name: 'Finance access', text: 'Sensitive. Granted by Owner or explicitly appointed Finance Administrator.' }, { name: 'Private HR access', text: 'Sensitive. Granted by Owner or explicitly appointed HR Administrator.' }].map(r => <div className="permission-card" key={r.name}><ShieldCheck size={19}/><h3>{r.name}</h3><p>{r.text}</p></div>)}</div><div className="notice">Sensitive changes require explicit confirmation and an audit entry. Self-escalation is blocked in the database.</div></>}
          {settingsTab === 'integrations' && <><PanelTitle title="Connections" subtitle="Connect only what your agency needs"/>{[{ title: 'Supabase', text: ctx.preview ? 'Not connected · setup required' : 'Workspace database connected', icon: ShieldCheck }, { title: 'Google sign-in', text: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true' ? 'Enabled · provider configuration required' : 'Optional · not enabled', icon: Globe }, { title: 'Microsoft sign-in', text: process.env.NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED === 'true' ? 'Enabled · provider configuration required' : 'Not enabled', icon: Globe }].map(i => <div className="integration-row" key={i.title}><span className="activity-icon"><i.icon size={19}/></span><div><strong>{i.title}</strong><p>{i.text}</p></div><span className="neutral-pill">{i.title === 'Supabase' && !ctx.preview ? 'CONNECTED' : 'SETUP'}</span></div>)}</>}
          {settingsTab === 'audit' && <><PanelTitle title="Audit history" subtitle="Authorized changes, recorded at the source"/>{data.audits.length ? <div className="table-scroll"><table><thead><tr><th>Action</th><th>Entity</th><th>Time (UTC)</th></tr></thead><tbody>{data.audits.map(a => <tr key={a.id}><td>{a.action.replaceAll('_', ' ')}</td><td>{a.entity_type}</td><td>{new Date(a.created_at).toISOString().replace('T', ' ').slice(0, 19)}</td></tr>)}</tbody></table></div> : <Empty icon={<ShieldCheck size={25}/>} title="A clear record of every change" text="Authorized directory, settings, and account changes appear here. Audit logs cannot be edited through the application."/>}</>}
        </section></>}
        {moduleKey==='me'&&<EmployeeSelfService name={ctx.name} preview={ctx.preview}/>} 
        {moduleKey==='reports'&&<WorkPanel preview={ctx.preview} reports/>}
        {moduleKey==='settings'&&settingsTab==='health'&&ctx.roles.includes('Owner')&&<SyncHealthCentre data={insights.data} loading={insights.loading} onRefresh={()=>void insights.reload()}/>}
        {(moduleKey==='attendance'||moduleKey==='reports')&&<TimePanel reports={moduleKey==='reports'} preview={ctx.preview}/>}
        {moduleKey==='communication'&&<Announcements feed={announcements} owner={ctx.roles.includes('Owner')&&!ctx.preview}/>}
        {moduleKey==='chat'&&!ctx.preview&&<TeamChat unread={chatNotifications.items}/>}
        {moduleKey === 'analytics' && <AnalyticsPanel preview={ctx.preview}/>}
        {moduleKey === 'campaigns' && <CampaignsPanel preview={ctx.preview}/>}
        {moduleKey === 'finance' && <FinancePanel preview={ctx.preview} company={ctx.company}/>}
        <footer className="workspace-footer"><span><span className="mini-logo">a</span> agency os</span><span>Clarity for your team. Space for great work.</span><span>Agency workspace</span></footer>
      </main>
    </div>
    <ChatToasts feed={chatNotifications}/><ClientErrorReporter/>
    <dialog ref={dialog} onCancel={() => setModal(null)} onClick={e => { if (e.target === dialog.current) setModal(null); }} className={`modal ${modal === 'search' ? 'search-modal' : modal === 'employee' ? 'employee-modal' : ''}`}><div className="modal-head"><h2>{modal === 'search' ? 'Command center' : modal === 'create' ? 'Create something new' : modal === 'employee' ? 'Add employee' : modal === 'department' ? 'Create department' : modal === 'invite' ? 'Invite workspace member' : modal === 'notifications' ? 'Notifications' : 'Getting started'}</h2><button className="icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><X size={20}/></button></div>
      {modal === 'search' && <><label className="command-input"><Search size={20}/><input ref={searchInput} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search pages or visible employees" aria-label="Command search"/><kbd>ESC</kbd></label><div className="search-results"><span className="nav-label">WORKSPACES</span>{filteredModules.map(m => {const Icon = icons[m.icon]; return <Link href={`/${m.key}`} onClick={() => setModal(null)} key={m.key}><Icon size={17}/><div><strong>{m.name}</strong><small>{m.description}</small></div><ArrowRight size={15}/></Link>; })}{filteredEmployees.length > 0 && <span className="nav-label">VISIBLE EMPLOYEES</span>}{filteredEmployees.slice(0, 10).map(e => <Link href="/team" key={e.id} onClick={() => {setModal(null); setQuery(e.display_name);}}><Users size={17}/><div><strong>{e.display_name}</strong><small>{e.job_title}</small></div><ArrowRight size={15}/></Link>)}{!filteredModules.length && !filteredEmployees.length && <p className="subtle">No results in your permitted workspace.</p>}</div><div className="modal-foot"><Command size={13}/> Ctrl / ⌘ K to open · Future search will include connected modules</div></>}
      {modal === 'create' && <div className="create-grid">{[{ name: 'Employee', type: 'employee' as Modal, enabled: manage }, { name: 'Department', type: 'department' as Modal, enabled: manage }, { name: 'User invitation', type: 'invite' as Modal, enabled: userManage }, { name: 'Task', type: null as Modal, href: '/work', enabled: !ctx.preview }, { name: 'Lead (Sales sheet)', type: null as Modal, href: '/sales', enabled: !ctx.preview }, { name: 'Team chat', type: null as Modal, href: '/chat', enabled: !ctx.preview }].map((a: {name: string; type: Modal; href?: string; enabled: boolean}) => <button className="create-option" key={a.name} disabled={!a.enabled} onClick={() => { if (a.href) { setModal(null); router.push(a.href); } else open(a.type); }}><span><Plus size={17}/>{a.name}</span><small>{a.enabled ? (a.href ? 'Open →' : 'Create →') : 'Connect workspace first'}</small></button>)}</div>}
      {modal === 'employee' && <EmployeeForm canCreateLogin={!ctx.preview && ctx.roles.includes('Owner')} loginReady={ctx.employeeLoginReady} departments={data.departments} onClose={() => setModal(null)} canInvite={!ctx.preview && (ctx.roles.includes('Owner') || ctx.roles.includes('System Administrator'))} onInvite={email => { open('invite'); setInviteEmail(email); }}/ >}
      {(modal === 'department' || modal === 'invite') && <form className="stack modal-form" action={f => submit(modal === 'department' ? createDepartment : inviteMember, f)}>{modal === 'department' ? <label>Department name<input name="name" minLength={2} maxLength={80} required placeholder="Your department name"/></label> : <><label>Email address<input name="email" type="email" defaultValue={inviteEmail} required/></label><label>Account type<select name="kind"><option value="employee">Employee</option></select></label><div className="notice">Invitations grant no roles automatically. Assign approved roles after the account has been created.</div><label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>I confirm this person should receive a workspace invitation.</label></>}<button className="primary" disabled={pending || result?.ok}>{pending ? 'Saving…' : modal === 'invite' ? 'Send invitation' : 'Save record'}</button>{result && <p role="status" className={`form-message ${result.ok ? 'success' : 'error'}`}>{result.message}</p>}</form>}
      {modal === 'notifications' && (ctx.preview?<p>Sign in to view announcements.</p>:<Announcements feed={announcements}/>)}
      {modal === 'help' && <div className="help-body"><p>Start with company settings and your employee directory. Jira, Google Sheets and the ad platforms connect in Settings and the hosting environment; every menu then works from your real data.</p><div className="notice">Calendar, Work and Reports follow Jira. Finance, Campaigns and Settings are limited to the Owner and the roles that need them.</div><Link className="primary" href="/settings" onClick={() => setModal(null)}>Open workspace settings <ArrowRight size={15}/></Link></div>}
    </dialog>
  </div>;
}
function MemberControl({ member, roles, isOwner, onResult }: {member: WorkspaceData['members'][number]; roles: WorkspaceData['roles']; isOwner: boolean; onResult: (r: {ok: boolean; message: string}) => void}) {
  const [role, setRole] = useState(''); const [action, setAction] = useState('grant'); const [busy, start] = useTransition();
  return <form className="member-controls" action={f => start(async () => onResult(await changeMember(f)))}><input type="hidden" name="membership_id" value={member.id}/><select name="action" aria-label="Account action" value={action} onChange={e => setAction(e.target.value)}><option value="grant">Grant role</option><option value="revoke">Remove role</option><option value="activate">Activate</option><option value="deactivate">Deactivate</option>{isOwner && <option value="transfer">Transfer ownership</option>}</select>{['grant','revoke'].includes(action) && <select name="role_key" aria-label="Role" value={role} onChange={e => setRole(e.target.value)} required><option value="">Select role</option>{roles.map(r => <option value={r.key} key={r.key}>{r.name}</option>)}</select>}<label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>Confirm change</label><button className="secondary small" disabled={busy}>{busy ? 'Saving…' : 'Apply'}</button></form>;
}
function initials(name: string) { return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(); }
function PanelTitle({title, subtitle, right}: {title: string; subtitle: string; right?: React.ReactNode}) {return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{right}</div>;}
function Empty({icon, title, text, action}: {icon: React.ReactNode; title: string; text: string; action?: React.ReactNode}) {return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>;}



