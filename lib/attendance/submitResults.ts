import type { MarksByEnrollment } from './seedMarks';

export interface SubmitResult {
  enrollmentId: string;
  settled: PromiseSettledResult<{ status: 'present' | 'absent' } | null>;
}

// Decision #2/#3: every visible row's mark_attendance_for_staff call is fired concurrently and
// this reduces the Promise.allSettled output back onto the marks record. A fulfilled call with
// a non-null row -> saved. A fulfilled call returning null (the RPC's no-throw denial contract,
// per the refine-stage edge case) or a rejected promise -> error, never a silent no-op. Local
// `status` (what the teacher tapped) is left as-is either way — only saved/error flip.
export function applySubmitResults(marks: MarksByEnrollment, results: SubmitResult[]): MarksByEnrollment {
  const next = { ...marks };
  for (const { enrollmentId, settled } of results) {
    const current = next[enrollmentId];
    if (!current) continue;
    const ok = settled.status === 'fulfilled' && settled.value !== null;
    next[enrollmentId] = { ...current, saved: ok, error: !ok };
  }
  return next;
}
