import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseCsv } from './lib/csv-parse';
import { guardianEmailHash } from './lib/hash';
import { getOrCreateAuthUser } from './lib/auth-provisioning';
import { runAutoActivationSweep } from './lib/role-sweep';
import {
  checkAdminRole,
  resolveSessionsAndClasses,
  upsertFamily,
  upsertStudentWithExternalId,
  upsertStudentByName,
  upsertEnrollment,
  linkGuardian,
  linkStudentUser,
} from './lib/db-ops';

const MAX_BODY_BYTES = 1_000_000; // 1 MB
const HS_GRADE_BANDS = new Set(['Gr9', 'Gr10', 'Gr11', 'Gr12']);

interface ImportResponse {
  status: 'complete' | 'partial' | 'failed';
  processed: number;
  skipped: number;
  db_committed: boolean;
  auth_pending: Array<{ row: number; column: string; reason: string }>;
  warnings: Array<{ row: number; reason: string }>;
  errors: Array<{ row: number; column: string; reason: string }>;
}

function json(statusCode: number, body: unknown) {
  return { statusCode, body: JSON.stringify(body) };
}

function extractCsvFromMultipart(body: string, boundary: string): string | null {
  const parts = body.split(`--${boundary}`);
  for (const part of parts) {
    if (part.includes('name="file"')) {
      const match = part.match(/\r\n\r\n([\s\S]*?)\r\n$/);
      if (match) return match[1];
      // Fallback: content after double newline
      const idx = part.indexOf('\r\n\r\n');
      if (idx !== -1) return part.slice(idx + 4).replace(/\r\n$/, '');
    }
  }
  return null;
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  const supabaseUrl = process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
  const client = createClient(supabaseUrl, serviceRoleKey);

  // ── Phase 0: Auth + role check ──────────────────────────────────────────────
  const authHeader = event.headers['authorization'] ?? event.headers['Authorization'] ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { reason: 'missing Authorization header' });

  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { reason: 'invalid or expired token' });

  const isAdmin = await checkAdminRole(client, authData.user.id);
  if (!isAdmin) return json(403, { reason: 'caller does not hold admin role' });

  // ── Body size guard ──────────────────────────────────────────────────────────
  // Netlify Dev (lambda-local) base64-encodes binary/multipart bodies.
  const encodedBody = event.body ?? '';
  const rawBody = event.isBase64Encoded
    ? Buffer.from(encodedBody, 'base64').toString('latin1')
    : encodedBody;
  if (rawBody.length > MAX_BODY_BYTES) {
    return json(400, { reason: 'file too large (max 1 MB)' });
  }

  // ── Extract CSV from multipart ───────────────────────────────────────────────
  const contentType = event.headers['content-type'] ?? event.headers['Content-Type'] ?? '';
  // Handle both quoted and unquoted boundary values
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary || !contentType.includes('multipart/form-data')) {
    return json(400, { reason: 'expected multipart/form-data with a "file" field' });
  }

  const csvText = extractCsvFromMultipart(rawBody, boundary);
  if (csvText === null) {
    return json(400, { reason: 'no "file" field found in multipart body' });
  }

  // ── Phase 1: Parse + validate ────────────────────────────────────────────────
  const { rows, errors: parseErrors, warnings } = parseCsv(csvText);

  if (parseErrors.length > 0) {
    const resp: ImportResponse = {
      status: 'failed',
      processed: 0,
      skipped: 0,
      db_committed: false,
      auth_pending: [],
      warnings,
      errors: parseErrors,
    };
    return json(422, resp);
  }

  if (rows.length === 0) {
    return json(200, { status: 'complete', processed: 0, skipped: 0, db_committed: true, auth_pending: [], warnings, errors: [] });
  }

  // Bulk resolve sessions and classes
  const sessionNames = [...new Set(rows.map(r => r.session_name))];
  const pairs = [...new Set(rows.map(r => `${r.session_name}:${r.grade_band}`))].map(k => {
    const [sessionName, ...rest] = k.split(':');
    return { sessionName, gradeBand: rest.join(':') };
  });
  const { sessionMap, classMap, errors: resolveErrors } = await resolveSessionsAndClasses(client, sessionNames, pairs);

  if (resolveErrors.length > 0) {
    const resp: ImportResponse = {
      status: 'failed',
      processed: 0,
      skipped: 0,
      db_committed: false,
      auth_pending: [],
      warnings,
      errors: resolveErrors.map(e => ({ row: 0, ...e })),
    };
    return json(422, resp);
  }

  // ── Phase 2: DB transaction ───────────────────────────────────────────────────
  // Group rows by family_ref
  const familyGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = familyGroups.get(row.family_ref) ?? [];
    group.push(row);
    familyGroups.set(row.family_ref, group);
  }

  // Track student db ids for Phase 3
  const studentDbIds = new Map<string, string>(); // external_id|family+name key → db id
  const familyDbIds = new Map<string, string>();  // family_ref → db id
  let processed = 0;
  let skipped = 0;

  try {
    for (const [familyRef, groupRows] of familyGroups) {
      const representative = groupRows[0];
      const hash = guardianEmailHash(representative.guardian_1_email);
      const familyId = await upsertFamily(client, representative.family_label, hash);
      familyDbIds.set(familyRef, familyId);

      for (const row of groupRows) {
        const classKey = `${row.session_name}:${row.grade_band}`;
        const classId = classMap.get(classKey)!;
        const sessionId = sessionMap.get(row.session_name)!;

        let studentId: string;
        if (row.student_external_id) {
          studentId = await upsertStudentWithExternalId(client, {
            family_id: familyId,
            first_name: row.student_first_name,
            last_name: row.student_last_name,
            grade_level: row.grade_band,
            external_member_id: row.student_external_id,
          });
        } else {
          studentId = await upsertStudentByName(client, {
            family_id: familyId,
            first_name: row.student_first_name,
            last_name: row.student_last_name,
            grade_level: row.grade_band,
          });
        }

        const enrollmentResult = await upsertEnrollment(client, { student_id: studentId, class_id: classId, session_id: sessionId });
        if (enrollmentResult === null) {
          skipped++;
        } else {
          processed++;
        }

        const rowKey = row.student_external_id || `${familyId}:${row.student_first_name}:${row.student_last_name}`;
        studentDbIds.set(rowKey, studentId);
      }
    }
  } catch (err) {
    return json(500, { status: 'failed', reason: 'DB write error', db_committed: false, errors: [{ row: 0, column: '', reason: String(err) }] });
  }

  // ── Phase 3: Auth provisioning (post-commit) ──────────────────────────────────
  const auth_pending: Array<{ row: number; column: string; reason: string }> = [];
  let rowNum = 2;

  const processedEmails = new Map<string, string>(); // email → user_id

  for (const [familyRef, groupRows] of familyGroups) {
    const familyId = familyDbIds.get(familyRef)!;
    const representative = groupRows[0];

    // Process all guardian emails for this family
    const guardianCols = [
      { email: representative.guardian_1_email, firstName: representative.guardian_1_first_name, lastName: representative.guardian_1_last_name, col: 'guardian_1_email' },
      ...(representative.guardian_2_email ? [{
        email: representative.guardian_2_email,
        firstName: representative.guardian_2_first_name,
        lastName: representative.guardian_2_last_name,
        col: 'guardian_2_email',
      }] : []),
    ];

    for (const g of guardianCols) {
      if (processedEmails.has(g.email)) {
        const existingId = processedEmails.get(g.email)!;
        try { await linkGuardian(client, familyId, existingId); } catch { /* already linked */ }
        continue;
      }
      try {
        const userId = await getOrCreateAuthUser(supabaseUrl, serviceRoleKey, g.email, g.firstName, g.lastName);
        processedEmails.set(g.email, userId);
        await linkGuardian(client, familyId, userId);
      } catch {
        auth_pending.push({ row: rowNum, column: g.col, reason: `auth provisioning failed (re-import to retry)` });
      }
    }

    for (const row of groupRows) {
      const rowKey = row.student_external_id || `${familyId}:${row.student_first_name}:${row.student_last_name}`;
      const studentId = studentDbIds.get(rowKey);

      if (studentId && HS_GRADE_BANDS.has(row.grade_band) && row.student_email) {
        try {
          const userId = await getOrCreateAuthUser(supabaseUrl, serviceRoleKey, row.student_email, row.student_first_name, row.student_last_name);
          await linkStudentUser(client, studentId, userId);
        } catch {
          auth_pending.push({ row: rowNum, column: 'student_email', reason: `auth provisioning failed (re-import to retry)` });
        }
      }
      rowNum++;
    }
  }

  await runAutoActivationSweep(client);

  const status = auth_pending.length === 0 ? 'complete' : 'partial';
  const statusCode = auth_pending.length === 0 ? 200 : 207;

  if (status === 'complete') {
    console.log(JSON.stringify({ event: 'csv_import_complete', session: [...sessionMap.keys()].join(','), processed_count: processed, admin_user_id: authData.user.id }));
  }

  const resp: ImportResponse = { status, processed, skipped, db_committed: true, auth_pending, warnings, errors: [] };
  return json(statusCode, resp);
};
