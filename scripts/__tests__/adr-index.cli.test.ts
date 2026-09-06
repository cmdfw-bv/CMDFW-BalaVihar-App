import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { START, END } from '../_adr-index.mjs';

// End-to-end coverage of the module→CLI wiring (where thread 1's fail-open was hiding): run the
// real wrapper against a throwaway fixture dir via ADR_INDEX_DIR and assert the process EXIT CODE.
// The pure module is unit-tested in adr-index.test.ts; this proves the CLI actually exits non-zero.

const adrFile = (id: string, title: string, date: string, category = 'Data') =>
  `# ${id}: ${title}\n**Status:** Closed · **Category:** ${category} · **Date:** ${date} · **Deciders:** X\n\n## Context\nbody\n`;

const readmeWithMarkers = () => `# Test ADRs\n\n## Index\n\n${START}\n${END}\n\n## Footer\n`;

let dir: string;
const run = (...args: string[]) =>
  spawnSync('node', ['scripts/gen-adr-index.mjs', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ADR_INDEX_DIR: dir },
  });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-cli-'));
  fs.writeFileSync(path.join(dir, '2026-01-01-alpha.md'), adrFile('ADR-2026-01-01-alpha', 'Alpha', '2026-01-01'));
  fs.writeFileSync(path.join(dir, '2026-01-02-beta.md'), adrFile('ADR-2026-01-02-beta', 'Beta', '2026-01-02'));
  fs.writeFileSync(path.join(dir, 'README.md'), readmeWithMarkers());
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('gen-adr-index.mjs CLI (exit codes)', () => {
  it('regenerates (exit 0), then --check is green (exit 0)', () => {
    expect(run().status).toBe(0);
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('ADR-2026-01-01-alpha');
    expect(run('--check').status).toBe(0);
  });

  it('--check exits NON-ZERO on a duplicate id', () => {
    run(); // sync first
    fs.writeFileSync(path.join(dir, '2026-01-01-alpha-dup.md'), adrFile('ADR-2026-01-01-alpha', 'Dup', '2026-01-01'));
    const r = run('--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/duplicate id/);
  });

  it('--check exits NON-ZERO on inverted README markers (the blocker, end to end)', () => {
    run();
    const good = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    // swap the order of the two markers → a regex .replace() would no-op and pass
    const inverted = `# Test ADRs\n\n## Index\n\n${END}\n\nstuff\n\n${START}\n\n## Footer\n`;
    expect(inverted).not.toBe(good);
    fs.writeFileSync(path.join(dir, 'README.md'), inverted);
    const r = run('--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/ADR-INDEX markers/);
  });

  it('--check exits NON-ZERO on a newly-minted number past the 0038 cutover', () => {
    run();
    fs.writeFileSync(path.join(dir, '0039-sneaky.md'), adrFile('ADR-0039', 'Sneaky', '2026-01-03'));
    const r = run('--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not a known legacy id/);
  });
});
