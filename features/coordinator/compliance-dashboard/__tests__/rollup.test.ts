import { describe, it, expect } from 'vitest';
import { classifyClass, computeRollup, type ComplianceRow } from '../rollup';

const row = (attendance_rate: number | null, update_rate: number | null): ComplianceRow => ({
  class_id: 'x', class_name: 'X', enrolled_count: 10,
  window_start: '2026-01-01', window_end: '2026-01-31',
  attendance_rate, update_rate,
});

describe('classifyClass', () => {
  it('both >=85 -> fully-compliant', () => expect(classifyClass(row(90, 85))).toBe('fully-compliant'));
  it('either <70 takes priority over at-risk', () => expect(classifyClass(row(60, 100))).toBe('non-compliant'));
  it('both in [70,84] -> at-risk', () => expect(classifyClass(row(70, 84))).toBe('at-risk'));
  it('one >=85, one in [70,84) -> at-risk (not fully-compliant)', () => expect(classifyClass(row(90, 72))).toBe('at-risk'));
  it('either metric null -> unclassified, never miscounted', () => {
    expect(classifyClass(row(null, 90))).toBe('unclassified');
    expect(classifyClass(row(90, null))).toBe('unclassified');
    expect(classifyClass(row(null, null))).toBe('unclassified');
  });
});

describe('computeRollup', () => {
  it('counts each band, excluding unclassified from all three buckets', () => {
    const rows = [row(90, 90), row(60, 90), row(75, 80), row(null, null)];
    expect(computeRollup(rows)).toEqual({ fullyCompliant: 1, atRisk: 1, nonCompliant: 1 });
  });
  it('empty input -> all zero', () => expect(computeRollup([])).toEqual({ fullyCompliant: 0, atRisk: 0, nonCompliant: 0 }));
});
