import type { AppTheme } from '../../lib/theme';

// Several kit components resolve dotted token-path strings (e.g. "statusRamp.presentSoft")
// from their logic modules against theme.colors at render time, instead of importing theme
// inside a .logic.ts (which would break the .logic.ts files' zero-RN-dependency purity —
// pure modules must stay importable under the vitest RN mock).
export function colorAtPath(colors: AppTheme['colors'], path: string): string {
  // `Button.tsx`'s BUTTON_VARIANTS uses the literal token key "transparent" for borderless/
  // bg-less variants — it isn't a path into `theme.colors`, so short-circuit before the walk.
  if (path === 'transparent') return 'transparent';
  return path.split('.').reduce<any>((node, key) => node?.[key], colors) ?? colors.ink;
}
