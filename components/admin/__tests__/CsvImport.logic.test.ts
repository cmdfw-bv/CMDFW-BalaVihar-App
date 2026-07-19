import { describe, it, expect } from 'vitest';
import { csvImportPhase } from '../CsvImport.logic';

describe('csvImportPhase', () => {
  it('no fileName: dropzone phase', () => expect(csvImportPhase(undefined)).toBe('dropzone'));
  it('empty-string fileName: still dropzone (nothing chosen)', () => expect(csvImportPhase('')).toBe('dropzone'));
  it('a real fileName: summary phase', () => expect(csvImportPhase('roster.csv')).toBe('summary'));
});
