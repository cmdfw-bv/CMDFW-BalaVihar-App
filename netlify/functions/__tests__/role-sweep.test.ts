import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAutoActivationSweep } from '../lib/role-sweep';

// Minimal Supabase client stub typed loosely — mirrors db-ops.test.ts's
// makeClient/chained-vi.fn() idiom (see MockChain there).
type MockChain = Record<string, ReturnType<typeof vi.fn>>;

interface SourceRow {
  user_id: string | null;
}

interface ExistingRoleRow {
  user_id: string;
  role: string;
  scope_type: string;
}

interface RpcParams {
  p_user_id: string;
  p_role: string;
  p_scope_type: string;
  p_scope_id: string | null;
  p_is_active: boolean;
}

type SupabaseError = { message: string };

// Mimics `.select('user_id').not('user_id', 'is', null)`: the `not` mock applies
// the real Postgrest-style filter (drops rows where `column === value`) so tests
// exercise actual filtering behavior, not just call counts.
function makeFilterableChain(rows: SourceRow[], error: SupabaseError | null = null) {
  const not = vi.fn((column: string, _op: string, value: null) => {
    if (error) return Promise.resolve({ data: null, error });
    return Promise.resolve({
      data: rows.filter(r => (r as unknown as Record<string, unknown>)[column] !== value),
      error: null,
    });
  });
  return { select: vi.fn().mockReturnValue({ not }) };
}

function makeUserRolesChain(opts: { existingRoles?: ExistingRoleRow[]; existingRolesError?: SupabaseError | null }) {
  const inFn = vi.fn().mockResolvedValue(
    opts.existingRolesError
      ? { data: null, error: opts.existingRolesError }
      : { data: opts.existingRoles ?? [], error: null }
  );
  const select = vi.fn().mockReturnValue({ in: inFn });
  return { select, in: inFn };
}

function makeClient(opts: {
  familyMembers?: SourceRow[];
  familyMembersError?: SupabaseError | null;
  students?: SourceRow[];
  studentsError?: SupabaseError | null;
  existingRoles?: ExistingRoleRow[];
  existingRolesError?: SupabaseError | null;
  // Per-row RPC result override — return { data: null, error: null } to simulate a
  // conflict (on-conflict-do-nothing, no new row), or { data: null, error: {...} } for
  // a genuine DB error. Defaults to always granting with a synthesized id.
  rpcResult?: (params: RpcParams) => { data: unknown; error: unknown };
}) {
  const familyMembersChain = makeFilterableChain(opts.familyMembers ?? [], opts.familyMembersError ?? null);
  const studentsChain = makeFilterableChain(opts.students ?? [], opts.studentsError ?? null);
  const userRolesChain = makeUserRolesChain({
    existingRoles: opts.existingRoles,
    existingRolesError: opts.existingRolesError,
  });

  let rpcCallCount = 0;
  const rpc = vi.fn((_fnName: string, params: RpcParams) => {
    rpcCallCount += 1;
    if (opts.rpcResult) return Promise.resolve(opts.rpcResult(params));
    return Promise.resolve({ data: `${params.p_role}-row-${rpcCallCount}`, error: null });
  });

  const from = vi.fn((table: string) => {
    if (table === 'family_members') return familyMembersChain;
    if (table === 'students') return studentsChain;
    if (table === 'user_roles') return userRolesChain;
    throw new Error(`unexpected table: ${table}`);
  });

  const client: MockChain = { from, rpc };
  return { client, from, rpc, userRolesChain, familyMembersChain, studentsChain };
}

describe('runAutoActivationSweep', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('grants parent/org for every deduped family_members.user_id lacking one, and student/org for every students.user_id lacking one', async () => {
    const { client, rpc } = makeClient({
      familyMembers: [{ user_id: 'p1' }, { user_id: 'p1' }, { user_id: 'p2' }],
      students: [{ user_id: 's1' }],
      existingRoles: [],
    });

    const result = await runAutoActivationSweep(client as never);

    expect(result).toEqual({ granted_parent: 2, granted_student: 1 });
    const calls = rpc.mock.calls.map(([, params]: [string, RpcParams]) => params);
    expect(calls).toContainEqual(
      expect.objectContaining({ p_user_id: 'p1', p_role: 'parent', p_scope_type: 'org', p_scope_id: null, p_is_active: true })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ p_user_id: 'p2', p_role: 'parent', p_scope_type: 'org', p_scope_id: null, p_is_active: true })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ p_user_id: 's1', p_role: 'student', p_scope_type: 'org', p_scope_id: null, p_is_active: true })
    );
    expect(rpc).toHaveBeenCalledTimes(3);
    for (const [fnName] of rpc.mock.calls) {
      expect(fnName).toBe('insert_user_role_grant');
    }
  });

  it('skips family_members/students rows whose user_id is null (auth_pending — picked up on next sweep)', async () => {
    const { client, rpc } = makeClient({
      familyMembers: [{ user_id: 'p1' }, { user_id: null }],
      students: [{ user_id: null }, { user_id: 's1' }],
      existingRoles: [],
    });

    const result = await runAutoActivationSweep(client as never);

    expect(result).toEqual({ granted_parent: 1, granted_student: 1 });
    const insertedUserIds = rpc.mock.calls.map(([, params]: [string, RpcParams]) => params.p_user_id);
    expect(insertedUserIds).not.toContain(null);
    expect(insertedUserIds.slice().sort()).toEqual(['p1', 's1']);
  });

  it('is idempotent: excludes a user who already has the specific (role, scope_type=org) row even if the source table still lists them', async () => {
    const { client, rpc } = makeClient({
      familyMembers: [{ user_id: 'p1' }, { user_id: 'p2' }],
      students: [],
      existingRoles: [{ user_id: 'p1', role: 'parent', scope_type: 'org' }],
    });

    const result = await runAutoActivationSweep(client as never);

    expect(result).toEqual({ granted_parent: 1, granted_student: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('insert_user_role_grant', expect.objectContaining({ p_user_id: 'p2' }));
  });

  it('sets is_active=true only when the user has zero existing user_roles rows, false when they already hold any other role', async () => {
    const { client, rpc } = makeClient({
      familyMembers: [{ user_id: 'p-fresh' }, { user_id: 'p-has-other-role' }],
      students: [],
      existingRoles: [{ user_id: 'p-has-other-role', role: 'teacher', scope_type: 'class' }],
    });

    await runAutoActivationSweep(client as never);

    const calls = rpc.mock.calls.map(([, params]: [string, RpcParams]) => params);
    expect(calls).toContainEqual(expect.objectContaining({ p_user_id: 'p-fresh', p_is_active: true }));
    expect(calls).toContainEqual(expect.objectContaining({ p_user_id: 'p-has-other-role', p_is_active: false }));
  });

  it('sequencing: a user newly granted in the parent batch is treated as already-has-a-role by the student batch is_active computation', async () => {
    const { client, rpc } = makeClient({
      familyMembers: [{ user_id: 'dual1' }],
      students: [{ user_id: 'dual1' }],
      existingRoles: [],
    });

    await runAutoActivationSweep(client as never);

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'insert_user_role_grant',
      expect.objectContaining({ p_user_id: 'dual1', p_role: 'parent', p_is_active: true })
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'insert_user_role_grant',
      expect.objectContaining({ p_user_id: 'dual1', p_role: 'student', p_is_active: false })
    );
  });

  it('returns counts of only newly-inserted rows, excluding skipped/idempotent ones', async () => {
    const { client } = makeClient({
      familyMembers: [{ user_id: 'p1' }, { user_id: 'p2' }, { user_id: 'p3' }],
      students: [{ user_id: 's1' }],
      existingRoles: [
        { user_id: 'p1', role: 'parent', scope_type: 'org' },
        { user_id: 's1', role: 'student', scope_type: 'org' },
      ],
    });

    const result = await runAutoActivationSweep(client as never);
    expect(result).toEqual({ granted_parent: 2, granted_student: 0 });
  });

  it('emits exactly one PII-free console.log per granted row (AC#8)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { client } = makeClient({
      familyMembers: [{ user_id: 'p1' }, { user_id: 'p2' }],
      students: [{ user_id: 's1' }],
      existingRoles: [],
    });

    await runAutoActivationSweep(client as never);

    expect(logSpy).toHaveBeenCalledTimes(3);
    for (const call of logSpy.mock.calls) {
      const logged = JSON.parse(call[0] as string);
      expect(logged.event).toBe('role_swept');
      expect(Object.keys(logged).sort()).toEqual(['event', 'role', 'scope_type', 'user_roles_id']);
      expect(logged).not.toHaveProperty('email');
      expect(logged).not.toHaveProperty('name');
    }
  });

  it('throws when the user_roles existing-roles lookup returns an error', async () => {
    const { client } = makeClient({
      familyMembers: [{ user_id: 'p1' }],
      students: [],
      existingRolesError: { message: 'lookup boom' },
    });

    await expect(runAutoActivationSweep(client as never)).rejects.toThrow(/existing-roles lookup failed/);
  });

  it('throws when the insert_user_role_grant RPC returns an error', async () => {
    const { client } = makeClient({
      familyMembers: [{ user_id: 'p1' }],
      students: [],
      existingRoles: [],
      rpcResult: () => ({ data: null, error: { message: 'insert boom' } }),
    });

    await expect(runAutoActivationSweep(client as never)).rejects.toThrow(/parent insert failed/);
  });

  // Proves the concurrency fix (Important #3 from code review): a batch .insert() would
  // throw on a unique-violation and lose the *entire* batch when it races against a
  // concurrent sweep/manual grant on the same grant-identity index. The RPC's
  // on-conflict-do-nothing means only the colliding row is skipped (returns null, no new
  // id) — every other candidate in the same run is still processed and counted.
  it('when insert_user_role_grant reports a conflict (null id) for one candidate, still processes and counts the rest — no batch-wide failure', async () => {
    const { client, rpc } = makeClient({
      familyMembers: [{ user_id: 'p-raced' }, { user_id: 'p-clean' }],
      students: [],
      existingRoles: [],
      rpcResult: params => (params.p_user_id === 'p-raced' ? { data: null, error: null } : { data: 'parent-row-x', error: null }),
    });

    const result = await runAutoActivationSweep(client as never);

    expect(result).toEqual({ granted_parent: 1, granted_student: 0 });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  // NOTE: the brief's F6 code destructures only `data` (not `error`) from the
  // family_members/students `.select().not()` queries — matching db-ops.ts's
  // resolveSessionsAndClasses convention of not surfacing errors from those
  // best-effort lookups. So an error there does not throw; it degrades to
  // "treat as zero source rows" for that table only, and the sweep proceeds
  // normally for the other table. This is a real behavior test, not a
  // literal reading of the F5 bullet (which says these should throw) — see
  // ADR-0024 addendum (2026-07-12) for the recorded decision to keep this
  // degrade-and-report behavior over a literal throw.
  it('does not throw when the family_members select errors — degrades to zero parent grants, students sweep unaffected, and reports source_errors', async () => {
    const { client, rpc } = makeClient({
      familyMembersError: { message: 'family_members boom' },
      students: [{ user_id: 's1' }],
      existingRoles: [],
    });

    const result = await runAutoActivationSweep(client as never);

    expect(result).toEqual({
      granted_parent: 0,
      granted_student: 1,
      source_errors: ['family_members: family_members boom'],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('insert_user_role_grant', expect.objectContaining({ p_user_id: 's1', p_role: 'student' }));
  });

  it('omits source_errors entirely when both source reads succeed', async () => {
    const { client } = makeClient({
      familyMembers: [{ user_id: 'p1' }],
      students: [],
      existingRoles: [],
    });

    const result = await runAutoActivationSweep(client as never);

    expect(result).not.toHaveProperty('source_errors');
  });
});
