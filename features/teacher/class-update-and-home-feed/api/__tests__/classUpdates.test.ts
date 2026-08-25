import { describe, it, expect, vi } from 'vitest';
import { fetchRecentClassMeetings, MEETING_PICKER_LIMIT } from '../classUpdates';

// Mirrors features/coordinator/compliance-dashboard/__tests__/api.test.ts, adapted to a PostgREST
// query builder rather than an RPC: every method returns the same recorder so the whole chain can
// be asserted in one place.
//
// These four clauses ARE ADR-0036 §3's story — scheduled only, on or before today, newest first,
// at most four — and the migration comment at `20260729093000:146-148` leans on the third of them
// ("client code already declines to offer future dates"). The DB no longer depends on it for
// correctness since the policy gates the write itself, but the composer's usability does, and
// nothing pinned them (PR #50 review, raised round 3, closed round 6).
function mockClient(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'lte', 'order', 'limit'] as const) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, ...args]);
      return method === 'limit' ? Promise.resolve(result) : builder;
    });
  }
  const from = vi.fn((table: string) => {
    calls.push(['from', table]);
    return builder;
  });
  return { client: { from } as any, calls };
}

const argsFor = (calls: Array<[string, ...unknown[]]>, method: string) =>
  calls.filter((c) => c[0] === method).map((c) => c.slice(1));

describe('fetchRecentClassMeetings', () => {
  it('reads meeting_date from class_meetings for the given class', async () => {
    const { client, calls } = mockClient({ data: [], error: null });

    await fetchRecentClassMeetings(client, 'class-1', '2026-08-23');

    expect(argsFor(calls, 'from')).toEqual([['class_meetings']]);
    expect(argsFor(calls, 'select')).toEqual([['meeting_date']]);
    expect(argsFor(calls, 'eq')).toContainEqual(['class_id', 'class-1']);
  });

  it('offers only scheduled meetings, so a cancelled class never becomes postable', async () => {
    const { client, calls } = mockClient({ data: [], error: null });

    await fetchRecentClassMeetings(client, 'class-1', '2026-08-23');

    expect(argsFor(calls, 'eq')).toContainEqual(['status', 'scheduled']);
  });

  it('never offers a future date — you cannot report on a class that has not happened', async () => {
    const { client, calls } = mockClient({ data: [], error: null });

    await fetchRecentClassMeetings(client, 'class-1', '2026-08-23');

    expect(argsFor(calls, 'lte')).toEqual([['meeting_date', '2026-08-23']]);
  });

  it('orders newest first, so index 0 is the natural default in the picker', async () => {
    const { client, calls } = mockClient({ data: [], error: null });

    await fetchRecentClassMeetings(client, 'class-1', '2026-08-23');

    expect(argsFor(calls, 'order')).toEqual([['meeting_date', { ascending: false }]]);
  });

  it('caps the picker at MEETING_PICKER_LIMIT', async () => {
    const { client, calls } = mockClient({ data: [], error: null });

    await fetchRecentClassMeetings(client, 'class-1', '2026-08-23');

    expect(argsFor(calls, 'limit')).toEqual([[MEETING_PICKER_LIMIT]]);
    expect(MEETING_PICKER_LIMIT).toBe(4);
  });

  it('flattens the rows to bare ISO dates', async () => {
    const { client } = mockClient({
      data: [{ meeting_date: '2026-08-16' }, { meeting_date: '2026-08-09' }],
      error: null,
    });

    expect(await fetchRecentClassMeetings(client, 'class-1', '2026-08-23')).toEqual(['2026-08-16', '2026-08-09']);
  });

  it('returns an empty list, not null, when the class has no meetings yet', async () => {
    const { client } = mockClient({ data: null, error: null });

    expect(await fetchRecentClassMeetings(client, 'class-1', '2026-08-23')).toEqual([]);
  });

  // The composer distinguishes these two: a throw becomes `error` (retryable, honest), an empty
  // list becomes `none`. Collapsing them is exactly the round-6 finding — see logic/meetingsPanel.ts.
  it('throws on a Supabase error rather than reporting an empty calendar', async () => {
    const { client } = mockClient({ data: null, error: { message: 'network down' } });

    await expect(fetchRecentClassMeetings(client, 'class-1', '2026-08-23')).rejects.toMatchObject({
      message: 'network down',
    });
  });
});
