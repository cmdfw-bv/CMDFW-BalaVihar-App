import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isRemoteMigrationPush } = require('../_migration-command-match.js');

describe('isRemoteMigrationPush', () => {
  it('gates a plain remote db push (default target)', () => {
    expect(isRemoteMigrationPush('supabase db push')).toBe(true);
  });

  it('does not gate a local db push', () => {
    expect(isRemoteMigrationPush('supabase db push --local')).toBe(false);
  });

  it('does not gate migration up by default (local)', () => {
    expect(isRemoteMigrationPush('supabase migration up')).toBe(false);
  });

  it('gates migration up when targeting a remote/linked project', () => {
    expect(isRemoteMigrationPush('supabase migration up --linked')).toBe(true);
    expect(isRemoteMigrationPush('supabase migration up --db-url postgres://remote')).toBe(true);
  });

  it('does not gate unrelated supabase commands', () => {
    expect(isRemoteMigrationPush('supabase db reset')).toBe(false);
    expect(isRemoteMigrationPush('supabase status')).toBe(false);
  });

  it('does not gate non-migration commands (e.g. csv-import)', () => {
    expect(isRemoteMigrationPush('node scripts/csv-import.js')).toBe(false);
  });

  it('gates via npx-wrapped invocations', () => {
    expect(isRemoteMigrationPush('npx supabase db push')).toBe(true);
    expect(isRemoteMigrationPush('npx supabase db push --local')).toBe(false);
  });

  it('gates when a flag precedes the subcommand', () => {
    expect(isRemoteMigrationPush('supabase --workdir . db push')).toBe(true);
  });

  it('gates via a bash -c wrapper', () => {
    expect(isRemoteMigrationPush('bash -c "supabase db push"')).toBe(true);
  });

  it('does not false-positive on a commit message mentioning the phrase', () => {
    expect(isRemoteMigrationPush('git commit -m "docs: explain supabase db push workflow"')).toBe(false);
  });

  it('gates a chained command even when a different segment is --local', () => {
    // one invocation is local, a separate chained invocation is a real remote push —
    // the whole command must still be gated
    expect(isRemoteMigrationPush('supabase db push --local && supabase migration up --linked')).toBe(true);
  });

  it('does not gate a chained command where every migration invocation is local', () => {
    expect(isRemoteMigrationPush('supabase db push --local && supabase migration up')).toBe(false);
  });
});
