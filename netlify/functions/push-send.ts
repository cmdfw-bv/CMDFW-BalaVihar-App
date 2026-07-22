import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { isRecipient, payloadTitleForKind, type ConversationParticipant, type ConversationKind } from './lib/push-dispatch';
import { configureVapid, sendPush, type PushSubscriptionRow } from './lib/push-delivery';

function json(statusCode: number, body: unknown) {
  return { statusCode, body: JSON.stringify(body) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PushSendRequestBody {
  message_id?: string;
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  const supabaseUrl = process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '';
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
  const client = createClient(supabaseUrl, serviceRoleKey);
  configureVapid(
    process.env['VAPID_SUBJECT'] ?? '',
    process.env['EXPO_PUBLIC_VAPID_PUBLIC_KEY'] ?? '',
    process.env['VAPID_PRIVATE_KEY'] ?? ''
  );

  // ── Phase 0: Auth ──────────────────────────────────────────────────────────
  const authHeader = event.headers['authorization'] ?? event.headers['Authorization'] ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { reason: 'missing Authorization header' });
  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData?.user) return json(401, { reason: 'invalid or expired token' });
  const callerUserId = authData.user.id;

  // ── Phase 1: Validate request (no writes) ────────────────────────────────────
  let body: PushSendRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as PushSendRequestBody;
  } catch {
    return json(422, { reason: 'malformed JSON body' });
  }
  const { message_id } = body;
  if (!message_id || !UUID_RE.test(message_id)) return json(422, { reason: 'message_id must be a valid UUID' });

  // ── Phase 2: Load message (best-effort — not found is a noop, not an error) ──
  const { data: message } = await client
    .from('messages')
    .select('id, conversation_id, sender_user_id, mention_targets')
    .eq('id', message_id)
    .maybeSingle();
  if (!message) return json(200, { status: 'noop', recipients: 0, sent: 0, cleaned_up: 0 });

  // ── Phase 3: Caller must be the message's own sender (notification-spam guard) ─
  // push-send runs service-role and bypasses RLS entirely — nothing else stops an
  // authenticated-but-unrelated caller from repeatedly triggering dispatch about a message
  // they didn't send. Design sign-off, 2026-07-21: required, not optional hardening.
  if (message['sender_user_id'] !== callerUserId) return json(403, { reason: 'caller is not the message sender' });

  // ── Phase 4: Load conversation kind (payload copy is keyed off kind only, AC#9) ─
  const { data: conversation } = await client
    .from('conversations')
    .select('kind')
    .eq('id', message['conversation_id'])
    .maybeSingle();
  if (!conversation) return json(200, { status: 'noop', recipients: 0, sent: 0, cleaned_up: 0 });

  // ── Phase 5: Derive recipients (notify_level + mention-matching filter) ──────
  const { data: participants } = await client
    .from('conversation_participants')
    .select('user_id, participant_role, notify_level')
    .eq('conversation_id', message['conversation_id']);

  const senderUserId = message['sender_user_id'] as string;
  const mentionTargets = (message['mention_targets'] ?? []) as string[];
  const recipientIds = ((participants ?? []) as ConversationParticipant[])
    .filter((cp) => isRecipient(cp, senderUserId, mentionTargets))
    .map((cp) => cp.user_id);

  if (recipientIds.length === 0) return json(200, { status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });

  // ── Phase 6: Fan out to every subscription for every recipient (multi-device) ─
  const { data: subscriptions } = await client
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .in('user_id', recipientIds);

  const payload = { title: payloadTitleForKind(conversation['kind'] as ConversationKind) };
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

  console.log(
    JSON.stringify({ event: 'push_dispatched', message_id, recipients: recipientIds.length, sent, cleaned_up: cleanedUp })
  );
  return json(200, { status: 'dispatched', recipients: recipientIds.length, sent, cleaned_up: cleanedUp });
};
