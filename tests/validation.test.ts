import { test } from 'node:test';
import assert from 'node:assert/strict';
import { employeeSchema, safeDestination } from '../src/lib/validation';
test('employee validation rejects malformed records and cross-field garbage', () => {
  assert.equal(employeeSchema.safeParse({ display_name: 'X', email: 'bad', job_title: '', department_id: '' }).success, false);
  assert.equal(employeeSchema.safeParse({ display_name: 'Employee', email: 'person@example.com', job_title: '', department_id: 'another-org' }).success, false);
  const valid = employeeSchema.parse({ display_name: ' Employee ', email: 'person@example.com', job_title: '', department_id: '' });
  assert.equal(valid.display_name, 'Employee'); assert.equal(valid.department_id, null);
});
test('redirect destination does not permit external or malformed URLs', () => {
  for (const value of ['https://example.com', '//example.com', '/\\example.com', '/\r\nevil', null]) assert.equal(safeDestination(value), '/');
  assert.equal(safeDestination('/team'), '/team');
});
