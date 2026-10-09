import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { catchUpCursor, compareMessages, mergeMessages, type ChatMessage } from '../messageList';

const CONV = '11111111-1111-4111-8111-111111111111';
const msg = (id: string, created_at: string, body = id): ChatMessage => ({
  id,
  conversation_id: CONV,
  sender_user_id: '22222222-2222-4222-8222-222222222222',
  body,
  mention_targets: [],
  created_at,
});

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

describe('compareMessages', () => {
  it('orders by created_at', () => {
    const early = msg(B, '2026-10-07T12:00:00+00:00');
    const late = msg(A, '2026-10-07T12:00:01+00:00');
    expect(compareMessages(early, late)).toBeLessThan(0);
    expect(compareMessages(late, early)).toBeGreaterThan(0);
  });

  it('orders timestamps that differ only below a millisecond', () => {
    // Date.parse() truncates both of these to the same millisecond.
    const first = msg(B, '2026-10-07T12:00:00.123456+00:00');
    const second = msg(A, '2026-10-07T12:00:00.123457+00:00');
    expect(compareMessages(first, second)).toBeLessThan(0);
  });

  it('treats trailing zeros Postgres trimmed as zeros', () => {
    // Postgres prints .120000 as .12 -- that is earlier than .120001, and equal to .120.
    const trimmed = msg(B, '2026-10-07T12:00:00.12+00:00');
    const later = msg(A, '2026-10-07T12:00:00.120001+00:00');
    expect(compareMessages(trimmed, later)).toBeLessThan(0);
    expect(compareMessages(msg(A, '2026-10-07T12:00:00.12+00:00'), msg(A, '2026-10-07T12:00:00.120+00:00'))).toBe(0);
  });

  it('breaks an exact timestamp tie by id, so the order is stable', () => {
    const at = '2026-10-07T12:00:00.5+00:00';
    expect(compareMessages(msg(A, at), msg(B, at))).toBeLessThan(0);
    expect(compareMessages(msg(B, at), msg(A, at))).toBeGreaterThan(0);
  });
});

describe('mergeMessages', () => {
  it('drops duplicates by id', () => {
    const held = [msg(A, '2026-10-07T12:00:00+00:00')];
    const merged = mergeMessages(held, [msg(A, '2026-10-07T12:00:00+00:00'), msg(B, '2026-10-07T12:00:01+00:00')]);
    expect(merged.map((m) => m.id)).toEqual([A, B]);
  });

  it('returns ascending (created_at, id) order whatever order rows arrive in', () => {
    const at = '2026-10-07T12:00:00+00:00';
    const merged = mergeMessages([msg(C, '2026-10-07T12:00:05+00:00')], [msg(B, at), msg(A, at)]);
    expect(merged.map((m) => m.id)).toEqual([A, B, C]);
  });

  it('slots a late-committing earlier message into place rather than appending it', () => {
    const held = [msg(A, '2026-10-07T12:00:00+00:00'), msg(C, '2026-10-07T12:00:02+00:00')];
    const merged = mergeMessages(held, [msg(B, '2026-10-07T12:00:01+00:00')]);
    expect(merged.map((m) => m.id)).toEqual([A, B, C]);
  });

  it('does not mutate the held list', () => {
    const held = [msg(A, '2026-10-07T12:00:00+00:00')];
    mergeMessages(held, [msg(B, '2026-10-07T12:00:01+00:00')]);
    expect(held).toHaveLength(1);
  });
});

describe('catchUpCursor', () => {
  it('is null when nothing is held (catch-up is then the initial load)', () => {
    expect(catchUpCursor([])).toBeNull();
  });

  it('is the newest held created_at minus the 10 second overlap', () => {
    const held = [msg(A, '2026-10-07T12:00:00+00:00'), msg(B, '2026-10-07T12:00:30+00:00')];
    expect(catchUpCursor(held)).toBe('2026-10-07T12:00:20.000Z');
  });

  it('never lands after the true cursor when the newest timestamp has microseconds', () => {
    const held = [msg(A, '2026-10-07T12:00:30.999999+00:00')];
    expect(catchUpCursor(held)).toBe('2026-10-07T12:00:20.999Z');
  });
});

// The date-time format JavaScript engines must parse has three fractional digits; Postgres
// prints up to six. V8 accepts the extra digits, but nothing obliges another engine (Hermes on
// native) to. These run with a Date.parse that rejects them.
describe('on an engine whose Date.parse rejects more than three fractional digits', () => {
  const realParse = Date.parse;
  beforeEach(() => {
    vi.spyOn(Date, 'parse').mockImplementation((iso: string) => (/\.\d{4,}/.test(iso) ? NaN : realParse(iso)));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still computes the catch-up cursor', () => {
    const held = [msg(A, '2026-10-07T12:00:30.999999+00:00')];
    expect(catchUpCursor(held)).toBe('2026-10-07T12:00:20.999Z');
  });

  it('still orders by created_at, down to the microsecond', () => {
    const early = msg(B, '2026-10-07T12:00:00.123456+00:00');
    const sameMsLater = msg(A, '2026-10-07T12:00:00.123457+00:00');
    const late = msg(C, '2026-10-07T12:00:01.5+00:00');
    expect(mergeMessages([], [late, sameMsLater, early]).map((m) => m.id)).toEqual([B, A, C]);
  });
});
