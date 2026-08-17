import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isGhPrCreate } = require('../_gh-pr-create-match.js');

describe('isGhPrCreate', () => {
  it('matches a plain gh pr create', () => {
    expect(isGhPrCreate('gh pr create --fill')).toBe(true);
  });

  it('matches gh pr create with a leading --repo/-R flag (inherited flag before subcommand)', () => {
    expect(isGhPrCreate('gh --repo org/repo pr create --fill')).toBe(true);
    expect(isGhPrCreate('gh -R org/repo pr create --fill')).toBe(true);
  });

  it('matches gh pr create chained after another command', () => {
    expect(isGhPrCreate('cd foo && gh pr create --fill')).toBe(true);
    expect(isGhPrCreate('gh pr create --fill; echo done')).toBe(true);
  });

  it('matches gh pr create wrapped in a shell -c invocation', () => {
    expect(isGhPrCreate('bash -c "gh pr create --fill"')).toBe(true);
    expect(isGhPrCreate("sh -c 'gh pr create --fill'")).toBe(true);
  });

  it('matches gh pr create invoked via an absolute path', () => {
    expect(isGhPrCreate('/usr/local/bin/gh pr create --fill')).toBe(true);
  });

  it('does not false-positive on commands that only mention the phrase', () => {
    expect(
      isGhPrCreate('git commit -m "feat: pr-guard hook — block gh pr create until /test is green"')
    ).toBe(false);
    expect(isGhPrCreate("echo 'remember to run gh pr create later'")).toBe(false);
    expect(isGhPrCreate("gh pr create --title 'gh pr create in the title'")).toBe(true); // still a real invocation
  });

  it('does not match other gh subcommands', () => {
    expect(isGhPrCreate('gh pr list')).toBe(false);
    expect(isGhPrCreate('gh issue create --label bug --title x')).toBe(false);
  });
});

// Heredoc bodies are stdin DATA, never commands — the shell does not execute them. Without stripping,
// a commit message that merely describes opening a PR trips the gate. Found 2026-08-17 while adding
// remote-body-guard, which hit the identical bug and blocked its own commit.
describe('isGhPrCreate — heredoc bodies are data, not commands', () => {
  it('does not fire on a quoted heredoc commit message mentioning gh pr create', () => {
    const cmd = [
      "git commit -F - <<'EOF'",
      'docs: explain the release flow',
      '',
      'Run `gh pr create --fill` once the suite is green.',
      'EOF',
    ].join('\n');
    expect(isGhPrCreate(cmd)).toBe(false);
  });

  it('does not fire on an unquoted heredoc body', () => {
    expect(isGhPrCreate(['cat > n.md <<EOF', 'gh pr create', 'EOF'].join('\n'))).toBe(false);
  });

  it('still fires on a real invocation that follows a heredoc', () => {
    expect(isGhPrCreate(['cat > n.md <<\'EOF\'', 'decoy', 'EOF', 'gh pr create --fill'].join('\n'))).toBe(true);
  });
});

// Regression (PR #74 review): the first stripHeredocs was neither quote-aware nor herestring-aware,
// so `<<` inside a quoted string — or the `<<` of a `<<<` herestring — set a terminator that never
// arrived, discarding every following line. That silently DISABLED this gate. False negatives here
// are the severe direction: the hook fails open with no signal.
describe('isGhPrCreate — a bogus heredoc delimiter must not swallow real commands', () => {
  it('does not treat a herestring as a heredoc', () => {
    expect(isGhPrCreate('cat <<< "hello"\ngh pr create --fill')).toBe(true);
  });

  it('does not treat << inside a quoted string as a heredoc', () => {
    expect(isGhPrCreate('git commit -m "fix: strip << heredoc bodies"\ngh pr create --fill')).toBe(true);
  });

  it('does not treat << inside single quotes as a heredoc', () => {
    expect(isGhPrCreate("echo 'a << b'\ngh pr create --fill")).toBe(true);
  });
});

// PR #74 review (#11): a leading VAR=value assignment made tokens[0] the assignment, not the binary,
// so every hook on this tokenizer was bypassed. Matters most for migration-guard, which gates
// production database pushes.
describe('isGhPrCreate — env-var prefixes must not hide the binary', () => {
  it('sees through a single assignment', () => {
    expect(isGhPrCreate('GH_TOKEN=x gh pr create --fill')).toBe(true);
  });

  it('sees through several assignments', () => {
    expect(isGhPrCreate('A=1 B=2 gh pr create --fill')).toBe(true);
  });

  it('does not mistake a bare assignment for a command', () => {
    expect(isGhPrCreate('GH_TOKEN=x')).toBe(false);
  });
});
