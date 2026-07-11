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
