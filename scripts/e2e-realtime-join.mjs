// End-to-end join check for realtime chat delivery (issue #6, ADR-2026-10-07).
//
// supabase/tests/191 simulates how Realtime authorizes a channel join. This script asks the real
// service, over a real websocket, and fails if the two disagree.
//
// LOCAL STACK ONLY. It signs seeded users in by asking the local stack for a magic-link token
// with the local stack's own service key, read at run time from `supabase status`. Nothing is
// stored, and it refuses to run against any host but 127.0.0.1 / localhost. Each run leaves a few
// "e2e ..." messages in a seeded class conversation; `supabase db reset` clears them.
//
// It also runs lib/chat's own queries (the ones the app will use) against the real rows it has
// just saved: the unit tests only check which calls those queries make, not what comes back.
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { createClient } from '@supabase/supabase-js';

// lib/chat is TypeScript. Node strips the types itself, but its imports have no file extension
// ('./messageList'), which Node will not resolve unaided.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && error?.code === 'ERR_MODULE_NOT_FOUND') {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
const { createMessagesApi } = await import('../lib/chat/messagesApi.ts');

const MEMBER_A = 'teacher1@bv-seed.test.local';
const MEMBER_B = 'multirole@bv-seed.test.local';
const OUTSIDER = 'admin1@bv-seed.test.local';
const JOIN_TIMEOUT_MS = 10_000;
const PING_TIMEOUT_MS = 5_000;
const FORGED_WAIT_MS = 2_000;
const WARM_UP_TIMEOUT_MS = 30_000;
const WARM_UP_RETRY_MS = 1_000;
const SETTLE_MS = 1_000;

const status = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
);
const url = status.API_URL;
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  console.error(`refusing to run against ${url}: this check is for the local stack only`);
  process.exit(2);
}

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

async function signIn(email) {
  const admin = createClient(url, status.SERVICE_ROLE_KEY, clientOptions);
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw new Error(`could not create a sign-in token for ${email}: ${link.error.message}`);
  const client = createClient(url, status.ANON_KEY, clientOptions);
  const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'email' });
  if (verified.error) throw new Error(`could not sign in ${email}: ${verified.error.message}`);
  await client.realtime.setAuth(verified.data.session.access_token);
  return { client, userId: verified.data.user.id };
}

function join(client, topic, onPing = () => {}) {
  return new Promise((resolve) => {
    const channel = client.channel(topic, { config: { private: true } });
    channel.on('broadcast', { event: 'message_saved' }, (message) => onPing(message.payload));
    const timeout = setTimeout(() => resolve({ channel, state: 'TIMED_OUT' }), JOIN_TIMEOUT_MS);
    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        clearTimeout(timeout);
        resolve({ channel, state });
      }
    });
  });
}

async function conversationIds({ client, userId }) {
  const { data, error } = await client.from('conversation_participants').select('conversation_id').eq('user_id', userId);
  if (error) throw new Error(`could not read conversation_participants: ${error.message}`);
  return new Set(data.map((row) => row.conversation_id));
}

async function main() {
  const a = await signIn(MEMBER_A);
  const b = await signIn(MEMBER_B);
  const outsider = await signIn(OUTSIDER);

  // Fixture preconditions, checked rather than assumed: the seed can change.
  const mine = await conversationIds(a);
  const shared = [...(await conversationIds(b))].filter((id) => mine.has(id));
  const notTheirs = await conversationIds(outsider);
  const conversationId = shared.find((id) => !notTheirs.has(id));
  if (!conversationId) {
    throw new Error(`the seed no longer has a conversation shared by ${MEMBER_A} and ${MEMBER_B} that ${OUTSIDER} is not in`);
  }
  const topic = `chat:${conversationId}`;

  // 1. A participant joins and receives the signal when another participant saves a message.
  const received = [];
  const joinedA = await join(a.client, topic, (payload) => received.push(payload));
  check(joinedA.state === 'SUBSCRIBED', 'a participant can join the conversation channel');

  const save = (body) =>
    b.client
      .from('messages')
      .insert({ conversation_id: conversationId, sender_user_id: b.userId, body, mention_targets: [] })
      .select('id, created_at')
      .single();
  const waitFor = async (arrived, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (!arrived() && Date.now() < deadline) await sleep(50);
  };

  // Realtime starts streaming database broadcasts lazily, on a project's first client connection,
  // and a signal saved before that stream is up is never delivered (measured at /build: the first
  // run after a restart lost its signal, every later run passed). In CI this script is the first
  // client, so save warm-up messages until one signal arrives. Their ids are remembered and their
  // signals are left out of every count below, however late they arrive.
  const warmUpIds = new Set();
  const pings = () => received.filter((payload) => !warmUpIds.has(payload?.id));
  const warmUpDeadline = Date.now() + WARM_UP_TIMEOUT_MS;
  while (joinedA.state === 'SUBSCRIBED' && received.length === 0 && Date.now() < warmUpDeadline) {
    const warmUp = await save('e2e warm-up');
    if (warmUp.error) throw new Error(`could not save a warm-up message: ${warmUp.error.message}`);
    warmUpIds.add(warmUp.data.id);
    await waitFor(() => received.length > 0, WARM_UP_RETRY_MS);
  }
  check(received.length > 0, 'the live service starts delivering signals within 30 seconds of the first join');

  const saved = await save('e2e join check');
  check(!saved.error, 'a participant can save a message with the four permitted columns');

  // Settle after the first arrival, so a duplicate signal is counted rather than missed.
  await waitFor(() => pings().length > 0, PING_TIMEOUT_MS);
  await sleep(SETTLE_MS);
  const [ping] = pings();
  check(pings().length === 1, 'the other participant receives exactly one signal for it');
  check(
    pings().length === 1 && Object.keys(ping).sort().join(',') === 'created_at,id',
    'the signal carries id and created_at and nothing else',
  );
  check(pings().length === 1 && ping.id === saved.data?.id, 'the signal names the saved message');

  // 2. Senders cannot choose created_at.
  const backdated = await b.client.from('messages').insert({
    conversation_id: conversationId,
    sender_user_id: b.userId,
    body: 'backdated',
    mention_targets: [],
    created_at: '2020-01-01T00:00:00Z',
  });
  check(backdated.error?.code === '42501', 'a save that supplies created_at is refused (42501)');

  // 3. Clients are listen-only: a send on the channel is not delivered.
  const joinedB = await join(b.client, topic);
  check(joinedB.state === 'SUBSCRIBED', 'the sending participant can also join');
  // Only from a joined channel: send() on an unjoined one falls back to REST, a different path.
  if (joinedB.state === 'SUBSCRIBED') {
    await joinedB.channel.send({ type: 'broadcast', event: 'message_saved', payload: { id: 'forged' } });
    await sleep(FORGED_WAIT_MS);
  }
  check(
    joinedB.state === 'SUBSCRIBED' && !received.some((payload) => payload?.id === 'forged'),
    'a signal sent by a client on the channel is not delivered',
  );
  // "Nothing arrived" only means something if the listener was still listening.
  const after = await save('e2e liveness check');
  await waitFor(() => received.some((payload) => payload?.id === after.data?.id), PING_TIMEOUT_MS);
  check(
    !after.error && received.some((payload) => payload?.id === after.data.id),
    'the listener was still live: it receives the next real signal',
  );

  // 4. Non-participants and malformed topics are refused. Each refused channel is removed at
  // once: left on the socket it keeps retrying and delays the others.
  for (const [who, client, refusedTopic, label] of [
    ['outsider', outsider.client, topic, 'a non-participant is refused the conversation channel'],
    ['participant', a.client, `chat:${conversationId.toUpperCase()}`, 'an uppercase topic is refused'],
    ['participant', a.client, 'chat:not-a-uuid', 'a malformed topic is refused'],
    ['participant', a.client, `room:${conversationId}`, 'a non-chat topic is refused'],
  ]) {
    const attempt = await join(client, refusedTopic);
    check(attempt.state === 'CHANNEL_ERROR', `${label} (${who})`);
    await client.removeChannel(attempt.channel);
  }

  // 5. The fetch is refused too: history access is what the channel policy mirrors.
  const fetched = await outsider.client.from('messages').select('id').eq('conversation_id', conversationId);
  check(!fetched.error && fetched.data.length === 0, 'a non-participant reads no messages of the conversation');

  // 6. lib/chat's own queries return the right real rows.
  const ids = (rows) => rows.map((row) => row.id).join(',');
  const viaApi = await createMessagesApi(b.client).insertMessage({
    conversationId,
    senderUserId: b.userId,
    body: 'e2e lib/chat save',
    mentionTargets: [],
  });
  check(
    Object.keys(viaApi).sort().join(',') === 'body,conversation_id,created_at,id,mention_targets,sender_user_id',
    'insertMessage saves and returns the row with the six columns the app reads',
  );

  const api = createMessagesApi(a.client);
  const latest = await api.fetchLatest(conversationId);
  check(
    latest[0]?.id === viaApi.id && [saved.data?.id, after.data?.id].every((id) => latest.some((row) => row.id === id)),
    'fetchLatest returns the saved messages, newest first',
  );

  // Everything strictly before the newest message is the rest of the newest page.
  const older = await api.fetchOlder(conversationId, latest[0]);
  check(
    latest.length > 1 && ids(older.slice(0, latest.length - 1)) === ids(latest.slice(1)),
    'fetchOlder returns exactly the messages before the given one, newest first',
  );

  // Only meaningful when the page holds the whole conversation, which a fresh stack guarantees.
  const cursor = new Date(Date.parse(saved.data?.created_at)).toISOString();
  const expectedSince = latest.filter((row) => Date.parse(row.created_at) >= Date.parse(cursor)).reverse();
  const since = await api.fetchSince(conversationId, cursor);
  check(
    latest.length < 50 && expectedSince.length >= 3 && expectedSince.length < latest.length && ids(since) === ids(expectedSince),
    'fetchSince returns exactly the messages at or after the cursor, oldest first',
  );

  check(
    (await api.isConversationReadable(conversationId)) === true,
    'isConversationReadable is true for a participant',
  );
  check(
    (await createMessagesApi(outsider.client).isConversationReadable(conversationId)) === false,
    'isConversationReadable is false for a non-participant',
  );

  await Promise.all([a, b, outsider].map(({ client }) => client.removeAllChannels()));
}

main()
  .catch((error) => {
    console.error(error.message);
    failures.push('the check did not run to completion');
  })
  .finally(() => {
    if (failures.length > 0) {
      console.error(`\n${failures.length} check(s) failed`);
      process.exit(1);
    }
    console.log('\nrealtime end-to-end join check passed');
    process.exit(0);
  });
