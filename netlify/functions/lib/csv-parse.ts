export interface ParsedRow {
  family_ref: string;
  family_label: string;
  guardian_1_first_name: string;
  guardian_1_last_name: string;
  guardian_1_email: string;
  guardian_2_first_name: string;
  guardian_2_last_name: string;
  guardian_2_email: string;
  student_first_name: string;
  student_last_name: string;
  student_external_id: string;
  grade_band: string;
  session_name: string;
  student_email: string;
}

export interface CsvError {
  row: number;
  column: string;
  reason: string;
}

export interface CsvWarning {
  row: number;
  reason: string;
}

export interface CsvParseResult {
  rows: ParsedRow[];
  errors: CsvError[];
  warnings: CsvWarning[];
}

const REQUIRED_COLUMNS: (keyof ParsedRow)[] = [
  'family_ref', 'family_label',
  'guardian_1_first_name', 'guardian_1_last_name', 'guardian_1_email',
  'guardian_2_first_name', 'guardian_2_last_name', 'guardian_2_email',
  'student_first_name', 'student_last_name', 'student_external_id',
  'grade_band', 'session_name', 'student_email',
];

const VALID_GRADE_BANDS = new Set([
  'Shishu Vihaar', 'Gr1', 'Gr2', 'Gr3', 'Gr4', 'Gr5', 'Gr6',
  'Gr7', 'Gr8', 'Gr9', 'Gr10', 'Gr11', 'Gr12',
]);

const HS_GRADE_BANDS = new Set(['Gr9', 'Gr10', 'Gr11', 'Gr12']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseLines(raw: string): string[] {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function parseCsv(raw: string): CsvParseResult {
  const errors: CsvError[] = [];
  const warnings: CsvWarning[] = [];
  const rows: ParsedRow[] = [];

  // Strip UTF-8 BOM if present
  const cleaned = raw.startsWith('﻿') ? raw.slice(1) : raw;

  const lines = parseLines(cleaned).filter(l => l.trim() !== '');
  if (lines.length === 0) return { rows, errors, warnings };

  // Parse and validate header
  const headerFields = splitCsvRow(lines[0]).map(f => f.trim().toLowerCase());
  const missingColumns = REQUIRED_COLUMNS.filter(
    col => !headerFields.includes(col.toLowerCase())
  );
  if (missingColumns.length > 0) {
    for (const col of missingColumns) {
      errors.push({ row: 1, column: col, reason: `required column "${col}" missing from header` });
    }
    return { rows, errors, warnings };
  }

  const colIndex = (col: string): number =>
    headerFields.indexOf(col.toLowerCase());

  const getField = (fields: string[], col: keyof ParsedRow): string =>
    (fields[colIndex(col)] ?? '').trim();

  // Track guardian email per family_ref for consistency check
  const familyRefGuardianEmail = new Map<string, string>();

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const fields = splitCsvRow(lines[i]);
    const row: ParsedRow = {
      family_ref:            getField(fields, 'family_ref'),
      family_label:          getField(fields, 'family_label'),
      guardian_1_first_name: getField(fields, 'guardian_1_first_name'),
      guardian_1_last_name:  getField(fields, 'guardian_1_last_name'),
      guardian_1_email:      getField(fields, 'guardian_1_email'),
      guardian_2_first_name: getField(fields, 'guardian_2_first_name'),
      guardian_2_last_name:  getField(fields, 'guardian_2_last_name'),
      guardian_2_email:      getField(fields, 'guardian_2_email'),
      student_first_name:    getField(fields, 'student_first_name'),
      student_last_name:     getField(fields, 'student_last_name'),
      student_external_id:   getField(fields, 'student_external_id'),
      grade_band:            getField(fields, 'grade_band'),
      session_name:          getField(fields, 'session_name'),
      student_email:         getField(fields, 'student_email'),
    };

    // Required field checks
    const requiredFields: (keyof ParsedRow)[] = [
      'family_ref', 'family_label',
      'guardian_1_first_name', 'guardian_1_last_name', 'guardian_1_email',
      'student_first_name', 'student_last_name', 'grade_band', 'session_name',
    ];
    for (const f of requiredFields) {
      if (!row[f]) {
        errors.push({ row: rowNum, column: f, reason: `"${f}" is required` });
      }
    }

    // grade_band validation
    if (row.grade_band && !VALID_GRADE_BANDS.has(row.grade_band)) {
      errors.push({
        row: rowNum,
        column: 'grade_band',
        reason: `unknown grade_band "${row.grade_band}"; allowed: ${[...VALID_GRADE_BANDS].join(', ')}`,
      });
    }

    // Email format checks
    for (const col of ['guardian_1_email', 'guardian_2_email', 'student_email'] as const) {
      const val = row[col];
      if (val && !EMAIL_RE.test(val)) {
        errors.push({ row: rowNum, column: col, reason: `invalid email format in "${col}"` });
      }
    }

    // guardian_2_email present but name absent
    if (row.guardian_2_email && !row.guardian_2_first_name) {
      errors.push({
        row: rowNum,
        column: 'guardian_2_first_name',
        reason: '"guardian_2_first_name" required when "guardian_2_email" is set',
      });
    }

    // family_ref / guardian_1_email consistency
    if (row.family_ref && row.guardian_1_email) {
      const known = familyRefGuardianEmail.get(row.family_ref);
      if (known === undefined) {
        familyRefGuardianEmail.set(row.family_ref, row.guardian_1_email);
      } else if (known !== row.guardian_1_email) {
        errors.push({
          row: rowNum,
          column: 'guardian_1_email',
          reason: `family_ref "${row.family_ref}" has inconsistent guardian_1_email (expected "${known}")`,
        });
      }
    }

    // student_email for non-HS grade → warning
    if (row.student_email && row.grade_band && !HS_GRADE_BANDS.has(row.grade_band)) {
      warnings.push({
        row: rowNum,
        reason: `student_email ignored for grade_band "${row.grade_band}" (only Gr9–Gr12 get student accounts)`,
      });
    }

    rows.push(row);
  }

  return { rows, errors, warnings };
}
