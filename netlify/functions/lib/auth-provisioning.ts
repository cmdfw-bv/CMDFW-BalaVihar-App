export async function getOrCreateAuthUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
  firstName: string,
  lastName: string
): Promise<string> {
  // Use raw fetch — the Supabase JS admin client has auth-state bugs after getUser(token).
  // The generated link is never sent; this is silent provisioning only.
  const resp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify({
      type: 'magiclink',
      email,
      options: { data: { first_name: firstName, last_name: lastName } },
    }),
  });
  const body = (await resp.json()) as { id?: string; msg?: string; message?: string };
  if (!resp.ok || !body.id) throw new Error(body.msg ?? body.message ?? 'generateLink failed');
  return body.id;
}

export async function getUserByEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string
): Promise<string | null> {
  const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
  });
  if (!resp.ok) throw new Error(`getUserByEmail: admin users lookup failed (${resp.status})`);
  const body = (await resp.json()) as { users?: Array<{ id: string; email?: string }> };
  const match = (body.users ?? []).find(u => u.email?.toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}
