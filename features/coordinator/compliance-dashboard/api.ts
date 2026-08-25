import type { SupabaseClient } from '@supabase/supabase-js';
import type { ComplianceRow } from './rollup';

export async function getSessionCompliance(
  client: SupabaseClient,
  sessionId: string,
  windowSize = 4
): Promise<ComplianceRow[]> {
  const { data, error } = await client.rpc('get_session_compliance_for_staff', {
    p_session_id: sessionId,
    p_window_size: windowSize,
  });
  if (error) throw new Error(error.message);
  // An empty array is not unambiguously "this session has no classes": the RPC's denied branch
  // logs an audit row and `return`s an empty result set with no error, so a denial reads the same
  // way here and surfaces as "No classes in this session yet."
  //
  // Not worth a distinguishing round-trip, and deliberately so — `dashboard.tsx` passes the
  // coordinator's OWN scopeId as p_session_id, so the guard evaluates `scope_id = scope_id` and
  // the denial branch is unreachable for a well-formed coordinator JWT. What remains is the
  // narrow window where the JWT's scope_id is stale (role revoked or re-scoped mid-session), and
  // there the reload that fixes it also fixes the message. Documented rather than handled, so the
  // next reader doesn't mistake `[]` for proof of an empty session (PR #50 review, @ssrinivas90).
  return (data ?? []) as ComplianceRow[];
}
