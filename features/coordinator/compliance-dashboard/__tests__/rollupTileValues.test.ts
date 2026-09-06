import { describe, it, expect } from 'vitest';
import { rollupTileValues } from '../viewState';

const counts = { fullyCompliant: 3, atRisk: 1, nonCompliant: 2 };
const zero = { fullyCompliant: 0, atRisk: 0, nonCompliant: 0 };

describe('rollupTileValues', () => {
  it('content -> the real figures', () => {
    expect(rollupTileValues('content', counts)).toEqual({ fullyCompliant: '3', atRisk: '1', nonCompliant: '2' });
  });

  it('empty (a session with zero classes) -> a real, earned zero', () => {
    expect(rollupTileValues('empty', zero)).toEqual({ fullyCompliant: '0', atRisk: '0', nonCompliant: '0' });
  });

  // AC5's principle — "honest placeholder, never a false zero" — one level up from ComplianceBar.
  // computeRollup([]) yields 0/0/0 in both these states, and "0 non-compliant" over a failed fetch
  // is the dangerous direction: the coordinator concludes everything is fine.
  it('loading -> placeholder, never 0', () => {
    expect(rollupTileValues('loading', zero)).toEqual({ fullyCompliant: '—', atRisk: '—', nonCompliant: '—' });
  });

  it('error -> placeholder, never 0', () => {
    expect(rollupTileValues('error', zero)).toEqual({ fullyCompliant: '—', atRisk: '—', nonCompliant: '—' });
  });
});
