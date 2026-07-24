import { clampPercent, complianceTone, TONE_TOKEN_KEYS } from './ComplianceBar.logic';

export function rollupMeta(attendance: number | undefined, placeholder: boolean): { pct: number; toneTokenKey: string; display: string } {
  if (placeholder) return { pct: 0, toneTokenKey: TONE_TOKEN_KEYS.success, display: '—' };
  const pct = clampPercent(attendance ?? 0);
  return { pct, toneTokenKey: TONE_TOKEN_KEYS[complianceTone(pct)], display: `${pct}%` };
}
