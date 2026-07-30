export interface ComplianceRow {
  class_id: string;
  class_name: string;
  enrolled_count: number;
  window_start: string | null;
  window_end: string | null;
  attendance_rate: number | null;
  update_rate: number | null;
}

export type ClassBand = 'fully-compliant' | 'at-risk' | 'non-compliant' | 'unclassified';

export interface RollupCounts {
  fullyCompliant: number;
  atRisk: number;
  nonCompliant: number;
}

export function classifyClass(row: ComplianceRow): ClassBand {
  const { attendance_rate: a, update_rate: u } = row;
  if (a === null || u === null) return 'unclassified';
  if (a < 70 || u < 70) return 'non-compliant';
  if (a >= 85 && u >= 85) return 'fully-compliant';
  return 'at-risk';
}

export function computeRollup(rows: ComplianceRow[]): RollupCounts {
  const counts: RollupCounts = { fullyCompliant: 0, atRisk: 0, nonCompliant: 0 };
  for (const row of rows) {
    const band = classifyClass(row);
    if (band === 'fully-compliant') counts.fullyCompliant++;
    else if (band === 'at-risk') counts.atRisk++;
    else if (band === 'non-compliant') counts.nonCompliant++;
  }
  return counts;
}
