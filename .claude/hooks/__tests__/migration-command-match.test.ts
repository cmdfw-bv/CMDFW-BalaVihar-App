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

// See gh-pr-create-match.test.ts — same shared-tokenizer gap: heredoc bodies were tokenized as
// commands, so prose describing a remote push tripped the migration gate.
describe('isRemoteMigrationPush — heredoc bodies are data, not commands', () => {
  it('does not fire on a heredoc that documents a remote push', () => {
    const cmd = [
      "cat > RUNBOOK.md <<'EOF'",
      'To promote, run: supabase db push --linked',
      'EOF',
    ].join('\n');
    expect(isRemoteMigrationPush(cmd)).toBe(false);
  });

  it('still fires on a real push following a heredoc', () => {
    const cmd = ["cat > n.md <<'EOF'", 'notes', 'EOF', 'supabase db push --linked'].join('\n');
    expect(isRemoteMigrationPush(cmd)).toBe(true);
  });
});

// Regression (PR #74 review) — see gh-pr-create-match.test.ts. Same shared-tokenizer defect.
describe('isRemoteMigrationPush — a bogus heredoc delimiter must not swallow real commands', () => {
  it('does not treat a quoted << as a heredoc opener', () => {
    expect(isRemoteMigrationPush('echo "use << EOF for multiline"\nsupabase db push --linked')).toBe(true);
  });

  it('does not treat a herestring as a heredoc', () => {
    expect(isRemoteMigrationPush('cat <<< notes\nsupabase db push --linked')).toBe(true);
  });
});

// PR #74 review (#11) — same bypass; this gate protects remote database pushes.
describe('isRemoteMigrationPush — env-var prefixes must not hide the binary', () => {
  it('sees through an assignment before supabase', () => {
    expect(isRemoteMigrationPush('PGPASSWORD=x supabase db push --linked')).toBe(true);
  });
});
