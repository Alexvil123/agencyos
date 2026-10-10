import {z} from 'zod';
// Input rules for creating and changing Jira tasks from the Calendar. Only OCT and SEP hold work; SOURCE is a reference library.
export const CALENDAR_PROJECTS=['OCT','SEP'] as const;
const optionalDate=z.union([z.iso.date(),z.literal('')]).default('');
const optionalMember=z.union([z.uuid(),z.literal('')]).default('');
export const calendarCreateSchema=z.object({
  project:z.enum(CALENDAR_PROJECTS),
  issue_type:z.string().regex(/^\d+$/,'Choose an issue type.'),
  summary:z.string().trim().min(1,'Enter a task title.').max(255),
  description:z.string().max(20000).default(''),
  label:z.string().trim().max(255).refine(v=>!/\s/u.test(v),'A Jira label cannot contain spaces (use _ or -).').default(''),
  due_date:optionalDate,
  assignee:optionalMember,
  ticket:z.uuid(),
  confirmed:z.literal('yes',{error:'Confirm that this task should be created in Jira.'}),
});
export const calendarUpdateSchema=z.object({
  task:z.uuid(),
  expected:z.string().max(100).default(''),
  change_due:z.enum(['yes','no']).default('no'),
  due_date:optionalDate,
  change_assignee:z.enum(['yes','no']).default('no'),
  assignee:optionalMember,
}).refine(v=>v.change_due==='yes'||v.change_assignee==='yes',{message:'Choose what to change.'});
