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
}));

// Mock role-sweep so handler tests don't touch the real sweep logic
vi.mock('../lib/role-sweep', () => ({
  runAutoActivationSweep: vi.fn(),
}));

import * as dbOps from '../lib/db-ops';
import * as roleSweep from '../lib/role-sweep';
import { handler } from '../user-role-sweep';

function makeEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer valid-token' },
    body: null,
    isBase64Encoded: false,
    rawUrl: '/api/user-role-sweep',
    rawQuery: '',
    path: '/api/user-role-sweep',
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    multiValueHeaders: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('user-role-sweep handler', () => {
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
    expect(roleSweep.runAutoActivationSweep).not.toHaveBeenCalled();
  });

  it('returns 200 with the sweep result when caller is admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.mocked(dbOps.checkAdminRole).mockResolvedValue(true);
    vi.mocked(roleSweep.runAutoActivationSweep).mockResolvedValue({ granted_parent: 2, granted_student: 1 });

    const res = await handler(makeEvent(), {} as never) as HandlerResponse;

    expect(roleSweep.runAutoActivationSweep).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed).toEqual({ granted_parent: 2, granted_student: 1 });
  });

  it('forwards source_errors in the 200 body when the sweep reports a partial source-read failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    vi.mocked(dbOps.checkAdminRole).mockResolvedValue(true);
    vi.mocked(roleSweep.runAutoActivationSweep).mockResolvedValue({
      granted_parent: 0,
      granted_student: 1,
      source_errors: ['family_members: connection reset'],
    });

    const res = await handler(makeEvent(), {} as never) as HandlerResponse;

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.source_errors).toEqual(['family_members: connection reset']);
  });
});
