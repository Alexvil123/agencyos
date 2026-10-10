import { z } from 'zod';
export const passwordSchema = z.string().min(6, 'Password must contain at least 6 characters.').refine(value => new TextEncoder().encode(value).length <= 72, 'Password is too long for authentication (maximum 72 UTF-8 bytes).');
export const employeeSchema = z.object({
  display_name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  job_title: z.string().trim().max(100),
  department_id: z.union([z.uuid(), z.literal('')]).transform(v => v || null),
  phone: z.string().trim().max(30).regex(/^[+\d ()-]*$/, 'Enter a valid phone number.').optional(),
  employee_code: z.string().trim().max(40).optional(),
  birthday: z.union([z.iso.date(), z.literal('')]).optional(),
});
export const employeeLoginSchema = employeeSchema.extend({
  password: passwordSchema,
  login_confirmed: z.literal('yes', { error: 'Confirm standard Employee access before creating this login.' }),
});
export const departmentSchema = z.object({ name: z.string().trim().min(2).max(80) });
export const companySchema = z.object({ display_name: z.string().trim().min(2).max(100) });
export const clientSchema = z.object({ display_name: z.string().trim().min(2).max(100) });
export function safeDestination(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\r\n]/.test(value) ? value : '/';
}
