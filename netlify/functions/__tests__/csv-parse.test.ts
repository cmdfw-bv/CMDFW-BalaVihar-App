import { describe, it, expect } from 'vitest';
import { parseCsv } from '../lib/csv-parse';

const HEADER =
  'family_ref,family_label,guardian_1_first_name,guardian_1_last_name,' +
  'guardian_1_email,guardian_2_first_name,guardian_2_last_name,guardian_2_email,' +
  'student_first_name,student_last_name,student_external_id,grade_band,' +
  'session_name,student_email';

function makeRow(overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    family_ref: 'F001',
    family_label: 'Test Family',
    guardian_1_first_name: 'Priya',
    guardian_1_last_name: 'Patel',
    guardian_1_email: 'priya@example.test',
    guardian_2_first_name: '',
    guardian_2_last_name: '',
    guardian_2_email: '',
    student_first_name: 'Arjun',
    student_last_name: 'Patel',
    student_external_id: 'EXT-001',
    grade_band: 'Gr5',
    session_name: 'F3',
    student_email: '',
  };
  const row = { ...defaults, ...overrides };
  return Object.values(row).join(',');
}

describe('parseCsv', () => {
  it('parses a valid single-row CSV', () => {
    const result = parseCsv(`${HEADER}\n${makeRow()}`);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].family_ref).toBe('F001');
    expect(result.rows[0].guardian_1_email).toBe('priya@example.test');
    expect(result.rows[0].grade_band).toBe('Gr5');
  });

  it('returns empty rows for header-only CSV', () => {
    const result = parseCsv(HEADER);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
  });

  it('strips a UTF-8 BOM before parsing', () => {
    const result = parseCsv(`﻿${HEADER}\n${makeRow()}`);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });

  it('errors on missing required column in header', () => {
    const badHeader = HEADER.replace(',grade_band', '');
    const result = parseCsv(`${badHeader}\n`);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].column).toBe('grade_band');
    expect(result.rows).toHaveLength(0);
  });

  it('header column matching is case-insensitive', () => {
    const upperHeader = HEADER.toUpperCase();
    const result = parseCsv(`${upperHeader}\n${makeRow()}`);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });

  it('errors on unknown grade_band value', () => {
    const result = parseCsv(`${HEADER}\n${makeRow({ grade_band: 'Gr13' })}`);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].column).toBe('grade_band');
  });

  it('errors on invalid guardian_1_email format', () => {
    const result = parseCsv(`${HEADER}\n${makeRow({ guardian_1_email: 'not-an-email' })}`);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].column).toBe('guardian_1_email');
  });

  it('errors when guardian_2_email present but guardian_2_first_name absent', () => {
    const result = parseCsv(
      `${HEADER}\n${makeRow({ guardian_2_email: 'other@example.test', guardian_2_first_name: '' })}`
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].column).toBe('guardian_2_first_name');
  });

  it('errors when two rows share family_ref but have different guardian_1_email', () => {
    const row1 = makeRow({ family_ref: 'F001', guardian_1_email: 'a@example.test' });
    const row2 = makeRow({ family_ref: 'F001', guardian_1_email: 'b@example.test' });
    const result = parseCsv(`${HEADER}\n${row1}\n${row2}`);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.column === 'guardian_1_email')).toBe(true);
  });

  it('warns (not errors) when student_email is set for a non-HS grade', () => {
    const result = parseCsv(
      `${HEADER}\n${makeRow({ grade_band: 'Gr3', student_email: 'kid@example.test' })}`
    );
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].row).toBe(2);
  });

  it('collects all errors across rows before returning', () => {
    const row1 = makeRow({ family_ref: 'F001', grade_band: 'Gr99' });
    const row2 = makeRow({ family_ref: 'F002', guardian_1_email: 'bad' });
    const result = parseCsv(`${HEADER}\n${row1}\n${row2}`);
    expect(result.errors).toHaveLength(2);
  });
});
