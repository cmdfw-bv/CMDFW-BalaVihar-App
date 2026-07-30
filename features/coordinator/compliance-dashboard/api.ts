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
  return (data ?? []) as ComplianceRow[];
}
