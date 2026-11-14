import { describe, it, expect, vi } from 'vitest';
import { fetchRemovedMessages } from '../api';

function mockClient(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) } as any;
}

const dbRow = {
  message_id: 'm1', class_name: 'C1', sender_label: 'Asha', sender_role: 'student',
  created_at: '2026-11-01T10:00:00Z', body: 'hi', remover_label: 'Teacher T',
  removed_by_role: 'teacher', removed_at: '2026-11-02T10:00:00Z',
};

describe('fetchRemovedMessages', () => {
  it('sends only the limit when there is no cursor', async () => {
    const client = mockClient({ data: [], error: null });
    await fetchRemovedMessages(client);
    expect(client.rpc).toHaveBeenCalledWith('get_removed_messages_for_oversight', { p_limit: 20 });
  });
  it('sends both cursor params together with the limit', async () => {
    const client = mockClient({ data: [], error: null });
    await fetchRemovedMessages(client, { removedAt: '2026-11-02T10:00:00Z', id: 'm1' });
    expect(client.rpc).toHaveBeenCalledWith('get_removed_messages_for_oversight', {
      p_before_removed_at: '2026-11-02T10:00:00Z', p_before_id: 'm1', p_limit: 20,
    });
  });
  it('camelCases the nine columns', async () => {
    const client = mockClient({ data: [dbRow], error: null });
    expect(await fetchRemovedMessages(client)).toEqual([{
      messageId: 'm1', className: 'C1', senderLabel: 'Asha', senderRole: 'student',
      createdAt: '2026-11-01T10:00:00Z', body: 'hi', removerLabel: 'Teacher T',
      removedByRole: 'teacher', removedAt: '2026-11-02T10:00:00Z',
    }]);
  });
  it('treats null data as no rows', async () => {
    expect(await fetchRemovedMessages(mockClient({ data: null, error: null }))).toEqual([]);
  });
  it('throws on an RPC error', async () => {
    const client = mockClient({ data: null, error: { message: 'boom' } });
    await expect(fetchRemovedMessages(client)).rejects.toThrow('boom');
  });
});
