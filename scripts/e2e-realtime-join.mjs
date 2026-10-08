// End-to-end join check for realtime chat delivery (issue #6, ADR-2026-10-07).
//
// supabase/tests/191 simulates how Realtime authorizes a channel join. This script asks the real
// service, over a real websocket, and fails if the two disagree.
//
// LOCAL STACK ONLY. It signs seeded users in by asking the local stack for a magic-link token
// with the local stack's own service key, read at run time from `supabase status`. Nothing is
// stored, and it refuses to run against any host but 127.0.0.1 / localhost.
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const MEMBER_A = 'teacher1@bv-seed.test.local';
const MEMBER_B = 'multirole@bv-seed.test.local';
const OUTSIDER = 'admin1@bv-seed.test.local';
const JOIN_TIMEOUT_MS = 10_000;
const PING_TIMEOUT_MS = 5_000;
const FORGED_WAIT_MS = 2_000;
const WARM_UP_TIMEOUT_MS = 30_000;
const WARM_UP_RETRY_MS = 1_000;

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

async function conversationIds(client) {
  const { data, error } = await client.from('conversation_participants').select('conversation_id');
  if (error) throw new Error(`could not read conversation_participants: ${error.message}`);
  return new Set(data.map((row) => row.conversation_id));
}

async function main() {
  const a = await signIn(MEMBER_A);
  const b = await signIn(MEMBER_B);
  const outsider = await signIn(OUTSIDER);

  // Fixture preconditions, checked rather than assumed: the seed can change.
  const mine = await conversationIds(a.client);
  const shared = [...(await conversationIds(b.client))].filter((id) => mine.has(id));
  const notTheirs = await conversationIds(outsider.client);
  const conversationId = shared.find((id) => !notTheirs.has(id));
  if (!conversationId) {
    throw new Error(`the seed no longer has a conversation shared by ${MEMBER_A} and ${MEMBER_B} that ${OUTSIDER} is not in`);
  }
  const topic = `chat:${conversationId}`;

  // 1. A participant joins and receives the signal when another participant saves a message.
  const pings = [];
  const joinedA = await join(a.client, topic, (payload) => pings.push(payload));
  check(joinedA.state === 'SUBSCRIBED', 'a participant can join the conversation channel');

  // Realtime starts streaming database broadcasts lazily, on a project's first client connection,
  // and a signal saved before that stream is up is never delivered (measured at /build: the first
  // run after a restart lost its signal, every later run passed). In CI this script is the first
  // client, so save warm-up messages until one signal arrives, then start counting from zero.
  const warmUpDeadline = Date.now() + WARM_UP_TIMEOUT_MS;
  while (joinedA.state === 'SUBSCRIBED' && pings.length === 0 && Date.now() < warmUpDeadline) {
    await b.client
      .from('messages')
      .insert({ conversation_id: conversationId, sender_user_id: b.userId, body: 'e2e warm-up', mention_targets: [] });
    const retryAt = Date.now() + WARM_UP_RETRY_MS;
    while (pings.length === 0 && Date.now() < retryAt) await sleep(50);
  }
  check(pings.length > 0, 'the live service starts delivering signals within 30 seconds of the first join');
  await sleep(WARM_UP_RETRY_MS);
  pings.length = 0;

  const saved = await b.client
    .from('messages')
    .insert({ conversation_id: conversationId, sender_user_id: b.userId, body: 'e2e join check', mention_targets: [] })
    .select('id, created_at')
    .single();
  check(!saved.error, 'a participant can save a message with the four permitted columns');

  const deadline = Date.now() + PING_TIMEOUT_MS;
  while (pings.length === 0 && Date.now() < deadline) await sleep(50);
  check(pings.length === 1, 'the other participant receives exactly one signal for it');
  check(
    pings.length === 1 && Object.keys(pings[0]).sort().join(',') === 'created_at,id',
    'the signal carries id and created_at and nothing else',
  );
  check(pings.length === 1 && pings[0].id === saved.data?.id, 'the signal names the saved message');

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
  const before = pings.length;
  await joinedB.channel.send({ type: 'broadcast', event: 'message_saved', payload: { id: 'forged' } });
  await sleep(FORGED_WAIT_MS);
  check(pings.length === before, 'a signal sent by a client on the channel is not delivered');

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
