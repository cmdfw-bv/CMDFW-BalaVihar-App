import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The cloud fixture-absence check is operator-run against a cloud project, so CI can never
// execute it — no credentials, by design. What CI *can* pin is its exit-code contract.
//
// Found in review of PR #86 (@arunasharad-coder): psql's default is to print an error and still
// exit 0, so the raise inside the DO block was visible but the process reported success. The
// runbook documents the bare `psql -f …` form; every test invocation had passed
// `-v ON_ERROR_STOP=1`, so the harness was stricter than the shipped thing and the gap survived.
// A blocking gate whose exit status says "fine" while the account factory is present is not a
// gate. These tests exist so removing the pragma goes red instead of silently failing open.
const SQL = readFileSync('supabase/checks/cloud_fixture_absence.sql', 'utf8');

describe('cloud_fixture_absence.sql — exit-code contract', () => {
  it('sets ON_ERROR_STOP itself, so any invocation exits non-zero on a finding', () => {
    expect(SQL).toMatch(/^\\set\s+ON_ERROR_STOP\s+(on|1)\s*$/mi);
  });

  it('sets it before the DO block that raises, or it would not apply', () => {
    const pragma = SQL.search(/^\\set\s+ON_ERROR_STOP\s+(on|1)\s*$/mi);
    const doBlock = SQL.search(/^do\s+\$\$/mi);
    expect(pragma).toBeGreaterThanOrEqual(0);
    expect(doBlock).toBeGreaterThanOrEqual(0);
    expect(pragma).toBeLessThan(doBlock);
  });

  it('still raises on a finding — the pragma only controls psql, not the check itself', () => {
    expect(SQL).toMatch(/raise\s+exception/i);
    expect(SQL).toContain('cloud fixture-absence check: FAIL');
  });

  it('reports success on the clean path via notice, not by staying silent', () => {
    expect(SQL).toContain('cloud fixture-absence check: PASS');
  });

  it('searches every schema for the fixture routines, not just public', () => {
    // pgTAP installs into `extensions`; a public-only search would prove nothing.
    expect(SQL).toContain('pg_proc');
    expect(SQL).not.toMatch(/nspname\s*=\s*'public'/i);
  });
});
