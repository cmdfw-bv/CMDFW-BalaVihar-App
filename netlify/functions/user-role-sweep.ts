import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { checkAdminRole } from './lib/db-ops';
import { runAutoActivationSweep } from './lib/role-sweep';

function json(statusCode: number, body: unknown) {
  return { statusCode, body: JSON.stringify(body) };
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  const supabaseUrl = process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
  const client = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = event.headers['authorization'] ?? event.headers['Authorization'] ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { reason: 'missing Authorization header' });

  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { reason: 'invalid or expired token' });

  const isAdmin = await checkAdminRole(client, authData.user.id);
  if (!isAdmin) return json(403, { reason: 'caller does not hold admin role' });

  const result = await runAutoActivationSweep(client);
  return json(200, result);
};
