import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HandlerEvent, HandlerResponse } from '@netlify/functions';

// Mock the Supabase createClient so the handler doesn't need real env vars
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Shared mutable mock — tests mutate this per scenario
const mockGetUser = vi.fn();
const mockSupabaseClient = { auth: { getUser: mockGetUser } };

// Mock db-ops so handler tests stay pure (no real DB)
vi.mock('../lib/db-ops', () => ({
  checkAdminRole: vi.fn(),
  resolveSessionsAndClasses: vi.fn(),
  upsertFamily: vi.fn(),
  upsertStudentWithExternalId: vi.fn(),
  upsertStudentByName: vi.fn(),
  upsertEnrollment: vi.fn(),
  linkGuardian: vi.fn(),
  linkStudentUser: vi.fn(),
}));

import * as dbOps from '../lib/db-ops';
import { handler } from '../csv-import';

const HEADER =
  'family_ref,family_label,guardian_1_first_name,guardian_1_last_name,' +
  'guardian_1_email,guardian_2_first_name,guardian_2_last_name,guardian_2_email,' +
  'student_first_name,student_last_name,student_external_id,grade_band,' +
  'session_name,student_email';

const VALID_ROW =
  'F001,Test Family,Priya,Patel,priya@example.test,,,,' +
  'Arjun,Patel,EXT-001,Gr5,F3,';

const VALID_CSV = `${HEADER}\n${VALID_ROW}`;

function makeEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer valid-token' },
    body: null,
    isBase64Encoded: false,
    rawUrl: '/api/csv-import',
    rawQuery: '',
    path: '/api/csv-import',
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    multiValueHeaders: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('csv-import handler', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await handler(makeEvent({ headers: {} }), {} as never) as HandlerResponse;
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when supabase.auth.getUser returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } });
    const res = await handler(makeEvent(), {} as never) as HandlerResponse;
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when caller does not have admin role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.mocked(dbOps.checkAdminRole).mockResolvedValue(false);
    const res = await handler(makeEvent(), {} as never) as HandlerResponse;
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when body is not multipart', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.mocked(dbOps.checkAdminRole).mockResolvedValue(true);
    const res = await handler(
      makeEvent({ headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: '{}' }),
      {} as never
    ) as HandlerResponse;
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when file exceeds 1 MB', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.mocked(dbOps.checkAdminRole).mockResolvedValue(true);
    const bigBody = 'x'.repeat(1_100_000);
    const res = await handler(
      makeEvent({
        headers: { authorization: 'Bearer t', 'content-type': 'multipart/form-data; boundary=----bound' },
        body: bigBody,
      }),
      {} as never
    ) as HandlerResponse;
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).reason).toMatch(/too large/i);
  });

  it('returns 422 with per-row errors on validation failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.mocked(dbOps.checkAdminRole).mockResolvedValue(true);

    const badCsv = `${HEADER}\nF001,Fam,P,P,priya@example.test,,,,Arjun,Patel,EXT-001,Gr99,F3,`;
    const boundary = '----testbound';
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n${badCsv}\r\n--${boundary}--`;

    const res = await handler(
      makeEvent({
        headers: { authorization: 'Bearer t', 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      }),
      {} as never
    ) as HandlerResponse;
    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.status).toBe('failed');
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.db_committed).toBe(false);
  });

  it('returns 200 complete when all phases succeed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.mocked(dbOps.checkAdminRole).mockResolvedValue(true);
    vi.mocked(dbOps.resolveSessionsAndClasses).mockResolvedValue({
      sessionMap: new Map([['F3', 'ses1']]),
      classMap: new Map([['F3:Gr5', 'cls1']]),
      errors: [],
    });
    vi.mocked(dbOps.upsertFamily).mockResolvedValue('fam1');
    vi.mocked(dbOps.upsertStudentWithExternalId).mockResolvedValue('stu1');
    vi.mocked(dbOps.upsertEnrollment).mockResolvedValue('enr1');
    vi.mocked(dbOps.linkGuardian).mockResolvedValue(undefined);

    // Stub fetch for guardian auth provisioning (generateLink raw HTTP call)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'auth-u1', email: 'priya@example.test' }),
    }));

    const boundary = '----testbound';
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n${VALID_CSV}\r\n--${boundary}--`;

    const res = await handler(
      makeEvent({
        headers: { authorization: 'Bearer t', 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      }),
      {} as never
    ) as HandlerResponse;
    vi.unstubAllGlobals();
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.status).toBe('complete');
    expect(parsed.db_committed).toBe(true);
    expect(parsed.auth_pending).toHaveLength(0);
  });

  it('returns 207 partial when auth provisioning partially fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.mocked(dbOps.checkAdminRole).mockResolvedValue(true);
    vi.mocked(dbOps.resolveSessionsAndClasses).mockResolvedValue({
      sessionMap: new Map([['F3', 'ses1']]),
      classMap: new Map([['F3:Gr5', 'cls1']]),
      errors: [],
    });
    vi.mocked(dbOps.upsertFamily).mockResolvedValue('fam1');
    vi.mocked(dbOps.upsertStudentWithExternalId).mockResolvedValue('stu1');
    vi.mocked(dbOps.upsertEnrollment).mockResolvedValue('enr1');

    // Stub fetch to simulate generateLink failure
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ msg: 'timeout' }),
    }));

    const boundary = '----testbound';
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n${VALID_CSV}\r\n--${boundary}--`;

    const res = await handler(
      makeEvent({
        headers: { authorization: 'Bearer t', 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      }),
      {} as never
    ) as HandlerResponse;
    vi.unstubAllGlobals();
    expect(res.statusCode).toBe(207);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.status).toBe('partial');
    expect(parsed.auth_pending.length).toBeGreaterThan(0);
    expect(parsed.db_committed).toBe(true);
  });
});
