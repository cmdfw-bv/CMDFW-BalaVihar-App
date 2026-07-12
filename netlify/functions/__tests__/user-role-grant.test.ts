import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HandlerEvent, HandlerResponse } from '@netlify/functions';

// Mock the Supabase createClient so the handler doesn't need real env vars
// (same idiom as csv-import.test.ts / user-role-sweep.test.ts).
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Shared mutable mocks — tests mutate these per scenario.
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockSupabaseClient = { auth: { getUser: mockGetUser }, from: mockFrom, rpc: mockRpc };

// Mock auth-provisioning so handler tests stay pure (no real fetch/DB).
vi.mock('../lib/auth-provisioning', () => ({
  getOrCreateAuthUser: vi.fn(),
  getUserByEmail: vi.fn(),
}));

// Partially mock role-tiering: keep the REAL tierOf/isGrantAllowed/ROLE_SCOPE_TYPE logic
// (tests rely on real tiering math end-to-end) but wrap isGrantAllowed in a vi.fn() so
// one scenario (revoke-by-id noop) can assert it was never called.
vi.mock('../lib/role-tiering', async () => {
  const actual = await vi.importActual<typeof import('../lib/role-tiering')>('../lib/role-tiering');
  return {
    ...actual,
    isGrantAllowed: vi.fn(actual.isGrantAllowed),
  };
});

import * as authProvisioning from '../lib/auth-provisioning';
import * as roleTiering from '../lib/role-tiering';
import { handler } from '../user-role-grant';

const CALLER_ID = 'caller-1';
const TARGET_ID = 'target-1';
const SESSION_UUID = '11111111-1111-1111-1111-111111111111';
const OTHER_SESSION_UUID = '99999999-9999-9999-9999-999999999999';
const CLASS_UUID = '22222222-2222-2222-2222-222222222222';
const OTHER_CLASS_UUID = '33333333-3333-3333-3333-333333333333';
const TEST_EMAIL = 'grant-target@example.test';

function makeEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer valid-token' },
    body: null,
    isBase64Encoded: false,
    rawUrl: '/api/user-role-grant',
    rawQuery: '',
    path: '/api/user-role-grant',
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    multiValueHeaders: {},
    ...overrides,
  };
}

function body(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

// Generic Supabase query-builder chain mock: every chain method (select/eq/is/insert/
// delete/update) returns the same chain object, so any depth of chaining is supported
// regardless of exact shape. Terminal resolution happens either via an explicit
// `.maybeSingle()` call, or by awaiting the chain itself directly (it's thenable) —
// covering both the `.maybeSingle()`-terminated lookups and the bare-await count/delete
// queries in the handler.
type TerminalResult = { data?: unknown; error?: unknown; count?: number };

function makeChain(terminal: TerminalResult = { data: null, error: null }) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'is', 'insert', 'delete', 'update']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
  chain.then = (resolve: (v: TerminalResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

/** Queues the Phase 0 caller-row lookup chain and stubs auth.getUser to succeed. */
function setupCaller(role: string, scopeId: string | null = null) {
  mockGetUser.mockResolvedValue({ data: { user: { id: CALLER_ID } }, error: null });
  mockFrom.mockReturnValueOnce(makeChain({ data: { role, scope_type: 'x', scope_id: scopeId }, error: null }));
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockRpc.mockReset();
  vi.mocked(authProvisioning.getOrCreateAuthUser).mockReset();
  vi.mocked(authProvisioning.getUserByEmail).mockReset();
  vi.mocked(roleTiering.isGrantAllowed).mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.mocked(console.log).mockClear();
});

describe('user-role-grant handler', () => {
  // ── Phase 0: auth + tiering lookup ──────────────────────────────────────────
  describe('Phase 0 — auth + tiering lookup', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const res = (await handler(makeEvent({ headers: {} }), {} as never)) as HandlerResponse;
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when supabase.auth.getUser errors', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } });
      const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 "caller holds no active role" when caller has no active user_roles row', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: CALLER_ID } }, error: null });
      mockFrom.mockReturnValueOnce(makeChain({ data: null, error: null }));

      const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body as string)).toEqual({ reason: 'caller holds no active role' });
    });

    it.each(['student', 'parent', 'teacher'])(
      'returns 403 "caller\'s active role cannot grant/revoke" when caller\'s active role is %s (tier 0)',
      async role => {
        setupCaller(role);
        const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body as string)).toEqual({ reason: "caller's active role cannot grant/revoke" });
      }
    );
  });

  // ── Phase 1: request validation ─────────────────────────────────────────────
  describe('Phase 1 — request validation', () => {
    it.each([undefined, 'bogus'])('returns 422 when action is missing/invalid (%s)', async action => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({ body: body({ action, role: 'student', scope_type: 'org', target_user_id: TARGET_ID }) }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it.each([undefined, 'wizard'])('returns 422 when role is missing/invalid (%s)', async role => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role, scope_type: 'org', target_user_id: TARGET_ID }) }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it.each([undefined, 'planet'])('returns 422 when scope_type is missing/invalid (%s)', async scope_type => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type, target_user_id: TARGET_ID }) }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when scope_type does not match ROLE_SCOPE_TYPE[role] (teacher + org)', async () => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'teacher', scope_type: 'org', target_user_id: TARGET_ID }) }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 when scope_type is "org" and scope_id is a non-null value', async () => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({
          body: body({ action: 'grant', role: 'admin', scope_type: 'org', scope_id: SESSION_UUID, target_user_id: TARGET_ID }),
        }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it.each([undefined, 'not-a-uuid'])(
      'returns 422 when scope_type is "class" and scope_id is missing/not a UUID (%s)',
      async scope_id => {
        setupCaller('admin');
        const res = (await handler(
          makeEvent({ body: body({ action: 'grant', role: 'teacher', scope_type: 'class', scope_id, target_user_id: TARGET_ID }) }),
          {} as never
        )) as HandlerResponse;
        expect(res.statusCode).toBe(422);
      }
    );

    it('grant: returns 422 when both target_email and target_user_id are given', async () => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({
          body: body({ action: 'grant', role: 'student', scope_type: 'org', target_email: TEST_EMAIL, target_user_id: TARGET_ID }),
        }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it('grant: returns 422 when neither target_email nor target_user_id is given', async () => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org' }) }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it('revoke: returns 422 when both user_roles_id and a tuple (target_email) are given', async () => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({
          body: body({ action: 'revoke', role: 'student', scope_type: 'org', user_roles_id: 'row-1', target_email: TEST_EMAIL }),
        }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });

    it('revoke: returns 422 when neither user_roles_id nor a target is given', async () => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({ body: body({ action: 'revoke', role: 'student', scope_type: 'org' }) }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(422);
    });
  });

  // ── Phase 2: target resolution ──────────────────────────────────────────────
  describe('Phase 2 — target resolution', () => {
    it('revoke by user_roles_id that does not exist → 200 noop, isGrantAllowed not called (no existence leak)', async () => {
      setupCaller('admin');
      mockFrom.mockReturnValueOnce(makeChain({ data: null, error: null })); // by-id lookup -> null

      const res = (await handler(
        makeEvent({ body: body({ action: 'revoke', role: 'student', scope_type: 'org', user_roles_id: 'row-missing' }) }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'noop' });
      expect(roleTiering.isGrantAllowed).not.toHaveBeenCalled();
    });

    it('revoke by tuple where getUserByEmail resolves null → 200 noop', async () => {
      setupCaller('admin');
      vi.mocked(authProvisioning.getUserByEmail).mockResolvedValue(null);

      const res = (await handler(
        makeEvent({ body: body({ action: 'revoke', role: 'student', scope_type: 'org', target_email: TEST_EMAIL }) }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'noop' });
    });

    it('revoke by tuple where the user exists but the exact (role, scope_type, scope_id) row does not → 200 noop', async () => {
      setupCaller('admin');
      vi.mocked(authProvisioning.getUserByEmail).mockResolvedValue(TARGET_ID);
      mockFrom.mockReturnValueOnce(makeChain({ data: null, error: null })); // tuple lookup -> null

      const res = (await handler(
        makeEvent({ body: body({ action: 'revoke', role: 'student', scope_type: 'org', target_email: TEST_EMAIL }) }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'noop' });
    });

    it('revoke by tuple where getUserByEmail throws → 500, no unhandled exception, no PII in the log line', async () => {
      setupCaller('admin');
      vi.mocked(authProvisioning.getUserByEmail).mockRejectedValue(new Error('admin users lookup failed (500)'));

      const res = (await handler(
        makeEvent({ body: body({ action: 'revoke', role: 'student', scope_type: 'org', target_email: TEST_EMAIL }) }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body as string)).toEqual({ reason: 'auth lookup failed' });
      for (const call of vi.mocked(console.log).mock.calls) {
        expect(call[0] as string).not.toContain(TEST_EMAIL);
      }
    });
  });

  // ── Phase 3: tiering + scope containment ────────────────────────────────────
  describe('Phase 3 — tiering + scope containment', () => {
    it('returns 403 on a tiering violation (coordinator, tier 1, granting role:coordinator to another user)', async () => {
      setupCaller('coordinator', SESSION_UUID);
      const res = (await handler(
        makeEvent({
          body: body({ action: 'grant', role: 'coordinator', scope_type: 'session', scope_id: OTHER_SESSION_UUID, target_user_id: TARGET_ID }),
        }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body as string)).toEqual({ reason: 'tiering violation' });
    });

    it('returns 403 on self-escalation (caller admin, target_user_id === caller, role:admin)', async () => {
      setupCaller('admin');
      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'admin', scope_type: 'org', target_user_id: CALLER_ID }) }),
        {} as never
      )) as HandlerResponse;
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body as string)).toEqual({ reason: 'tiering violation' });
    });

    it('self-target of a strictly-lower-tier role succeeds (caller bv_coordinator, self-target role:coordinator) → 200 granted', async () => {
      setupCaller('bv_coordinator', null);
      mockFrom.mockReturnValueOnce(makeChain({ count: 0 })); // phase 4 count
      mockRpc.mockResolvedValue({ data: 'new-row-id', error: null });

      const res = (await handler(
        makeEvent({
          body: body({ action: 'grant', role: 'coordinator', scope_type: 'session', scope_id: SESSION_UUID, target_user_id: CALLER_ID }),
        }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'granted', user_roles_id: 'new-row-id' });
    });

    it('coordinator grants role:teacher for a class outside their own active session → 403', async () => {
      setupCaller('coordinator', SESSION_UUID);
      mockFrom.mockReturnValueOnce(makeChain({ data: { session_id: OTHER_SESSION_UUID }, error: null })); // classes lookup

      const res = (await handler(
        makeEvent({
          body: body({ action: 'grant', role: 'teacher', scope_type: 'class', scope_id: CLASS_UUID, target_user_id: TARGET_ID }),
        }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body as string)).toEqual({ reason: "target class is outside the coordinator's own active session" });
    });

    it('coordinator grants role:teacher for a class inside their own session → 200 granted', async () => {
      setupCaller('coordinator', SESSION_UUID);
      mockFrom.mockReturnValueOnce(makeChain({ data: { session_id: SESSION_UUID }, error: null })); // classes lookup — matches
      mockFrom.mockReturnValueOnce(makeChain({ count: 0 })); // phase 4 count
      mockRpc.mockResolvedValue({ data: 'new-row-id', error: null });

      const res = (await handler(
        makeEvent({
          body: body({ action: 'grant', role: 'teacher', scope_type: 'class', scope_id: CLASS_UUID, target_user_id: TARGET_ID }),
        }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'granted', user_roles_id: 'new-row-id' });
    });

    it('coordinator grants role:student (no session dimension) → session-containment skipped, classes table never queried', async () => {
      setupCaller('coordinator', SESSION_UUID);
      mockFrom.mockReturnValueOnce(makeChain({ count: 0 })); // phase 4 count only — no classes chain queued
      mockRpc.mockResolvedValue({ data: 'new-row-id', error: null });

      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org', target_user_id: TARGET_ID }) }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(mockFrom).not.toHaveBeenCalledWith('classes');
    });

    // ── revoke-by-user_roles_id containment: must use the RESOLVED row's scope_id,
    // not the request body's scope_id (security fix — see ADR-0024 addendum).
    //
    // The classes-lookup chain below branches on the ACTUAL id passed to `.eq('id', ...)`
    // rather than returning a single canned response — this is deliberate: a canned
    // makeChain() response can't distinguish "queried with the resolved row's scope_id"
    // from "queried with the request body's scope_id", since both would just replay the
    // same preset result. Branching on the real argument is what makes this test capable
    // of failing against the pre-fix code (which passes the body's scope_id here).
    function makeBranchingClassesChain(sessionByClassId: Record<string, string>) {
      const chain: any = {};
      let queriedId: string | undefined;
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((_col: string, val: string) => {
        queriedId = val;
        return chain;
      });
      chain.maybeSingle = vi.fn(() =>
        Promise.resolve({
          data: queriedId && sessionByClassId[queriedId] ? { session_id: sessionByClassId[queriedId] } : null,
          error: null,
        })
      );
      return chain;
    }

    it('coordinator revokes role:teacher by user_roles_id where the RESOLVED row is outside their own session, but the body scope_id is a decoy class inside their own session → 403 (attack shape closed)', async () => {
      setupCaller('coordinator', SESSION_UUID);
      // Phase 2: by-id lookup — the row actually being deleted belongs to a class OUTSIDE the caller's session.
      mockFrom.mockReturnValueOnce(
        makeChain({
          data: { id: 'row-1', user_id: TARGET_ID, role: 'teacher', scope_type: 'class', scope_id: OTHER_CLASS_UUID },
          error: null,
        })
      );
      // Phase 3: containment check — CLASS_UUID (decoy, in body) maps to the caller's own session;
      // OTHER_CLASS_UUID (the row's real scope) maps to a different session. Only the fixed handler,
      // which queries by resolvedScopeId, will see the "outside" mapping.
      mockFrom.mockReturnValueOnce(
        makeBranchingClassesChain({ [CLASS_UUID]: SESSION_UUID, [OTHER_CLASS_UUID]: OTHER_SESSION_UUID })
      );

      const res = (await handler(
        makeEvent({
          body: body({
            action: 'revoke',
            role: 'teacher',
            scope_type: 'class',
            scope_id: CLASS_UUID, // attacker-supplied decoy: a class INSIDE the caller's own session
            user_roles_id: 'row-1', // but this row's real scope_id is OTHER_CLASS_UUID (outside)
          }),
        }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body as string)).toEqual({ reason: "target class is outside the coordinator's own active session" });
    });

    it('coordinator revokes role:teacher by user_roles_id where the RESOLVED row IS inside their own session → 200 revoked', async () => {
      setupCaller('coordinator', SESSION_UUID);
      // Phase 2: by-id lookup — the row being deleted belongs to a class inside the caller's own session.
      mockFrom.mockReturnValueOnce(
        makeChain({
          data: { id: 'row-1', user_id: TARGET_ID, role: 'teacher', scope_type: 'class', scope_id: CLASS_UUID },
          error: null,
        })
      );
      // Phase 3: containment check on the resolved scope_id (CLASS_UUID) — matches caller's session.
      mockFrom.mockReturnValueOnce(makeChain({ data: { session_id: SESSION_UUID }, error: null }));
      // Phase 4: delete().eq().select()
      mockFrom.mockReturnValueOnce(makeChain({ data: [{ id: 'row-1' }], error: null }));

      const res = (await handler(
        makeEvent({
          body: body({
            action: 'revoke',
            role: 'teacher',
            scope_type: 'class',
            scope_id: CLASS_UUID,
            user_roles_id: 'row-1',
          }),
        }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'revoked', user_roles_id: 'row-1' });
    });

    // ── revoke-by-user_roles_id must authorize against the RESOLVED row's actual
    // role/scope_type, not the request body's role/scope_type — broader/more severe
    // sibling of the resolvedScopeId fix above (see ADR-0024 addendum). A caller can
    // supply ANY internally-valid role/scope_type pair in the body; Phase 3 must never
    // trust it for tiering or containment when revoking by id.

    it('coordinator revokes by user_roles_id with a decoy body role:student (tier 0), but the RESOLVED row is actually role:admin (tier 3) → 403 tiering violation (bypass closed)', async () => {
      setupCaller('coordinator', SESSION_UUID);
      // Phase 2: by-id lookup — the row actually being deleted is an admin row, tier 3,
      // in a completely different scope. The body claims it's a mere "student" grant.
      mockFrom.mockReturnValueOnce(
        makeChain({
          data: { id: 'row-1', user_id: TARGET_ID, role: 'admin', scope_type: 'org', scope_id: null },
          error: null,
        })
      );

      const res = (await handler(
        makeEvent({
          body: body({ action: 'revoke', role: 'student', scope_type: 'org', user_roles_id: 'row-1' }),
        }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body as string)).toEqual({ reason: 'tiering violation' });
      // Only the Phase 0 caller lookup + Phase 2 by-id lookup should have run — no delete.
      expect(mockFrom).toHaveBeenCalledTimes(2);
    });

    it('coordinator revokes by user_roles_id with a decoy body role:student (skips the old targetRole===\'teacher\' containment gate entirely), but the RESOLVED row is actually role:teacher outside the coordinator\'s own session → 403 session containment (bypass closed)', async () => {
      setupCaller('coordinator', SESSION_UUID);
      // Tiering alone would NOT have blocked this: tierOf('teacher') === tierOf('student') === 0,
      // so this test isolates the containment-specific bypass (the old code kept the containment
      // gate closed for any body role other than 'teacher', regardless of what the row really was).
      mockFrom.mockReturnValueOnce(
        makeChain({
          data: { id: 'row-1', user_id: TARGET_ID, role: 'teacher', scope_type: 'class', scope_id: OTHER_CLASS_UUID },
          error: null,
        })
      );
      // Phase 3: containment check on the resolved row's real scope_id (OTHER_CLASS_UUID) —
      // maps to a session outside the caller's own.
      mockFrom.mockReturnValueOnce(makeChain({ data: { session_id: OTHER_SESSION_UUID }, error: null }));

      const res = (await handler(
        makeEvent({
          body: body({ action: 'revoke', role: 'student', scope_type: 'org', user_roles_id: 'row-1' }),
        }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body as string)).toEqual({ reason: "target class is outside the coordinator's own active session" });
      // Only the caller lookup + the two lookups above should have run — no delete.
      expect(mockFrom).toHaveBeenCalledTimes(3);
    });
  });

  // ── Phase 4: execute — grant ─────────────────────────────────────────────────
  describe('Phase 4 — execute (grant)', () => {
    it('grant with target_email for a brand-new email calls getOrCreateAuthUser, whose resolved id is passed to insert_user_role_grant', async () => {
      setupCaller('admin');
      vi.mocked(authProvisioning.getOrCreateAuthUser).mockResolvedValue('new-auth-id');
      mockFrom.mockReturnValueOnce(makeChain({ count: 0 })); // phase 4 count
      mockRpc.mockResolvedValue({ data: 'new-row-id', error: null });

      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org', target_email: TEST_EMAIL }) }),
        {} as never
      )) as HandlerResponse;

      expect(authProvisioning.getOrCreateAuthUser).toHaveBeenCalledWith(expect.anything(), expect.anything(), TEST_EMAIL, '', '');
      expect(mockRpc).toHaveBeenCalledWith('insert_user_role_grant', expect.objectContaining({ p_user_id: 'new-auth-id' }));
      expect(res.statusCode).toBe(200);
    });

    it('grant where getOrCreateAuthUser throws → 500, no unhandled exception, no PII in the log line', async () => {
      setupCaller('admin');
      vi.mocked(authProvisioning.getOrCreateAuthUser).mockRejectedValue(new Error('generateLink failed'));

      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org', target_email: TEST_EMAIL }) }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body as string)).toEqual({ reason: 'auth provisioning failed' });
      expect(mockRpc).not.toHaveBeenCalled();
      for (const call of vi.mocked(console.log).mock.calls) {
        expect(call[0] as string).not.toContain(TEST_EMAIL);
      }
    });

    it('grant with target_user_id does NOT call getOrCreateAuthUser', async () => {
      setupCaller('admin');
      mockFrom.mockReturnValueOnce(makeChain({ count: 0 }));
      mockRpc.mockResolvedValue({ data: 'new-row-id', error: null });

      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org', target_user_id: TARGET_ID }) }),
        {} as never
      )) as HandlerResponse;

      expect(authProvisioning.getOrCreateAuthUser).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('insert_user_role_grant RPC returns a new uuid → 200 granted, one PII-free console.log role_granted', async () => {
      setupCaller('admin');
      mockFrom.mockReturnValueOnce(makeChain({ count: 0 }));
      mockRpc.mockResolvedValue({ data: 'new-row-id', error: null });

      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org', target_user_id: TARGET_ID }) }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'granted', user_roles_id: 'new-row-id' });
      expect(console.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string);
      expect(logged.event).toBe('role_granted');
      expect(logged).not.toHaveProperty('email');
      expect(logged).not.toHaveProperty('target_email');
    });

    it('insert_user_role_grant RPC returns null (duplicate) → 200 noop, no console.log call', async () => {
      setupCaller('admin');
      mockFrom.mockReturnValueOnce(makeChain({ count: 0 }));
      mockRpc.mockResolvedValue({ data: null, error: null });

      const res = (await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org', target_user_id: TARGET_ID }) }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'noop' });
      expect(console.log).not.toHaveBeenCalled();
    });

    it('is_active is computed true when the pre-insert count is 0', async () => {
      setupCaller('admin');
      mockFrom.mockReturnValueOnce(makeChain({ count: 0 }));
      mockRpc.mockResolvedValue({ data: 'new-row-id', error: null });

      await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org', target_user_id: TARGET_ID }) }),
        {} as never
      );

      expect(mockRpc).toHaveBeenCalledWith('insert_user_role_grant', expect.objectContaining({ p_is_active: true }));
    });

    it('is_active is computed false when the pre-insert count is > 0 (target already holds another role)', async () => {
      setupCaller('admin');
      mockFrom.mockReturnValueOnce(makeChain({ count: 3 }));
      mockRpc.mockResolvedValue({ data: 'new-row-id', error: null });

      await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org', target_user_id: TARGET_ID }) }),
        {} as never
      );

      expect(mockRpc).toHaveBeenCalledWith('insert_user_role_grant', expect.objectContaining({ p_is_active: false }));
    });
  });

  // ── Phase 4: execute — revoke ────────────────────────────────────────────────
  describe('Phase 4 — execute (revoke)', () => {
    it('revoke by user_roles_id that resolves → delete returns a row → 200 revoked, one console.log role_revoked', async () => {
      setupCaller('admin');
      mockFrom.mockReturnValueOnce(
        makeChain({ data: { id: 'row-1', user_id: TARGET_ID, role: 'student', scope_type: 'org', scope_id: null }, error: null })
      ); // by-id lookup
      mockFrom.mockReturnValueOnce(makeChain({ data: [{ id: 'row-1' }], error: null })); // delete().eq().select()

      const res = (await handler(
        makeEvent({ body: body({ action: 'revoke', role: 'student', scope_type: 'org', user_roles_id: 'row-1' }) }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'revoked', user_roles_id: 'row-1' });
      expect(console.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string);
      expect(logged.event).toBe('role_revoked');
      expect(logged).not.toHaveProperty('email');
    });

    it('revoke by user_roles_id where the body role/scope_type (internally-valid but inaccurate) differ from the RESOLVED row\'s actual role/scope_type → 200 revoked, using the RESOLVED values for the delete AND the audit log (not the body\'s)', async () => {
      setupCaller('admin');
      // Body claims role:'teacher'/scope_type:'class' — internally valid and self-consistent,
      // but NOT what the row being deleted actually is.
      mockFrom.mockReturnValueOnce(
        makeChain({ data: { id: 'row-1', user_id: TARGET_ID, role: 'parent', scope_type: 'org', scope_id: null }, error: null })
      ); // by-id lookup — the row's real role is 'parent'/'org'
      mockFrom.mockReturnValueOnce(makeChain({ data: [{ id: 'row-1' }], error: null })); // delete().eq().select()

      const res = (await handler(
        makeEvent({
          body: body({ action: 'revoke', role: 'teacher', scope_type: 'class', scope_id: CLASS_UUID, user_roles_id: 'row-1' }),
        }),
        {} as never
      )) as HandlerResponse;

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body as string)).toEqual({ status: 'revoked', user_roles_id: 'row-1' });
      expect(console.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string);
      expect(logged.event).toBe('role_revoked');
      expect(logged.role).toBe('parent');
      expect(logged.scope_type).toBe('org');
    });
  });

  // ── PII-free logging (AC#8) ──────────────────────────────────────────────────
  describe('PII-free logging (AC#8)', () => {
    it('no console.log call in the grant-by-email flow ever contains the literal test email string', async () => {
      setupCaller('admin');
      vi.mocked(authProvisioning.getOrCreateAuthUser).mockResolvedValue('new-auth-id');
      mockFrom.mockReturnValueOnce(makeChain({ count: 0 }));
      mockRpc.mockResolvedValue({ data: 'new-row-id', error: null });

      await handler(
        makeEvent({ body: body({ action: 'grant', role: 'student', scope_type: 'org', target_email: TEST_EMAIL }) }),
        {} as never
      );

      for (const call of vi.mocked(console.log).mock.calls) {
        expect(String(call[0])).not.toContain(TEST_EMAIL);
      }
    });
  });
});
