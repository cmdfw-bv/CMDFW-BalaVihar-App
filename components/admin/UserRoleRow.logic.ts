export function userRoleRowInitial(name?: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed.charAt(0) : '?';
}

export function actionsForStatus(status: 'active' | 'pending'): 'manage' | 'approve-reject' {
  return status === 'pending' ? 'approve-reject' : 'manage';
}
