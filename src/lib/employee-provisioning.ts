// All credentials stay inside the server callbacks, never in results or audit payloads.
export async function provisionEmployeeLogin(operations: {
  createAuth: () => Promise<{ id?: string }>;
  completeDirectory: (id: string) => Promise<string>;
  removeNewAuth: (id: string) => Promise<void>;
}): Promise<{ ok: boolean; message: string; employeeId?: string; loginCreated?: boolean }> {
  let id: string | undefined;
  try { id = (await operations.createAuth()).id; }
  catch { return { ok: false, message: 'Account creation could not be confirmed. Check existing accounts before retrying.' }; }
  if (!id) return { ok: false, message: 'Account could not be created. Check for an existing email account or password requirements. Existing passwords are never replaced.' };
  try {
    const employeeId = await operations.completeDirectory(id);
    if (!employeeId) throw new Error('Unconfirmed directory save');
    return { ok: true, loginCreated: true, employeeId, message: 'Employee and login created. Standard Employee access is ready.' };
  } catch {
    try { await operations.removeNewAuth(id); }
    catch { return { ok: false, message: 'Account setup needs Owner review. Authentication and workspace status could not be confirmed. Do not retry until both are checked.' }; }
    return { ok: false, message: 'Employee setup failed; the new authentication account was removed. Check for an existing employee, invalid department, or missing database setup.' };
  }
}
