export type AuditAction = "view" | "edit" | "export" | "approve" | "delete";
export const AUDIT_ACTION_KEYS: AuditAction[] = ['view', 'edit', 'export', 'approve', 'delete'];

const META: Record<AuditAction, { label: string; colorTokenKey: string }> = {
  view:    { label: 'viewed',   colorTokenKey: 'status.info' },
  edit:    { label: 'edited',   colorTokenKey: 'status.excused' },
  export:  { label: 'exported', colorTokenKey: 'primaryPressed' },
  approve: { label: 'approved', colorTokenKey: 'status.present' },
  delete:  { label: 'deleted',  colorTokenKey: 'status.absent' },
};

export function auditActionMeta(action: AuditAction): { label: string; colorTokenKey: string } {
  return META[action];
}
