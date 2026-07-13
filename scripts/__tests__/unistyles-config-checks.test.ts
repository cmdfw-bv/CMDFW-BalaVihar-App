import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findMissingUnistylesConfigImport } = require('../_unistyles-config-checks.js');

describe('findMissingUnistylesConfigImport', () => {
  it('flags a component with StyleSheet.create but no direct config import', () => {
    const source = `
import { StyleSheet } from "react-native-unistyles";
const styles = StyleSheet.create((theme) => ({ box: { padding: theme.space.sm } }));
`;
    expect(findMissingUnistylesConfigImport('components/Widget.tsx', source)).toBe(true);
  });

  it('passes when the file imports the config module directly', () => {
    const source = `
import "../lib/unistyles";
import { StyleSheet } from "react-native-unistyles";
const styles = StyleSheet.create((theme) => ({ box: { padding: theme.space.sm } }));
`;
    expect(findMissingUnistylesConfigImport('components/Widget.tsx', source)).toBe(false);
  });

  it('resolves the deeper relative path from a nested route group correctly', () => {
    const source = `
import "../../lib/unistyles";
import { StyleSheet } from "react-native-unistyles";
const styles = StyleSheet.create((theme) => ({ box: { padding: theme.space.sm } }));
`;
    expect(findMissingUnistylesConfigImport('app/(tabs)/_layout.tsx', source)).toBe(false);
  });

  it('ignores files with no StyleSheet.create call', () => {
    expect(findMissingUnistylesConfigImport('lib/util.ts', 'export const x = 1;')).toBe(false);
  });

  it('does not flag lib/unistyles.ts itself', () => {
    const source = `
import { StyleSheet } from "react-native-unistyles";
StyleSheet.configure({ themes: {}, breakpoints: {} });
`;
    expect(findMissingUnistylesConfigImport('lib/unistyles.ts', source)).toBe(false);
  });
});
