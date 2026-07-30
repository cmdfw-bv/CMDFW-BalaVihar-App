import { describe, it, expect, vi } from 'vitest';
import { getSessionCompliance } from '../api';

function mockClient(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) } as any;
}

describe('getSessionCompliance', () => {
  it('calls the RPC with the given session id and default window size', async () => {
    const client = mockClient({ data: [], error: null });
    await getSessionCompliance(client, 'session-1');
    expect(client.rpc).toHaveBeenCalledWith('get_session_compliance_for_staff', { p_session_id: 'session-1', p_window_size: 4 });
  });
  it('passes through a custom window size', async () => {
    const client = mockClient({ data: [], error: null });
    await getSessionCompliance(client, 'session-1', 8);
    expect(client.rpc).toHaveBeenCalledWith('get_session_compliance_for_staff', { p_session_id: 'session-1', p_window_size: 8 });
  });
  it('returns the rows on success', async () => {
    const rows = [{ class_id: 'c1', class_name: 'C1', enrolled_count: 5, window_start: null, window_end: null, attendance_rate: null, update_rate: null }];
    const client = mockClient({ data: rows, error: null });
    expect(await getSessionCompliance(client, 'session-1')).toEqual(rows);
  });
  it('throws on a Supabase error (caller/hook handles the catch)', async () => {
    const client = mockClient({ data: null, error: { message: 'boom' } });
    await expect(getSessionCompliance(client, 'session-1')).rejects.toThrow('boom');
  });
});
