import { describe, it, expect, vi, afterEach } from 'vitest';
import { getOrCreateAuthUser, getUserByEmail } from '../lib/auth-provisioning';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'service-role-test-key';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getOrCreateAuthUser', () => {
  it('resolves to body.id when resp.ok and body.id is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'auth-u1', email: 'priya@example.test' }),
    }));

    const id = await getOrCreateAuthUser(SUPABASE_URL, SERVICE_ROLE_KEY, 'priya@example.test', 'Priya', 'Patel');

    expect(id).toBe('auth-u1');
    expect(fetch).toHaveBeenCalledWith(
      `${SUPABASE_URL}/auth/v1/admin/generate_link`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          type: 'magiclink',
          email: 'priya@example.test',
          options: { data: { first_name: 'Priya', last_name: 'Patel' } },
        }),
      })
    );
  });

  it('throws with body.msg when !resp.ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ msg: 'timeout' }),
    }));

    await expect(
      getOrCreateAuthUser(SUPABASE_URL, SERVICE_ROLE_KEY, 'priya@example.test', 'Priya', 'Patel')
    ).rejects.toThrow('timeout');
  });

  it('throws with body.message when !resp.ok and no msg', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'server error' }),
    }));

    await expect(
      getOrCreateAuthUser(SUPABASE_URL, SERVICE_ROLE_KEY, 'priya@example.test', 'Priya', 'Patel')
    ).rejects.toThrow('server error');
  });

  it('throws with default message when !resp.ok and no msg/message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }));

    await expect(
      getOrCreateAuthUser(SUPABASE_URL, SERVICE_ROLE_KEY, 'priya@example.test', 'Priya', 'Patel')
    ).rejects.toThrow('generateLink failed');
  });

  it('throws when resp.ok but body.id is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));

    await expect(
      getOrCreateAuthUser(SUPABASE_URL, SERVICE_ROLE_KEY, 'priya@example.test', 'Priya', 'Patel')
    ).rejects.toThrow('generateLink failed');
  });
});

describe('getUserByEmail', () => {
  it('returns the matching user id (case-insensitive email match)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [
          { id: 'u1', email: 'Teacher1@bv-seed.test.local' },
          { id: 'u2', email: 'teacher2@bv-seed.test.local' },
        ],
        aud: 'authenticated',
      }),
    }));

    const id = await getUserByEmail(SUPABASE_URL, SERVICE_ROLE_KEY, 'teacher1@bv-seed.test.local');

    expect(id).toBe('u1');
    expect(fetch).toHaveBeenCalledWith(
      `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent('teacher1@bv-seed.test.local')}`,
      expect.objectContaining({
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      })
    );
  });

  it('returns null when no user in body.users matches the email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [{ id: 'u1', email: 'someone-else@bv-seed.test.local' }],
      }),
    }));

    const id = await getUserByEmail(SUPABASE_URL, SERVICE_ROLE_KEY, 'nonexistent@bv-seed.test.local');

    expect(id).toBeNull();
  });

  it('returns null when body.users is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));

    const id = await getUserByEmail(SUPABASE_URL, SERVICE_ROLE_KEY, 'nonexistent@bv-seed.test.local');

    expect(id).toBeNull();
  });

  it('throws when !resp.ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));

    await expect(
      getUserByEmail(SUPABASE_URL, SERVICE_ROLE_KEY, 'teacher1@bv-seed.test.local')
    ).rejects.toThrow(/admin users lookup failed/);
  });
});
