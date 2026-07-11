import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkAdminRole,
  resolveSessionsAndClasses,
  upsertFamily,
  upsertStudentWithExternalId,
  upsertStudentByName,
  upsertEnrollment,
  linkGuardian,
  linkStudentUser,
} from '../lib/db-ops';

// Minimal Supabase client stub typed loosely
type MockChain = Record<string, ReturnType<typeof vi.fn>>;

function makeClient(overrides: Record<string, unknown> = {}): MockChain {
  const base: MockChain = {
    from: vi.fn(),
    rpc: vi.fn(),
  };
  return { ...base, ...overrides } as unknown as MockChain;
}

describe('checkAdminRole', () => {
  it('returns true when a matching user_roles row exists', async () => {
    const single = vi.fn().mockResolvedValue({ data: { user_id: 'u1' }, error: null });
    const eq2 = vi.fn().mockReturnValue({ single });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    const client = makeClient({ from });

    const result = await checkAdminRole(client as never, 'u1');
    expect(result).toBe(true);
    expect(from).toHaveBeenCalledWith('user_roles');
  });

  it('returns false when user_roles query returns an error', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'no row' } });
    const eq2 = vi.fn().mockReturnValue({ single });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });

    const result = await checkAdminRole(makeClient({ from }) as never, 'u2');
    expect(result).toBe(false);
  });
});

describe('resolveSessionsAndClasses', () => {
  it('resolves session names and class grade bands to id maps', async () => {
    const sessionData = [{ id: 's1', name: 'F3' }];
    const classData = [{ id: 'c1', session_id: 's1', grade_band: 'Gr5' }];

    const sessionChain = {
      in: vi.fn().mockResolvedValue({ data: sessionData, error: null }),
    };
    const classChain = {
      in: vi.fn().mockResolvedValue({ data: classData, error: null }),
    };
    const select = vi.fn()
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(classChain);
    const from = vi.fn().mockReturnValue({ select });

    const result = await resolveSessionsAndClasses(makeClient({ from }) as never, ['F3'], [{ sessionName: 'F3', gradeBand: 'Gr5' }]);
    expect(result.sessionMap.get('F3')).toBe('s1');
    expect(result.classMap.get('F3:Gr5')).toBe('c1');
    expect(result.errors).toHaveLength(0);
  });

  it('returns an error for an unknown session name', async () => {
    const sessionChain = {
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const select = vi.fn().mockReturnValue(sessionChain);
    const from = vi.fn().mockReturnValue({ select });

    const result = await resolveSessionsAndClasses(makeClient({ from }) as never, ['UNKNOWN'], []);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('upsertFamily', () => {
  it('returns existing family id when found by guardian hash', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'fam1' }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const id = await upsertFamily(makeClient({ from }) as never, 'Test Family', 'hash123');
    expect(id).toBe('fam1');
    expect(eq).toHaveBeenCalledWith('primary_guardian_email_hash', 'hash123');
  });

  it('inserts new family when hash not found and returns id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const selectForLookup = vi.fn().mockReturnValue({ eq });

    const selectForInsert = vi.fn().mockResolvedValue({ data: [{ id: 'fam2' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: selectForInsert });

    const from = vi.fn()
      .mockReturnValueOnce({ select: selectForLookup })
      .mockReturnValueOnce({ insert });

    const id = await upsertFamily(makeClient({ from }) as never, 'New Family', 'hash456');
    expect(id).toBe('fam2');
    expect(insert).toHaveBeenCalledWith({ label: 'New Family', primary_guardian_email_hash: 'hash456' });
  });
});

describe('upsertStudentWithExternalId', () => {
  it('returns existing student id and updates grade when found by external_member_id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'stu1' }, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: eq2 });

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });

    const from = vi.fn()
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ update });

    const id = await upsertStudentWithExternalId(makeClient({ from }) as never, {
      family_id: 'fam1', first_name: 'Arjun', last_name: 'Patel',
      grade_level: 'Gr5', external_member_id: 'EXT-001',
    });
    expect(id).toBe('stu1');
    expect(eq2).toHaveBeenCalledWith('external_member_id', 'EXT-001');
  });

  it('inserts new student when external_member_id not found', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const selectForLookup = vi.fn().mockReturnValue({ eq });

    const selectForInsert = vi.fn().mockResolvedValue({ data: [{ id: 'stu2' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: selectForInsert });

    const from = vi.fn()
      .mockReturnValueOnce({ select: selectForLookup })
      .mockReturnValueOnce({ insert });

    const id = await upsertStudentWithExternalId(makeClient({ from }) as never, {
      family_id: 'fam1', first_name: 'Arjun', last_name: 'Patel',
      grade_level: 'Gr5', external_member_id: 'EXT-001',
    });
    expect(id).toBe('stu2');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ external_member_id: 'EXT-001' }));
  });
});

describe('upsertStudentByName', () => {
  it('returns existing student id when found by family+name', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'stu2' }, error: null });
    const eq3 = vi.fn().mockReturnValue({ maybeSingle });
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });

    // second from() call: grade_level update
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });

    const from = vi.fn()
      .mockReturnValueOnce({ select })
      .mockReturnValueOnce({ update });

    const id = await upsertStudentByName(makeClient({ from }) as never, {
      family_id: 'fam1', first_name: 'Arjun', last_name: 'Patel', grade_level: 'Gr5',
    });
    expect(id).toBe('stu2');
  });
});

describe('upsertEnrollment', () => {
  it('returns null (skipped) when active enrollment already exists', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'enr1' }, error: null });
    const eq3 = vi.fn().mockReturnValue({ maybeSingle });
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });

    const id = await upsertEnrollment(makeClient({ from }) as never, {
      student_id: 'stu1', class_id: 'cls1', session_id: 'ses1',
    });
    expect(id).toBeNull();
  });

  it('inserts and returns enrollment id when not already enrolled', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq3 = vi.fn().mockReturnValue({ maybeSingle });
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const selectForLookup = vi.fn().mockReturnValue({ eq: eq1 });

    const selectForInsert = vi.fn().mockResolvedValue({ data: [{ id: 'enr2' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: selectForInsert });

    const from = vi.fn()
      .mockReturnValueOnce({ select: selectForLookup })
      .mockReturnValueOnce({ insert });

    const id = await upsertEnrollment(makeClient({ from }) as never, {
      student_id: 'stu1', class_id: 'cls1', session_id: 'ses1',
    });
    expect(id).toBe('enr2');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ student_id: 'stu1', status: 'active' }));
  });
});

describe('linkGuardian', () => {
  it('inserts into family_members ON CONFLICT DO NOTHING', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });

    await linkGuardian(makeClient({ from }) as never, 'fam1', 'usr1');
    expect(upsert).toHaveBeenCalledWith(
      { family_id: 'fam1', user_id: 'usr1', relationship: 'guardian' },
      { onConflict: 'family_id,user_id', ignoreDuplicates: true }
    );
  });
});

describe('linkStudentUser', () => {
  it('updates students.user_id only when currently null', async () => {
    const isFilter = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockReturnValue({ is: isFilter });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    await linkStudentUser(makeClient({ from }) as never, 'stu1', 'usr1');
    expect(update).toHaveBeenCalledWith({ user_id: 'usr1' });
    expect(eq).toHaveBeenCalledWith('id', 'stu1');
    expect(isFilter).toHaveBeenCalledWith('user_id', null);
  });
});
