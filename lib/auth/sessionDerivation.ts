import type { AuthClaims } from './claims';

// 'loading' (the pre-first-event state) is not produced here — it's SessionProvider's own
// initial useState default, overwritten by this function's result once getSession()/
// onAuthStateChange fires the first event. Keeping it out of this pure function's output
// set means every branch here is a real, observed state, not a placeholder.
export type SessionStatus = 'signed-out' | 'zero-role' | 'ready';

export interface DerivedSession {
  status: SessionStatus;
  activeRole: string | null;
  scopeType: string | null;
  scopeId: string | null;
}

const NO_ROLE: Omit<DerivedSession, 'status'> = { activeRole: null, scopeType: null, scopeId: null };

export function deriveSessionState(hasSession: boolean, claims: AuthClaims | null): DerivedSession {
  if (!hasSession) return { status: 'signed-out', ...NO_ROLE };
  if (!claims?.activeRole) return { status: 'zero-role', ...NO_ROLE };
  return { status: 'ready', activeRole: claims.activeRole, scopeType: claims.scopeType, scopeId: claims.scopeId };
}
