import { describe, it, expect } from 'vitest';
import { buildClassUpdatePayload, CLASS_UPDATE_BODY_MAX, CLASS_UPDATE_HOMEWORK_MAX } from '../classUpdatePayload';

describe('buildClassUpdatePayload', () => {
  it('returns null when body is blank (whitespace-only)', () => {
    expect(buildClassUpdatePayload('   ', 'do the reading', '2026-01-11')).toBeNull();
  });
  it('omits homework entirely when blank — not an empty string (edge case #1)', () => {
    expect(buildClassUpdatePayload('Great class today', '   ', '2026-01-11')).toEqual({ body: 'Great class today', meetingDate: '2026-01-11' });
  });
  it('trims both fields and includes homework when present', () => {
    expect(buildClassUpdatePayload('  Great class  ', '  read ch. 3  ', '2026-01-11')).toEqual({ body: 'Great class', homework: 'read ch. 3', meetingDate: '2026-01-11' });
  });

  // Length caps mirror the DB check constraints exactly, so the composer rejects before the
  // round trip instead of surfacing a raw 23514 from PostgREST.
  it('accepts a body exactly at the cap', () => {
    const atCap = 'x'.repeat(CLASS_UPDATE_BODY_MAX);
    expect(buildClassUpdatePayload(atCap, '', '2026-01-11')).toEqual({ body: atCap, meetingDate: '2026-01-11' });
  });
  it('returns null when the body exceeds the cap', () => {
    expect(buildClassUpdatePayload('x'.repeat(CLASS_UPDATE_BODY_MAX + 1), '', '2026-01-11')).toBeNull();
  });
  it('measures the cap after trimming, so trailing whitespace alone cannot trip it', () => {
    const atCap = 'x'.repeat(CLASS_UPDATE_BODY_MAX);
    expect(buildClassUpdatePayload(`  ${atCap}  `, '', '2026-01-11')).toEqual({ body: atCap, meetingDate: '2026-01-11' });
  });
  it('returns null when homework exceeds its cap, even with a valid body', () => {
    expect(buildClassUpdatePayload('fine', 'y'.repeat(CLASS_UPDATE_HOMEWORK_MAX + 1), '2026-01-11')).toBeNull();
  });
  it('accepts homework exactly at its cap', () => {
    const atCap = 'y'.repeat(CLASS_UPDATE_HOMEWORK_MAX);
    expect(buildClassUpdatePayload('fine', atCap, '2026-01-11')).toEqual({ body: 'fine', homework: atCap, meetingDate: '2026-01-11' });
  });

  // ADR-0036 §2/§3: meeting_date is NOT NULL on class_updates and is a distinct fact from
  // created_at — which meeting the post is *about*, not when it was typed. The payload is the
  // last place that can refuse a post with no meeting date before PostgREST returns a raw 23502.
  it('returns null when no meeting date is supplied (ADR-0036)', () => {
    expect(buildClassUpdatePayload('Covered the Ramayana', '', '')).toBeNull();
  });

  it('includes the meeting date on a valid payload', () => {
    expect(buildClassUpdatePayload('Covered the Ramayana', '', '2026-01-11')).toEqual({
      body: 'Covered the Ramayana',
      meetingDate: '2026-01-11',
    });
  });

  it('rejects a malformed meeting date rather than passing it through to the DB', () => {
    expect(buildClassUpdatePayload('Covered the Ramayana', '', '11-01-2026')).toBeNull();
    expect(buildClassUpdatePayload('Covered the Ramayana', '', 'today')).toBeNull();
  });
});
