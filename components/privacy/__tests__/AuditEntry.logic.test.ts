import { describe, it, expect } from 'vitest';
import { auditActionMeta, AUDIT_ACTION_KEYS } from '../AuditEntry.logic';

describe('AUDIT_ACTION_KEYS contract', () => {
  it('covers all 5 documented actions', () => {
    expect(AUDIT_ACTION_KEYS.sort()).toEqual(['approve', 'delete', 'edit', 'export', 'view'].sort());
  });
});

describe('auditActionMeta', () => {
  it('view → "viewed", info tone', () => expect(auditActionMeta('view')).toEqual({ label: 'viewed', colorTokenKey: 'status.info' }));
  it('delete → "deleted", danger tone', () => expect(auditActionMeta('delete')).toEqual({ label: 'deleted', colorTokenKey: 'status.absent' }));
  it('approve → "approved", success tone', () => expect(auditActionMeta('approve')).toEqual({ label: 'approved', colorTokenKey: 'status.present' }));
});
