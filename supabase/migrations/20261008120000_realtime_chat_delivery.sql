-- ADR-2026-10-07-realtime-chat-signal-then-fetch (issue #6): live chat delivery is a signal;
-- the message itself is fetched under messages RLS.

-- 1. Senders cannot choose a message's id or created_at (design decision 1). Catch-up is
-- "fetch newer than my last message", so both must be stamped by the database.
revoke insert on public.messages from authenticated;
grant insert (conversation_id, sender_user_id, body, mention_targets) on public.messages to authenticated;

-- 2. Catch-up, initial load and older pages all read one conversation in (created_at, id) order.
create index if not exists messages_conversation_created_id_idx
  on public.messages (conversation_id, created_at desc, id desc);

-- 3. Topic parser that cannot raise (design decision 5). Postgres does not promise evaluation
-- order inside a policy's AND, so the cast must sit behind the pattern in a CASE. Lowercase
-- uuids only: that is what the trigger emits.
create or replace function public.chat_topic_conversation_id(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(p_topic, 6)::uuid
  end;
$$;

revoke execute on function public.chat_topic_conversation_id(text) from public, anon;
grant execute on function public.chat_topic_conversation_id(text) to authenticated;

-- 4. The signal. SECURITY DEFINER (design decision 4): realtime.messages has RLS on and clients
-- get no insert policy, and realtime.send() traps its own errors -- as the sender, the signal
-- would vanish without failing anything. The payload is the message id and created_at only.
create or replace function public.broadcast_message_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'created_at', new.created_at),
    'message_saved',
    'chat:' || new.conversation_id::text,
    true
  );
  return null;
end;
$$;

revoke execute on function public.broadcast_message_saved() from public, anon, authenticated;

create trigger messages_broadcast_saved
  after insert on public.messages
  for each row execute function public.broadcast_message_saved();

-- 5. Channel access: listen-only, membership-derived, reads no role or scope claim.
-- `topic = realtime.topic()` ties each row to the topic being joined, so a participant of one
-- conversation is never shown another conversation's rows. No insert/update/delete policy for
-- any client role and no policy for anon: the only way onto a channel is a row saved to messages.
create policy chat_participants_receive_broadcast on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and topic = realtime.topic()
    and public.is_conversation_participant(public.chat_topic_conversation_id(realtime.topic()))
  );
