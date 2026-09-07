import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
// CommonJS pure-helper module, same shape as _unistyles-config-checks.js.
import { findUnguardedSignOut } from '../_signout-delegation-checks.js';

const REPO_ROOT = join(__dirname, '..', '..');

// Why this file exists, and why it is a source scan rather than a render test:
//
// `runSignOut` and `performSignOut` are both well covered, but neither obliges a screen to call
// them. Reverting `app/no-role.tsx`'s handler to the pre-fix `void supabase.auth.signOut();`
// leaves the entire suite green — measured, 73 files / 485 tests, `tsc` exit 0, `expo lint`
// exit 0 (an unused-var *warning* only). So the extraction alone does not guard the bug; the
// reviewer's round-3 suggestion stopped one level short of its own goal.
//
// A render test is not available: the repo has no testing-library/jsdom/react-test-renderer
// dependency, `react-native` is aliased to a four-line stub, and `vitest.config.ts`'s `include`
// does not cover `app/**` at all. The established pattern for an invariant the normal suite
// structurally cannot reach is a pure source-text predicate plus unit tests —
// `scripts/_unistyles-config-checks.js` (issue #29's static-export bug) is the precedent this
// mirrors. It rides the existing `app-tests` CI job; no new workflow.

describe('findUnguardedSignOut', () => {
  it('flags a screen that calls supabase.auth.signOut() without routing through runSignOut', () => {
    const source = `
      const onSignOut = () => {
        setBusy(true);
        void supabase.auth.signOut();
        setBusy(false);
      };`;

    expect(findUnguardedSignOut('app/no-role.tsx', source)).toBe(true);
  });

  it('accepts a screen that hands signOut to runSignOut', () => {
    const source = `
      import { runSignOut } from "../lib/auth/runSignOut";
      const onSignOut = () => {
        void runSignOut(() => supabase.auth.signOut(), { busy: setBusy, failed: setFailed });
      };`;

    expect(findUnguardedSignOut('app/no-role.tsx', source)).toBe(false);
  });

  it('ignores files that never sign out', () => {
    expect(findUnguardedSignOut('app/index.tsx', 'export default function Home() {}')).toBe(false);
  });

  it('exempts lib/auth, where the wrappers and SessionProvider legitimately call it directly', () => {
    const source = 'async signOut() { await supabase.auth.signOut(); }';

    expect(findUnguardedSignOut('lib/auth/SessionProvider.tsx', source)).toBe(false);
  });

  it('does not count a mention inside a comment as a call', () => {
    const source = `
      // Calls supabase directly rather than SessionProvider's signOut
      // (\`await supabase.auth.signOut();\`). Deliberately NOT routed through the provider.
      export default function Screen() { return null; }`;

    expect(findUnguardedSignOut('app/no-role.tsx', source)).toBe(false);
  });
});

describe('the shipped client tree', () => {
  const collect = (dir: string, acc: string[] = []): string[] => {
    let entries;
    try {
      entries = readdirSync(join(REPO_ROOT, dir), { withFileTypes: true });
    } catch {
      return acc;
    }
    for (const entry of entries) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        collect(rel, acc);
      } else if (/\.tsx?$/.test(entry.name)) {
        acc.push(rel);
      }
    }
    return acc;
  };

  it('routes every sign-out outside lib/auth through the guarded wrapper', () => {
    const files = ['app', 'components', 'features'].flatMap((d) => collect(d));
    const offenders = files.filter((rel) =>
      findUnguardedSignOut(rel.split(sep).join('/'), readFileSync(join(REPO_ROOT, rel), 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('actually sees app/no-role.tsx (guards against the scan silently matching nothing)', () => {
    const files = ['app', 'components', 'features'].flatMap((d) => collect(d));

    expect(files).toContain('app/no-role.tsx');
  });
});
