import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRecipient, payloadTitleForKind, type ConversationParticipant, type ConversationKind } from './lib/push-dispatch';
import { mergeClassUpdateRecipients, CLASS_UPDATE_PUSH_TITLE } from './lib/class-update-dispatch';
import { configureVapid, sendPush, type PushSubscriptionRow } from './lib/push-delivery';

function json(statusCode: number, body: unknown) {
  return { statusCode, body: JSON.stringify(body) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PushSendRequestBody {
  message_id?: string;
  class_update_id?: string;
}

class QueryError extends Error {
  constructor(
    readonly table: string,
    readonly cause: { message: string; code?: string }
  ) {
    super(`${table}: ${cause.message}`);
    this.name = 'QueryError';
  }
}

// Every service-role read goes through here. Discarding `error` and letting `data` fall through as
// null is what made issue #47 invisible: a missing grant returned 200 {"recipients":0} and nothing
// was logged. Unwrapping centrally means a new query can't silently reintroduce that failure mode.
function unwrap<T>(table: string, res: { data: T | null; error: { message: string; code?: string } | null }): T | null {
  if (res.error) throw new QueryError(table, res.error);
  return res.data;
}

async function fanOut(client: SupabaseClient, recipientIds: string[], payload: { title: string }) {
  const subscriptions = unwrap(
    'push_subscriptions',
    await client.from('push_subscriptions').select('id, endpoint, p256dh_key, auth_key').in('user_id', recipientIds)
  );

  configureVapid(
    process.env['VAPID_SUBJECT'] ?? '',
    process.env['EXPO_PUBLIC_VAPID_PUBLIC_KEY'] ?? '',
    process.env['VAPID_PRIVATE_KEY'] ?? ''
  );

  let sent = 0;
  let cleanedUp = 0;
  for (const sub of (subscriptions ?? []) as PushSubscriptionRow[]) {
    const outcome = await sendPush(sub, payload);
    if (outcome.status === 'sent') {
      sent += 1;
    } else if (outcome.status === 'gone') {
      await client.from('push_subscriptions').delete().eq('id', sub.id);
      cleanedUp += 1;
    }
    // 'failed' (e.g. transient 5xx): logged implicitly via the dispatch summary below,
    // skipped — no retry queue at POC.
  }
  return { sent, cleanedUp };
}

async function dispatchMessage(client: SupabaseClient, messageId: string, callerUserId: string) {
  const message = unwrap<Record<string, unknown>>(
    'messages',
    await client.from('messages').select('id, conversation_id, sender_user_id, mention_targets').eq('id', messageId).maybeSingle()
  );
  if (!message) return json(200, { status: 'noop', recipients: 0, sent: 0, cleaned_up: 0 });

  // push-send runs service-role and bypasses RLS entirely — nothing else stops an
  // authenticated-but-unrelated caller from repeatedly triggering dispatch about a message
  // they didn't send. Design sign-off, 2026-07-21: required, not optional hardening.
  if (message['sender_user_id'] !== callerUserId) return json(403, { reason: 'caller is not the message sender' });

  const conversation = unwrap<Record<string, unknown>>(
    'conversations',
    await client.from('conversations').select('kind').eq('id', message['conversation_id']).maybeSingle()
  );
  if (!conversation) return json(200, { status: 'noop', recipients: 0, sent: 0, cleaned_up: 0 });

  const participants = unwrap<ConversationParticipant[]>(
    'conversation_participants',
    await client
      .from('conversation_participants')
      .select('user_id, participant_role, notify_level')
      .eq('conversation_id', message['conversation_id'])
  );

  const senderUserId = message['sender_user_id'] as string;
  const mentionTargets = (message['mention_targets'] ?? []) as string[];
  const recipientIds = (participants ?? [])
    .filter((cp) => isRecipient(cp, senderUserId, mentionTargets))
    .map((cp) => cp.user_id);

  if (recipientIds.length === 0) return json(200, { status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });

  const payload = { title: payloadTitleForKind(conversation['kind'] as ConversationKind) };
  const { sent, cleanedUp } = await fanOut(client, recipientIds, payload);

  console.log(JSON.stringify({ event: 'push_dispatched', message_id: messageId, recipients: recipientIds.length, sent, cleaned_up: cleanedUp }));
  return json(200, { status: 'dispatched', recipients: recipientIds.length, sent, cleaned_up: cleanedUp });
}

async function dispatchClassUpdate(client: SupabaseClient, classUpdateId: string, callerUserId: string) {
  const classUpdate = unwrap<Record<string, unknown>>(
    'class_updates',
    await client.from('class_updates').select('id, class_id, posted_by').eq('id', classUpdateId).maybeSingle()
  );
  if (!classUpdate) return json(200, { status: 'noop', recipients: 0, sent: 0, cleaned_up: 0 });

  const posterUserId = classUpdate['posted_by'] as string;
  // Same notification-spam guard as the message branch, applied to class_updates.posted_by (ADR-0033).
  if (posterUserId !== callerUserId) return json(403, { reason: "caller is not the class update's poster" });

  const classId = classUpdate['class_id'] as string;
  const enrollments = unwrap<Array<{ student_id: string }>>(
    'enrollments',
    await client.from('enrollments').select('student_id').eq('class_id', classId).eq('status', 'active')
  );
  const studentIds = (enrollments ?? []).map((e) => e.student_id);

  if (studentIds.length === 0) return json(200, { status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });

  const students = unwrap<Array<{ user_id: string | null; family_id: string }>>(
    'students',
    await client.from('students').select('user_id, family_id').in('id', studentIds)
  );
  const studentRows = students ?? [];
  const familyIds = Array.from(new Set(studentRows.map((s) => s.family_id)));

  const familyMembers = unwrap<Array<{ user_id: string }>>(
    'family_members',
    await client.from('family_members').select('user_id').in('family_id', familyIds)
  );
  const parentUserIds = (familyMembers ?? []).map((fm) => fm.user_id);

  const recipientIds = mergeClassUpdateRecipients([...studentRows.map((s) => s.user_id), ...parentUserIds], posterUserId);
  if (recipientIds.length === 0) return json(200, { status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });

  const { sent, cleanedUp } = await fanOut(client, recipientIds, { title: CLASS_UPDATE_PUSH_TITLE });

  console.log(JSON.stringify({ event: 'push_dispatched', class_update_id: classUpdateId, recipients: recipientIds.length, sent, cleaned_up: cleanedUp }));
  return json(200, { status: 'dispatched', recipients: recipientIds.length, sent, cleaned_up: cleanedUp });
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
  const callerUserId = authData.user.id;

  let body: PushSendRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as PushSendRequestBody;
  } catch {
    return json(422, { reason: 'malformed JSON body' });
  }
  const { message_id, class_update_id } = body;
  const hasMessage = message_id != null;
  const hasClassUpdate = class_update_id != null;
  if (hasMessage === hasClassUpdate) {
    return json(422, { reason: 'exactly one of message_id or class_update_id is required' });
  }
  if (hasMessage && !UUID_RE.test(message_id!)) return json(422, { reason: 'message_id must be a valid UUID' });
  if (hasClassUpdate && !UUID_RE.test(class_update_id!)) return json(422, { reason: 'class_update_id must be a valid UUID' });

  try {
    return await (hasMessage
      ? dispatchMessage(client, message_id!, callerUserId)
      : dispatchClassUpdate(client, class_update_id!, callerUserId));
  } catch (err) {
    if (err instanceof QueryError) {
      // Structured so a recurrence of issue #47 is greppable in function logs rather than
      // indistinguishable from a genuine zero-recipient dispatch.
      console.error(
        JSON.stringify({
          event: 'push_dispatch_failed',
          table: err.table,
          code: err.cause.code ?? null,
          message: err.cause.message,
          ...(hasMessage ? { message_id } : { class_update_id }),
        })
      );
      return json(500, { status: 'error', reason: 'dispatch query failed' });
    }
    throw err;
  }
};
