export type ComplianceTone = "success" | "warning" | "danger" | "info";

// theme.colors.status.* paths, resolved via colorAtPath at render time (keeps this
// module free of RN/theme imports so it stays importable under the vitest RN mock).
export const TONE_TOKEN_KEYS: Record<ComplianceTone, string> = {
  success: 'status.present', warning: 'status.excused', danger: 'status.absent', info: 'status.info',
};

export function complianceTone(value: number, explicit?: ComplianceTone): ComplianceTone {
  if (explicit) return explicit;
  if (value >= 85) return 'success';
  if (value >= 70) return 'warning';
  return 'danger';
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
