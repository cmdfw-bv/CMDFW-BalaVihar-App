import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  findFixtureCreations,
  scanMigrations,
  HISTORICAL_FIXTURE_MIGRATION,
} = require('../_migration-fixture-checks.js');

// ADR-2026-09-07: test-only DB objects install via the seed path, never a migration.
// This guard is what keeps Decision 1 from being one contributor away from undone —
// the obvious place to put a new fixture helper is exactly where the old one was.

describe('findFixtureCreations — what counts as reintroducing the fixture surface', () => {
  it('flags creating the pgtap extension', () => {
    expect(findFixtureCreations('create extension pgtap;')).toHaveLength(1);
  });

  it('flags the exact historical form, with schema qualifier and if-not-exists', () => {
    const sql = 'create extension if not exists pgtap with schema extensions;';
    expect(findFixtureCreations(sql)).toHaveLength(1);
  });

  it('flags creating the tests schema', () => {
    expect(findFixtureCreations('create schema tests;')).toHaveLength(1);
    expect(findFixtureCreations('create schema if not exists tests;')).toHaveLength(1);
  });

  it('flags creating a function in the tests schema', () => {
    const sql = 'create or replace function tests.authenticate_as(p_user_id uuid)\nreturns void as $$ begin end; $$;';
    expect(findFixtureCreations(sql)).toHaveLength(1);
  });

  it('flags a create function written with odd whitespace', () => {
    expect(findFixtureCreations('create   function   tests . helper ( )')).toHaveLength(1);
  });

  it('reports the offending line so the failure names it, not just the file', () => {
    const sql = '-- header\n\ncreate schema tests;\n';
    const [hit] = findFixtureCreations(sql);
    expect(hit.line).toBe(3);
    expect(hit.text).toContain('create schema tests');
  });

  it('flags every distinct creation in one file, not just the first', () => {
    const sql = 'create extension pgtap;\ncreate schema tests;\ncreate function tests.f() returns void as $$$$;';
    expect(findFixtureCreations(sql)).toHaveLength(3);
  });
});

describe('findFixtureCreations — what must NOT be flagged', () => {
  it('does not flag dropping the fixture surface — removal is the fix, not the offence', () => {
    const sql = 'drop schema if exists tests cascade;\ndrop extension if exists pgtap;';
    expect(findFixtureCreations(sql)).toHaveLength(0);
  });

  it('does not flag a line-commented creation', () => {
    expect(findFixtureCreations('-- create schema tests;')).toHaveLength(0);
  });

  it('does not flag the helper named only inside a comment', () => {
    const sql = '-- the call in `tests.authenticate_as(...)` exists precisely to work around it.';
    expect(findFixtureCreations(sql)).toHaveLength(0);
  });

  it('does not flag a block-commented creation', () => {
    expect(findFixtureCreations('/*\ncreate schema tests;\n*/')).toHaveLength(0);
  });

  it('does not flag an unrelated schema or extension', () => {
    const sql = 'create schema billing;\ncreate extension if not exists pgcrypto;\ncreate function public.tests_helper() returns void as $$$$;';
    expect(findFixtureCreations(sql)).toHaveLength(0);
  });

  it('does not flag a table whose name merely contains "tests"', () => {
    expect(findFixtureCreations('create table public.attendance_tests (id uuid);')).toHaveLength(0);
  });
});

describe('scanMigrations — allowlist and fail-closed behaviour', () => {
  const offending = { name: '20260910000000_add_helper.sql', sql: 'create schema tests;' };
  const historical = { name: HISTORICAL_FIXTURE_MIGRATION, sql: 'create extension if not exists pgtap with schema extensions;\ncreate schema if not exists tests;' };
  const dropper = { name: '20260907120000_drop_test_fixture_surface.sql', sql: 'drop schema if exists tests cascade;' };

  it('flags a new migration that reintroduces the fixture surface', () => {
    const findings = scanMigrations([historical, dropper, offending]);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe(offending.name);
  });

  it('does not flag the historical migration — it cannot be edited (ADR Decision 2)', () => {
    expect(scanMigrations([historical])).toHaveLength(0);
  });

  it('does not flag the drop migration', () => {
    expect(scanMigrations([dropper])).toHaveLength(0);
  });

  it('allowlists exactly one file, by exact name — a lookalike is still flagged', () => {
    const lookalike = { name: '20260709022932_enable_pgtap_and_test_helpers_v2.sql', sql: 'create schema tests;' };
    expect(scanMigrations([lookalike])).toHaveLength(1);
  });

  it('throws on an empty migration set — zero files means the scan is broken, not clean', () => {
    expect(() => scanMigrations([])).toThrow(/no migrations/i);
  });
});
