# notifications-infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Web Push delivery infra (VAPID + `web-push`) with chat `notify_level`/mention dispatch as its first trigger, plus the client subscribe flow, PWA scaffolding, and the SES-as-Auth-SMTP runbook — per `.docs/specs/system/notifications-infra.md` (signed off 2026-07-21) and ADR-0028.

**Architecture:** A new Netlify function `push-send` (service-role, US-East) is called by the client as a fire-and-forget follow-up after a `messages` insert; it re-derives recipients from `conversation_participants`/`notify_level`/mention targets (never trusts the client) and dispatches via `web-push`, cleaning up `410`-gone subscriptions. Client-side, a minimal hand-rolled PWA (`public/manifest.webmanifest` + `public/sw.js`) plus a `PushPermissionCard` wired into the nav shell handles subscription capture and iOS "Add to Home Screen" onboarding. No new tables/columns/RLS — `push_subscriptions` and the chat durability tables already exist and are unchanged.

**Tech Stack:** Netlify Functions (TypeScript), `@supabase/supabase-js` (service-role), `web-push` npm package, Expo Router (RN + RN-Web) with `react-native-unistyles`, Vitest.

## Global Constraints

- No new tables, columns, or RLS policies — confirmed unchanged in the spec's "Data & RLS impact" section.
- VAPID **private** key and SES credentials live only in `netlify/functions/` env; VAPID **public** key ships to the client as `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (constitution rule #2).
- `push-send` must reject any caller whose `caller_user_id` doesn't match the message's `sender_user_id` — `403`, not silently processed (design sign-off, 2026-07-21).
- Every push payload (title/body/tag/data) is PII-free — copy is keyed off `conversations.kind` only, never `scope_id`, sender name, or message body (AC#9).
- The client's `push-send` call is fire-and-forget: the chat-send UX resolves on the `messages` insert alone, never awaits/blocks on/surfaces errors from `push-send` (ADR-0028 accepted gap).
- A `404`/`410` response from the push service deletes that `push_subscriptions` row; other failures are logged and skipped — no retry queue at POC (AC#6).
- A recipient with zero subscriptions is silently skipped — no error, no email fallback (AC#7).
- `push-send` is always `200` past auth/validation (phases 0–1); malformed/unauthenticated requests still get `401`/`422`/`403` (design contract).
- US-East region pin in `netlify.toml` for the new function, matching `csv-import`/`user-role-grant`/`user-role-sweep`.
- No custom `email-send` function — SES-as-Auth-SMTP is infra/config only (explicitly out of scope, confirmed at `/architect`).
- Design DoD: Unistyles tokens only (no hex/spacing literals in RN components), one primary action + one secondary, ≥44px touch targets (`theme.chrome.hitMin`).
- **Deferred to `/test`:** pgTAP/adversarial coverage for the caller≠sender check and mention-matching filter is a `/test`-stage obligation per the spec's hand-off — this plan's Vitest coverage is the TDD red/green cycle for the code itself, not a substitute for that adversarial pass.

## Shared Seam

No migration in this item, so there's no schema seam to serialize. Task 1 (deps + env/config) is a hard prerequisite for Tasks 3–4 (server) since they need `web-push` installed and the env var names decided. After Task 1, **server tasks (2–4)** and **client tasks (5–12)** touch fully disjoint files and can proceed in parallel; Task 13 (nav-shell wiring) and Task 14 (runbook) are independent leaves. All work happens directly on the current branch `ssrinivas90/issue-5-notifications-infra` — no new worktree needed, this item doesn't touch schema.

---

### Task 1: Dependencies + env/config scaffolding

**Files:**
- Modify: `package.json` (via `npm install`)
- Modify: `.env.example`
- Modify: `netlify.toml`

**Interfaces:**
- Produces: `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` env var names — every later server/client task reads exactly these names.

- [ ] **Step 1: Install `web-push` (runtime) and `@types/web-push` (dev)**

```bash
npm install web-push
npm install --save-dev @types/web-push
```

- [ ] **Step 2: Update `.env.example`** — rename the existing server-only `VAPID_PUBLIC_KEY` to the client-bundled `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (it's not secret — same pattern as `EXPO_PUBLIC_SUPABASE_URL`), and add `VAPID_SUBJECT` (the `mailto:` contact `web-push`'s VAPID handshake requires) to the server-only section.

Replace the full file content with:

```bash
# ── Client (safe to expose; EXPO_PUBLIC_ is bundled into the app) ──
# Local Supabase defaults printed by `npm run db:start`.
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_VAPID_PUBLIC_KEY=

# ── Server-only (NEVER EXPO_PUBLIC_; read only in netlify/functions) ──
# Fill from `npm run db:start` output for local; real values live in Netlify env per-context.
SUPABASE_SERVICE_ROLE_KEY=
VAPID_PRIVATE_KEY=
# mailto: contact web-push's VAPID handshake requires — placeholder, set to a real
# project contact address before /deploy-staging.
VAPID_SUBJECT=mailto:admin@example.org
SES_REGION=us-east-2
SES_ACCESS_KEY_ID=
SES_SECRET_ACCESS_KEY=
```

- [ ] **Step 3: Add the `push-send` region-pin block to `netlify.toml`** — matches the existing `csv-import`/`user-role-grant`/`user-role-sweep` comment-only blocks (region is pinned at the account/site level; this documents intent).

Insert after the `[functions.user-role-grant]` block:

```toml
[functions.push-send]
  # US-East region (compliance perimeter §3/§7.2) — same as health/csv-import.
  # Holds the VAPID private key; never add EXPO_PUBLIC_* secrets here.
```

- [ ] **Step 4: Verify install + typecheck**

Run: `npm run typecheck`
Expected: no new errors (no code references the new package yet, so this only confirms the install didn't break anything).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example netlify.toml
git commit -m "chore: add web-push dependency + push-send env/region scaffolding"
```

---

### Task 2: `push-dispatch.ts` — recipient filter + payload copy (pure logic)

**Files:**
- Create: `netlify/functions/lib/push-dispatch.ts`
- Test: `netlify/functions/__tests__/push-dispatch.test.ts`

**Interfaces:**
- Produces: `isRecipient(cp: ConversationParticipant, senderUserId: string, mentionTargets: string[]): boolean`, `payloadTitleForKind(kind: ConversationKind): string`, types `ConversationParticipant`, `ConversationKind`, `NotifyLevel`, `ParticipantRole` — consumed by Task 4's `push-send.ts`.

- [ ] **Step 1: Write the failing test**

Create `netlify/functions/__tests__/push-dispatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isRecipient, payloadTitleForKind, type ConversationParticipant } from '../lib/push-dispatch';

const SENDER = 'sender-uuid';
const OTHER = 'other-uuid';

function participant(overrides: Partial<ConversationParticipant> = {}): ConversationParticipant {
  return { user_id: OTHER, participant_role: 'student', notify_level: 'all', ...overrides };
}

describe('isRecipient', () => {
  it('never returns true for the sender, even at notify_level "all"', () => {
    expect(isRecipient(participant({ user_id: SENDER, notify_level: 'all' }), SENDER, [])).toBe(false);
  });

  it('notify_level "muted" is never a recipient, regardless of mentions', () => {
    expect(isRecipient(participant({ notify_level: 'muted' }), SENDER, ['individual:other-uuid'])).toBe(false);
  });

  it('notify_level "all" is always a recipient (non-sender)', () => {
    expect(isRecipient(participant({ notify_level: 'all' }), SENDER, [])).toBe(true);
  });

  it('notify_level "mentions": excluded when no mention target matches', () => {
    expect(isRecipient(participant({ notify_level: 'mentions', participant_role: 'student' }), SENDER, ['parents'])).toBe(false);
  });

  it('notify_level "mentions": included when mentionTargets includes their role ("students")', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', participant_role: 'student' }), SENDER, ['students'])
    ).toBe(true);
  });

  it('notify_level "mentions": included when mentionTargets includes their role ("parents")', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', participant_role: 'parent' }), SENDER, ['parents'])
    ).toBe(true);
  });

  it('notify_level "mentions": "students" target does not match a parent participant', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', participant_role: 'parent' }), SENDER, ['students'])
    ).toBe(false);
  });

  it('notify_level "mentions": included when individually targeted by user_id', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', user_id: OTHER, participant_role: 'teacher' }), SENDER, [
        `individual:${OTHER}`,
      ])
    ).toBe(true);
  });

  it('notify_level "mentions": an individual target for a different user_id does not match', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', user_id: OTHER }), SENDER, ['individual:someone-else'])
    ).toBe(false);
  });
});

describe('payloadTitleForKind', () => {
  it('class -> "New message in your class chat"', () => expect(payloadTitleForKind('class')).toBe('New message in your class chat'));
  it('session_staff -> "New message in your session staff chat"', () =>
    expect(payloadTitleForKind('session_staff')).toBe('New message in your session staff chat'));
  it('leadership -> "New message in the leadership chat"', () =>
    expect(payloadTitleForKind('leadership')).toBe('New message in the leadership chat'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run netlify/functions/__tests__/push-dispatch.test.ts`
Expected: FAIL — `Cannot find module '../lib/push-dispatch'`

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/push-dispatch.ts`:

```ts
export type NotifyLevel = 'all' | 'mentions' | 'muted';
export type ParticipantRole = 'student' | 'parent' | 'teacher' | 'coordinator' | 'bv_coordinator' | 'admin';
export type ConversationKind = 'class' | 'session_staff' | 'leadership';

export interface ConversationParticipant {
  user_id: string;
  participant_role: ParticipantRole;
  notify_level: NotifyLevel;
}

// notify_level dispatch rule (ADR-0016, design spec's "notify_level / mention-matching
// filter") — mention_targets values are fixed by core-schema-and-rls's messages schema:
// 'parents' | 'students' | 'individual:<user_id>'.
export function isRecipient(cp: ConversationParticipant, senderUserId: string, mentionTargets: string[]): boolean {
  if (cp.user_id === senderUserId) return false;
  if (cp.notify_level === 'all') return true;
  if (cp.notify_level === 'muted') return false;
  return (
    (mentionTargets.includes('students') && cp.participant_role === 'student') ||
    (mentionTargets.includes('parents') && cp.participant_role === 'parent') ||
    mentionTargets.includes(`individual:${cp.user_id}`)
  );
}

// PII-free payload copy, keyed off conversations.kind only — never scope_id, sender name,
// or message body (AC#9, design spec's "payload copy is keyed off conversations.kind only").
const PAYLOAD_TITLE_BY_KIND: Record<ConversationKind, string> = {
  class: 'New message in your class chat',
  session_staff: 'New message in your session staff chat',
  leadership: 'New message in the leadership chat',
};

export function payloadTitleForKind(kind: ConversationKind): string {
  return PAYLOAD_TITLE_BY_KIND[kind];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run netlify/functions/__tests__/push-dispatch.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/push-dispatch.ts netlify/functions/__tests__/push-dispatch.test.ts
git commit -m "feat: push-dispatch recipient filter + PII-free payload copy"
```

---

### Task 3: `push-delivery.ts` — `web-push` wrapper

**Files:**
- Create: `netlify/functions/lib/push-delivery.ts`
- Test: `netlify/functions/__tests__/push-delivery.test.ts`

**Interfaces:**
- Consumes: `web-push` package (`setVapidDetails`, `sendNotification`).
- Produces: `configureVapid(subject: string, publicKey: string, privateKey: string): void`, `sendPush(sub: PushSubscriptionRow, payload: { title: string }): Promise<PushSendOutcome>`, types `PushSubscriptionRow`, `PushSendOutcome` — consumed by Task 4's `push-send.ts`.

- [ ] **Step 1: Write the failing test**

Create `netlify/functions/__tests__/push-delivery.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetVapidDetails = vi.fn();
const mockSendNotification = vi.fn();
vi.mock('web-push', () => ({
  default: { setVapidDetails: mockSetVapidDetails, sendNotification: mockSendNotification },
}));

import { configureVapid, sendPush } from '../lib/push-delivery';

const SUB = { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh_key: 'p256dh-fixture', auth_key: 'auth-fixture' };
const PAYLOAD = { title: 'New message in your class chat' };

beforeEach(() => {
  mockSetVapidDetails.mockReset();
  mockSendNotification.mockReset();
});

describe('configureVapid', () => {
  it('forwards subject/publicKey/privateKey to web-push.setVapidDetails', () => {
    configureVapid('mailto:admin@example.org', 'pub-key', 'priv-key');
    expect(mockSetVapidDetails).toHaveBeenCalledWith('mailto:admin@example.org', 'pub-key', 'priv-key');
  });
});

describe('sendPush', () => {
  it('sends the subscription + JSON payload and returns {status:"sent"} on success', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 });
    const outcome = await sendPush(SUB, PAYLOAD);
    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: SUB.endpoint, keys: { p256dh: SUB.p256dh_key, auth: SUB.auth_key } },
      JSON.stringify(PAYLOAD)
    );
    expect(outcome).toEqual({ status: 'sent' });
  });

  it('returns {status:"gone"} on a 410 error (AC#6 expired-subscription cleanup)', async () => {
    mockSendNotification.mockRejectedValue({ statusCode: 410 });
    expect(await sendPush(SUB, PAYLOAD)).toEqual({ status: 'gone' });
  });

  it('returns {status:"gone"} on a 404 error (permanently-invalid endpoint)', async () => {
    mockSendNotification.mockRejectedValue({ statusCode: 404 });
    expect(await sendPush(SUB, PAYLOAD)).toEqual({ status: 'gone' });
  });

  it('returns {status:"failed"} on a transient 5xx error (logged and skipped, no retry)', async () => {
    const err = { statusCode: 503 };
    mockSendNotification.mockRejectedValue(err);
    expect(await sendPush(SUB, PAYLOAD)).toEqual({ status: 'failed', error: err });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run netlify/functions/__tests__/push-delivery.test.ts`
Expected: FAIL — `Cannot find module '../lib/push-delivery'`

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/push-delivery.ts`:

```ts
import webPush from 'web-push';

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

export type PushSendOutcome = { status: 'sent' } | { status: 'gone' } | { status: 'failed'; error: unknown };

export function configureVapid(subject: string, publicKey: string, privateKey: string): void {
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

// 404/410 from the push service means the endpoint is permanently gone (AC#6) — the
// caller deletes that push_subscriptions row. Any other failure (e.g. transient 5xx) is
// {status:'failed'} — logged and skipped by the caller, no retry queue at POC.
export async function sendPush(sub: PushSubscriptionRow, payload: { title: string }): Promise<PushSendOutcome> {
  try {
    await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
      JSON.stringify(payload)
    );
    return { status: 'sent' };
  } catch (err) {
    const statusCode = (err as { statusCode?: number } | null)?.statusCode;
    if (statusCode === 404 || statusCode === 410) return { status: 'gone' };
    return { status: 'failed', error: err };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run netlify/functions/__tests__/push-delivery.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/push-delivery.ts netlify/functions/__tests__/push-delivery.test.ts
git commit -m "feat: push-delivery web-push wrapper with gone/failed classification"
```

---

### Task 4: `push-send.ts` — the Netlify function handler

**Files:**
- Create: `netlify/functions/push-send.ts`
- Test: `netlify/functions/__tests__/push-send.test.ts`

**Interfaces:**
- Consumes: `isRecipient`, `payloadTitleForKind` from Task 2's `push-dispatch.ts`; `configureVapid`, `sendPush` from Task 3's `push-delivery.ts`.
- Produces: `handler: Handler` — the `POST /.netlify/functions/push-send` entry point. Response shape: `{ status: 'dispatched' | 'noop', recipients: number, sent: number, cleaned_up: number }` on 200; `{ reason: string }` on 401/403/422.

- [ ] **Step 1: Write the failing test**

Create `netlify/functions/__tests__/push-send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HandlerEvent } from '@netlify/functions';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => mockSupabaseClient) }));
vi.mock('../lib/push-delivery', () => ({
  configureVapid: vi.fn(),
  sendPush: vi.fn(),
}));

const mockGetUser = vi.fn();
let tables: {
  messages: Record<string, unknown> | null;
  conversations: Record<string, unknown> | null;
  conversation_participants: Array<Record<string, unknown>>;
  push_subscriptions: Array<Record<string, unknown>>;
};
const deleteEq = vi.fn().mockResolvedValue({ data: null, error: null });

function mockFrom(table: string) {
  if (table === 'messages') {
    return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: tables.messages, error: null }) }) }) };
  }
  if (table === 'conversations') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: tables.conversations, error: null }) }) }),
    };
  }
  if (table === 'conversation_participants') {
    return { select: () => ({ eq: () => Promise.resolve({ data: tables.conversation_participants, error: null }) }) };
  }
  if (table === 'push_subscriptions') {
    return {
      select: () => ({ in: () => Promise.resolve({ data: tables.push_subscriptions, error: null }) }),
      delete: () => ({ eq: deleteEq }),
    };
  }
  throw new Error(`unexpected table: ${table}`);
}

const mockSupabaseClient = { auth: { getUser: mockGetUser }, from: vi.fn(mockFrom) };

import * as pushDelivery from '../lib/push-delivery';
import { handler } from '../push-send';

const SENDER_ID = 'sender-uuid';
const CALLER_ID = 'sender-uuid'; // caller == sender in the happy path
const MESSAGE_ID = '11111111-1111-1111-1111-111111111111';
const CONVERSATION_ID = '22222222-2222-2222-2222-222222222222';

function makeEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer valid-token' },
    body: JSON.stringify({ message_id: MESSAGE_ID }),
    isBase64Encoded: false,
    rawUrl: '/api/push-send',
    rawQuery: '',
    path: '/api/push-send',
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    multiValueHeaders: {},
    ...overrides,
  } as HandlerEvent;
}

function body(obj: unknown): string {
  return JSON.stringify(obj);
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: CALLER_ID } }, error: null });
  deleteEq.mockClear();
  vi.mocked(pushDelivery.sendPush).mockReset();
  vi.mocked(pushDelivery.sendPush).mockResolvedValue({ status: 'sent' });
  tables = {
    messages: { id: MESSAGE_ID, conversation_id: CONVERSATION_ID, sender_user_id: SENDER_ID, mention_targets: [] },
    conversations: { kind: 'class' },
    conversation_participants: [{ user_id: 'recipient-1', participant_role: 'student', notify_level: 'all' }],
    push_subscriptions: [{ id: 'sub-1', endpoint: 'https://push.example/1', p256dh_key: 'p', auth_key: 'a' }],
  };
});

describe('push-send handler', () => {
  it('401s when the Authorization header is missing', async () => {
    const res = await handler(makeEvent({ headers: {} }), {} as never);
    expect(res.statusCode).toBe(401);
  });

  it('401s when getUser returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const res = await handler(makeEvent(), {} as never);
    expect(res.statusCode).toBe(401);
  });

  it('422s on malformed JSON body', async () => {
    const res = await handler(makeEvent({ body: '{not json' }), {} as never);
    expect(res.statusCode).toBe(422);
  });

  it('422s when message_id is missing or not a UUID', async () => {
    const res = await handler(makeEvent({ body: body({ message_id: 'not-a-uuid' }) }), {} as never);
    expect(res.statusCode).toBe(422);
  });

  it('200 noop when the message does not exist', async () => {
    tables.messages = null;
    const res = await handler(makeEvent(), {} as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toMatchObject({ status: 'noop' });
  });

  it('403s when the caller is not the message sender (notification-spam guard, design sign-off)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'someone-else' } }, error: null });
    const res = await handler(makeEvent(), {} as never);
    expect(res.statusCode).toBe(403);
  });

  it('dispatches to notify_level="all" participants and excludes the sender even if present', async () => {
    tables.conversation_participants = [
      { user_id: SENDER_ID, participant_role: 'teacher', notify_level: 'all' },
      { user_id: 'recipient-1', participant_role: 'student', notify_level: 'all' },
    ];
    const res = await handler(makeEvent(), {} as never);
    const parsed = JSON.parse(res.body as string);
    expect(parsed).toEqual({ status: 'dispatched', recipients: 1, sent: 1, cleaned_up: 0 });
  });

  it('excludes a muted participant entirely', async () => {
    tables.conversation_participants = [{ user_id: 'recipient-1', participant_role: 'student', notify_level: 'muted' }];
    const res = await handler(makeEvent(), {} as never);
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });
    expect(pushDelivery.sendPush).not.toHaveBeenCalled();
  });

  it('mentions-level participant is included only when the message targets them', async () => {
    tables.messages = { ...tables.messages!, mention_targets: ['students'] };
    tables.conversation_participants = [{ user_id: 'recipient-1', participant_role: 'student', notify_level: 'mentions' }];
    const res = await handler(makeEvent(), {} as never);
    expect(JSON.parse(res.body as string)).toMatchObject({ recipients: 1, sent: 1 });
  });

  it('fans out to every push_subscriptions row for a multi-device recipient', async () => {
    tables.push_subscriptions = [
      { id: 'sub-1', endpoint: 'https://push.example/1', p256dh_key: 'p1', auth_key: 'a1' },
      { id: 'sub-2', endpoint: 'https://push.example/2', p256dh_key: 'p2', auth_key: 'a2' },
    ];
    const res = await handler(makeEvent(), {} as never);
    expect(pushDelivery.sendPush).toHaveBeenCalledTimes(2);
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 1, sent: 2, cleaned_up: 0 });
  });

  it('deletes a subscription that comes back {status:"gone"} and counts it as cleaned_up, not sent', async () => {
    vi.mocked(pushDelivery.sendPush).mockResolvedValue({ status: 'gone' });
    const res = await handler(makeEvent(), {} as never);
    expect(deleteEq).toHaveBeenCalledWith('id', 'sub-1');
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 1, sent: 0, cleaned_up: 1 });
  });

  it('a {status:"failed"} subscription is neither sent nor cleaned_up, and does not throw', async () => {
    vi.mocked(pushDelivery.sendPush).mockResolvedValue({ status: 'failed', error: { statusCode: 503 } });
    const res = await handler(makeEvent(), {} as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 1, sent: 0, cleaned_up: 0 });
  });

  it('silent no-op (not an error) when the recipient has zero push_subscriptions (AC#7)', async () => {
    tables.push_subscriptions = [];
    const res = await handler(makeEvent(), {} as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 1, sent: 0, cleaned_up: 0 });
  });

  it('payload passed to sendPush carries only a generic, kind-derived title — no PII (AC#9)', async () => {
    await handler(makeEvent(), {} as never);
    expect(pushDelivery.sendPush).toHaveBeenCalledWith(expect.anything(), { title: 'New message in your class chat' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run netlify/functions/__tests__/push-send.test.ts`
Expected: FAIL — `Cannot find module '../push-send'`

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/push-send.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run netlify/functions/__tests__/push-send.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Run the full server-side test suite + typecheck**

Run: `npx vitest run netlify/functions/__tests__/ && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/push-send.ts netlify/functions/__tests__/push-send.test.ts
git commit -m "feat: push-send Netlify function (issue #5)"
```

---

### Task 5: `lib/notifications/vapidKey.ts` — VAPID public key decode

**Files:**
- Create: `lib/notifications/vapidKey.ts`
- Test: `lib/notifications/__tests__/vapidKey.test.ts`

**Interfaces:**
- Produces: `urlBase64ToUint8Array(base64String: string): Uint8Array` — consumed by Task 8's `subscribeToPush.ts` wiring (`applicationServerKey`).

- [ ] **Step 1: Write the failing test**

Create `lib/notifications/__tests__/vapidKey.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from '../vapidKey';

describe('urlBase64ToUint8Array', () => {
  it('decodes an unpadded base64url string to its raw bytes ("Hello")', () => {
    // "SGVsbG8=" is standard-base64 "Hello"; url-safe + unpadded form is "SGVsbG8"
    const bytes = urlBase64ToUint8Array('SGVsbG8');
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  it('handles "-" and "_" url-safe substitutions', () => {
    // base64 "Pj4/Pw==" ("><?>" -> bytes 62,62,63,63... using a string that needs +/ chars)
    // "+" -> "-" and "/" -> "_" round-trip: encode bytes [251,255,191] as base64 "+/+/"-like
    // Simpler deterministic case: standard base64 "Pj4-Pw" has no +/ so use a real one.
    const standard = btoa('>>??'); // "Pj4/Pw=="
    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const bytes = urlBase64ToUint8Array(urlSafe);
    expect(new TextDecoder().decode(bytes)).toBe('>>??');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/__tests__/vapidKey.test.ts`
Expected: FAIL — `Cannot find module '../vapidKey'`

- [ ] **Step 3: Write the implementation**

Create `lib/notifications/vapidKey.ts`:

```ts
// Standard VAPID public-key decode (applicationServerKey must be a raw Uint8Array, not a
// string) — url-safe base64 without padding, per the Web Push subscribe() contract.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/__tests__/vapidKey.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/vapidKey.ts lib/notifications/__tests__/vapidKey.test.ts
git commit -m "feat: VAPID public key url-base64 decode helper"
```

---

### Task 6: `lib/notifications/promptState.ts` — dismissed-flag persistence

**Files:**
- Create: `lib/notifications/promptState.ts`
- Test: `lib/notifications/__tests__/promptState.test.ts`

**Interfaces:**
- Produces: `hasDismissedPushPrompt(storage: KeyValueStorage): boolean`, `dismissPushPrompt(storage: KeyValueStorage): void`, type `KeyValueStorage` — consumed by Task 11's `PushPermissionCard.tsx`.

- [ ] **Step 1: Write the failing test**

Create `lib/notifications/__tests__/promptState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasDismissedPushPrompt, dismissPushPrompt, type KeyValueStorage } from '../promptState';

function fakeStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

describe('promptState', () => {
  it('hasDismissedPushPrompt is false before any dismissal', () => {
    expect(hasDismissedPushPrompt(fakeStorage())).toBe(false);
  });

  it('dismissPushPrompt persists the dismissal, and hasDismissedPushPrompt reflects it', () => {
    const storage = fakeStorage();
    dismissPushPrompt(storage);
    expect(hasDismissedPushPrompt(storage)).toBe(true);
  });

  it('an unrelated stored value under the same key does not count as dismissed', () => {
    const storage = fakeStorage();
    storage.setItem('bv-push-prompt-dismissed', 'not-true');
    expect(hasDismissedPushPrompt(storage)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/__tests__/promptState.test.ts`
Expected: FAIL — `Cannot find module '../promptState'`

- [ ] **Step 3: Write the implementation**

Create `lib/notifications/promptState.ts`:

```ts
const STORAGE_KEY = 'bv-push-prompt-dismissed';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// "Shown once, near first meaningful action" (design spec) — dismissal is sticky per
// browser/device (web-only feature, so plain localStorage is sufficient; unlike
// lib/auth/storage.ts this isn't session-sensitive data, so no encryption is needed).
export function hasDismissedPushPrompt(storage: KeyValueStorage): boolean {
  return storage.getItem(STORAGE_KEY) === 'true';
}

export function dismissPushPrompt(storage: KeyValueStorage): void {
  storage.setItem(STORAGE_KEY, 'true');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/__tests__/promptState.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/promptState.ts lib/notifications/__tests__/promptState.test.ts
git commit -m "feat: push-prompt dismissed-flag persistence"
```

---

### Task 7: `lib/notifications/installHint.ts` — iOS "Add to Home Screen" detection

**Files:**
- Create: `lib/notifications/installHint.ts`
- Test: `lib/notifications/__tests__/installHint.test.ts`

**Interfaces:**
- Produces: `needsIosInstallHint(userAgent: string, isStandalone: boolean): boolean` — consumed by Task 12's `AddToHomeScreenHint.tsx`.

- [ ] **Step 1: Write the failing test**

Create `lib/notifications/__tests__/installHint.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { needsIosInstallHint } from '../installHint';

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

describe('needsIosInstallHint', () => {
  it('true for iPhone Safari not yet installed to Home Screen (highest-risk POC case, doc 3 §8.1)', () => {
    expect(needsIosInstallHint(IOS_SAFARI_UA, false)).toBe(true);
  });

  it('false for iPhone once already running as an installed standalone PWA', () => {
    expect(needsIosInstallHint(IOS_SAFARI_UA, true)).toBe(false);
  });

  it('false for iPad Safari not standalone (still iOS — the flow still applies) is true, not false', () => {
    const ipadUa = IOS_SAFARI_UA.replace('iPhone', 'iPad');
    expect(needsIosInstallHint(ipadUa, false)).toBe(true);
  });

  it('false for a non-iOS UA (Android), regardless of standalone state', () => {
    expect(needsIosInstallHint(ANDROID_CHROME_UA, false)).toBe(false);
  });

  it('false for an empty user agent (defensive)', () => {
    expect(needsIosInstallHint('', false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/__tests__/installHint.test.ts`
Expected: FAIL — `Cannot find module '../installHint'`

- [ ] **Step 3: Write the implementation**

Create `lib/notifications/installHint.ts`:

```ts
// Web Push on iOS only fires for a PWA added to the Home Screen (iOS 16.4+), not a plain
// Safari tab (doc 3 §8.1, highest-risk POC item) — surface the install hint whenever the
// device is iOS and not already running standalone.
export function needsIosInstallHint(userAgent: string, isStandalone: boolean): boolean {
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  return isIos && !isStandalone;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/__tests__/installHint.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/installHint.ts lib/notifications/__tests__/installHint.test.ts
git commit -m "feat: iOS Add-to-Home-Screen install-hint detection"
```

---

### Task 8: `lib/notifications/subscribeToPush.ts` — subscribe orchestration

**Files:**
- Create: `lib/notifications/subscribeToPush.ts`
- Test: `lib/notifications/__tests__/subscribeToPush.test.ts`

**Interfaces:**
- Produces: `subscribeToPush(deps: SubscribeToPushDeps): Promise<PushSubscriptionKeys>`, types `SubscribeToPushDeps`, `PushSubscriptionKeys` — consumed by Task 10's `registerForPush.ts` (real-deps wiring, untested per the "shared seam" convention below).

- [ ] **Step 1: Write the failing test**

Create `lib/notifications/__tests__/subscribeToPush.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { subscribeToPush } from '../subscribeToPush';

describe('subscribeToPush', () => {
  it('registers the service worker, subscribes with the given key, and upserts the resulting endpoint/keys', async () => {
    const applicationServerKey = new Uint8Array([1, 2, 3]);
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: 'https://push.example/xyz',
      toJSON: () => ({ keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
    });
    const register = vi.fn().mockResolvedValue({ pushManager: { subscribe } });
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);

    const result = await subscribeToPush({ register, applicationServerKey, upsertSubscription });

    expect(register).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey });
    expect(upsertSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.example/xyz',
      p256dhKey: 'p256dh-value',
      authKey: 'auth-value',
    });
    expect(result).toEqual({ endpoint: 'https://push.example/xyz', p256dhKey: 'p256dh-value', authKey: 'auth-value' });
  });

  it('falls back to empty strings if the browser subscription JSON is missing keys (defensive)', async () => {
    const subscribe = vi.fn().mockResolvedValue({ endpoint: 'https://push.example/xyz', toJSON: () => ({}) });
    const register = vi.fn().mockResolvedValue({ pushManager: { subscribe } });
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);

    const result = await subscribeToPush({ register, applicationServerKey: new Uint8Array(), upsertSubscription });
    expect(result).toEqual({ endpoint: 'https://push.example/xyz', p256dhKey: '', authKey: '' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/notifications/__tests__/subscribeToPush.test.ts`
Expected: FAIL — `Cannot find module '../subscribeToPush'`

- [ ] **Step 3: Write the implementation**

Create `lib/notifications/subscribeToPush.ts`:

```ts
export interface PushSubscriptionKeys {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
}

interface PushManagerLike {
  subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }): Promise<{
    endpoint: string;
    toJSON: () => { keys?: { p256dh?: string; auth?: string } };
  }>;
}

export interface SubscribeToPushDeps {
  register: () => Promise<{ pushManager: PushManagerLike }>;
  applicationServerKey: Uint8Array;
  upsertSubscription: (keys: PushSubscriptionKeys) => Promise<void>;
}

// Orchestration only, with every browser/DB effect injected — the real `navigator
// .serviceWorker.register` / `supabase.from('push_subscriptions').upsert` wiring lives in
// registerForPush.ts (untested wiring, matching components/DesktopSidebar.tsx's pattern of
// "pure logic tested, JSX/browser wiring verified live at /test").
export async function subscribeToPush(deps: SubscribeToPushDeps): Promise<PushSubscriptionKeys> {
  const registration = await deps.register();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: deps.applicationServerKey,
  });
  const json = subscription.toJSON();
  const keys: PushSubscriptionKeys = {
    endpoint: subscription.endpoint,
    p256dhKey: json.keys?.p256dh ?? '',
    authKey: json.keys?.auth ?? '',
  };
  await deps.upsertSubscription(keys);
  return keys;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/notifications/__tests__/subscribeToPush.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/subscribeToPush.ts lib/notifications/__tests__/subscribeToPush.test.ts
git commit -m "feat: subscribeToPush orchestration (injected browser/DB deps)"
```

---

### Task 9: PWA scaffolding — manifest, service worker, HTML head

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `public/icons/icon-1024.png` (copy of `assets/images/icon.png`)
- Create: `app/+html.tsx`

**Interfaces:**
- Produces: `/manifest.webmanifest`, `/sw.js` static routes served verbatim by Expo's static web export — consumed by Task 10's `registerForPush.ts` (`navigator.serviceWorker.register('/sw.js')`) and by the browser's install/push machinery directly.

This task has no unit-test cycle — it's static config + markup. Verification is the manual/build step below, matching the codebase's existing convention that JSX/browser wiring is "verified live via playwright-cli at /test" (see `components/DesktopSidebar.tsx`'s test comment).

- [ ] **Step 1: Copy the app icon into `public/` for the manifest to reference**

```bash
mkdir -p public/icons
cp assets/images/icon.png public/icons/icon-1024.png
```

- [ ] **Step 2: Create `public/manifest.webmanifest`**

```json
{
  "name": "Bala Vihar App",
  "short_name": "Bala Vihar",
  "description": "CMDFW Bala Vihar — classes, chat, and attendance for students, parents, and teachers.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f7f1e6",
  "theme_color": "#b8531a",
  "icons": [
    {
      "src": "/icons/icon-1024.png",
      "sizes": "1024x1024",
      "type": "image/png",
      "purpose": "any"
    }
  ]
}
```

`background_color`/`theme_color` are copied from `lib/theme.ts`'s `colors.bg`/`colors.primary` — this file lives outside Unistyles' reach (it's a static web manifest, not RN styling), so the values are transcribed by hand rather than referencing the token module.

- [ ] **Step 3: Create `public/sw.js`** — minimal hand-written service worker (no Workbox, no offline caching, per the design spec's explicit scope limit).

```js
self.addEventListener('push', (event) => {
  let payload = { title: 'New update', body: '' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // Payload missing or not JSON — fall back to the generic title above rather than
    // throwing (a malformed push must never crash the worker).
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-1024.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});
```

- [ ] **Step 4: Create `app/+html.tsx`** — Expo Router's root-HTML customization file (none exists yet; the static web export currently uses Expo's own default template). Adds the manifest `<link>` on top of the standard boilerplate.

```tsx
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Verify the static export serves all three files and the manifest link lands in the head**

```bash
npx expo export --platform web --output-dir /tmp/bv-web-export-check
grep -o '<link rel="manifest"[^>]*>' /tmp/bv-web-export-check/index.html
ls /tmp/bv-web-export-check/manifest.webmanifest /tmp/bv-web-export-check/sw.js /tmp/bv-web-export-check/icons/icon-1024.png
rm -rf /tmp/bv-web-export-check
```

Expected: the `grep` prints the manifest `<link>` tag; all three `ls` targets exist in the export output.

- [ ] **Step 6: Commit**

```bash
git add public/manifest.webmanifest public/sw.js public/icons/icon-1024.png app/+html.tsx
git commit -m "feat: PWA scaffolding — manifest, service worker, HTML head (first in this repo)"
```

---

### Task 10: `lib/notifications/registerForPush.ts` — real-deps wiring

**Files:**
- Create: `lib/notifications/registerForPush.ts`

**Interfaces:**
- Consumes: `subscribeToPush` (Task 8), `urlBase64ToUint8Array` (Task 5), `supabase` client (`lib/supabase.ts`), `useSession()`'s `session.user.id` (caller passes it in).
- Produces: `subscribeForPush(userId: string): Promise<void>` — consumed by Task 11's `PushPermissionCard.tsx`.

This is the untested "shared seam" wiring layer (real `navigator.serviceWorker`/Supabase calls) — all its decision logic already lives in Task 8's unit-tested `subscribeToPush`. Verified live via manual browser test / playwright-cli at `/test`, matching `components/DesktopSidebar.tsx`'s existing convention for JSX/browser wiring.

- [ ] **Step 1: Write the implementation**

Create `lib/notifications/registerForPush.ts`:

```ts
import { supabase } from '../supabase';
import { urlBase64ToUint8Array } from './vapidKey';
import { subscribeToPush, type PushSubscriptionKeys } from './subscribeToPush';

export async function subscribeForPush(userId: string): Promise<void> {
  const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  await subscribeToPush({
    register: () => navigator.serviceWorker.register('/sw.js'),
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    upsertSubscription: (keys: PushSubscriptionKeys) =>
      supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: userId, endpoint: keys.endpoint, p256dh_key: keys.p256dhKey, auth_key: keys.authKey },
          { onConflict: 'endpoint' }
        )
        .then(({ error }) => {
          if (error) throw error;
        }),
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/registerForPush.ts
git commit -m "feat: subscribeForPush real-deps wiring (navigator.serviceWorker + Supabase upsert)"
```

---

### Task 11: `PushPermissionCard` — the soft-ask UI

**Files:**
- Create: `components/notifications/pushPromptVisibility.ts`
- Test: `components/notifications/__tests__/pushPromptVisibility.test.ts`
- Create: `components/notifications/PushPermissionCard.tsx`

**Interfaces:**
- Produces: `shouldShowPushPrompt(platformOS: string, dismissed: boolean): boolean` (tested); `PushPermissionCard` default-export RN component (untested JSX, matches `AppHeader.tsx`/`DesktopSidebar.tsx` convention) — consumed by Task 13's nav-shell wiring.

- [ ] **Step 1: Write the failing test**

Create `components/notifications/__tests__/pushPromptVisibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldShowPushPrompt } from '../pushPromptVisibility';

describe('shouldShowPushPrompt', () => {
  it('shows on web when not dismissed', () => expect(shouldShowPushPrompt('web', false)).toBe(true));
  it('hidden on web once dismissed', () => expect(shouldShowPushPrompt('web', true)).toBe(false));
  it('hidden on ios (native Web Push has no client for this POC)', () => expect(shouldShowPushPrompt('ios', false)).toBe(false));
  it('hidden on android', () => expect(shouldShowPushPrompt('android', false)).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/notifications/__tests__/pushPromptVisibility.test.ts`
Expected: FAIL — `Cannot find module '../pushPromptVisibility'`

- [ ] **Step 3: Write the pure helper**

Create `components/notifications/pushPromptVisibility.ts`:

```ts
// Web Push only exists on the web build at POC (native APNs/FCM is post-POC, doc 3 §8.3) —
// the card never renders on ios/android, regardless of dismissed state.
export function shouldShowPushPrompt(platformOS: string, dismissed: boolean): boolean {
  return platformOS === 'web' && !dismissed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/notifications/__tests__/pushPromptVisibility.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write `PushPermissionCard.tsx`** — visual reference: `design/sankalp/bv-connect/components/notifications/PushPermissionPrompt.jsx` (already read in full during `/design`), reimplemented as an RN component styled from `theme` tokens per the design-system DoD (no hex/spacing literals, one primary + one secondary action, ≥44px touch targets).

Create `components/notifications/PushPermissionCard.tsx`:

```tsx
import '../../lib/unistyles';
import { useState } from 'react';
import { Platform, View, Text, Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { shouldShowPushPrompt } from './pushPromptVisibility';
import { hasDismissedPushPrompt, dismissPushPrompt } from '../../lib/notifications/promptState';
import { subscribeForPush } from '../../lib/notifications/registerForPush';
import { useSession } from '../../lib/auth/SessionProvider';

export default function PushPermissionCard() {
  const { session } = useSession();
  const [dismissed, setDismissed] = useState<boolean>(() =>
    Platform.OS === 'web' ? hasDismissedPushPrompt(window.localStorage) : true
  );

  if (!shouldShowPushPrompt(Platform.OS, dismissed)) return null;

  function persistDismiss() {
    if (Platform.OS === 'web') dismissPushPrompt(window.localStorage);
    setDismissed(true);
  }

  function handleEnable() {
    const userId = session?.user.id;
    if (userId) {
      subscribeForPush(userId).catch((err) => {
        console.warn('[push] subscribe failed', err);
      });
    }
    persistDismiss();
  }

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Text style={styles.iconGlyph}>🔔</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Stay in the loop</Text>
        <Text style={styles.copy}>
          Turn on notifications to hear about new class updates, announcements, and absences — even when the app is
          closed.
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.enableButton} onPress={handleEnable} accessibilityRole="button">
            <Text style={styles.enableText}>Enable notifications</Text>
          </Pressable>
          <Pressable style={styles.dismissButton} onPress={persistDismiss} accessibilityRole="button">
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: 'row',
    gap: theme.space['4'],
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.card,
    padding: theme.space['4'],
    margin: theme.space['4'],
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontSize: 20,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.h3,
    color: theme.colors.ink,
    marginBottom: theme.space['1'],
  },
  copy: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: theme.colors.ink3,
    marginBottom: theme.space['3'],
  },
  actions: {
    flexDirection: 'row',
    gap: theme.space['2'],
    flexWrap: 'wrap',
  },
  enableButton: {
    minHeight: theme.chrome.hitMin,
    justifyContent: 'center',
    paddingHorizontal: theme.space['4'],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  enableText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.onAction,
  },
  dismissButton: {
    minHeight: theme.chrome.hitMin,
    justifyContent: 'center',
    paddingHorizontal: theme.space['4'],
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.line2,
    backgroundColor: 'transparent',
  },
  dismissText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink2,
  },
}));
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add components/notifications/pushPromptVisibility.ts components/notifications/__tests__/pushPromptVisibility.test.ts components/notifications/PushPermissionCard.tsx
git commit -m "feat: PushPermissionCard soft-ask UI (AC#1/#2)"
```

---

### Task 12: `AddToHomeScreenHint` — iOS install hint UI

**Files:**
- Create: `components/notifications/AddToHomeScreenHint.tsx`

**Interfaces:**
- Consumes: `needsIosInstallHint` from Task 7.
- Produces: `AddToHomeScreenHint` default-export RN component — consumed by Task 13's nav-shell wiring.

No dedicated design-mirror component exists for this (checked at `/design` — neither the local mirror nor the canonical project has one); composed from the same primitive shapes as `PushPermissionCard` per the design sign-off's judgment call, not a pulled reference.

- [ ] **Step 1: Write the component**

Create `components/notifications/AddToHomeScreenHint.tsx`:

```tsx
import '../../lib/unistyles';
import { Platform, View, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { needsIosInstallHint } from '../../lib/notifications/installHint';

export default function AddToHomeScreenHint() {
  if (Platform.OS !== 'web') return null;

  const isStandalone =
    typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches;
  if (!needsIosInstallHint(navigator.userAgent, isStandalone)) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Get notifications on iPhone</Text>
      <Text style={styles.copy}>
        Add Bala Vihar Connect to your Home Screen to get notifications on iPhone — tap the Share icon, then &quot;Add
        to Home Screen&quot;.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.card,
    padding: theme.space['4'],
    margin: theme.space['4'],
  },
  title: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink,
    marginBottom: theme.space['1'],
  },
  copy: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: theme.colors.ink3,
  },
}));
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/notifications/AddToHomeScreenHint.tsx
git commit -m "feat: AddToHomeScreenHint iOS install-hint UI (AC#2)"
```

---

### Task 13: Wire both cards into the nav shell

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `PushPermissionCard` (Task 11), `AddToHomeScreenHint` (Task 12).

`<Tabs>` needs `flex: 1` directly from its parent `View` to size correctly — the cards are wrapped in a sibling `flex:1` body view rather than injected as loose siblings, so `Tabs` keeps getting exactly the layout it already gets today.

- [ ] **Step 1: Modify `app/(tabs)/_layout.tsx`**

Add the two imports near the top (after the existing `useIsDesktop` import):

```tsx
import { useIsDesktop } from "../../lib/useIsDesktop";
import PushPermissionCard from "../../components/notifications/PushPermissionCard";
import AddToHomeScreenHint from "../../components/notifications/AddToHomeScreenHint";
```

Replace the final return statement:

```tsx
  // No longer caps/centers the whole shell (see sceneStyle above) — just fills the viewport
  // and paints the canvas background behind the sidebar-flush-left / content-centered split.
  return isDesktop ? <View style={styles.desktopWrap}>{tabs}</View> : tabs;
}
```

with:

```tsx
  // No longer caps/centers the whole shell (see sceneStyle above) — just fills the viewport
  // and paints the canvas background behind the sidebar-flush-left / content-centered split.
  // PushPermissionCard/AddToHomeScreenHint sit above Tabs in a sibling flex:1 body view (not
  // as loose siblings) so Tabs keeps getting flex:1 straight from its parent, unchanged from
  // today's layout (issue #5).
  const shell = (
    <View style={styles.shellWrap}>
      <PushPermissionCard />
      <AddToHomeScreenHint />
      <View style={styles.shellBody}>{tabs}</View>
    </View>
  );

  return isDesktop ? <View style={styles.desktopWrap}>{shell}</View> : shell;
}
```

Add two entries to the `styles` object (after `desktopWrap`):

```tsx
const styles = StyleSheet.create((theme) => ({
  desktopWrap: {
    flex: 1,
    width: "100%",
    backgroundColor: theme.colors.canvas,
  },
  shellWrap: {
    flex: 1,
  },
  shellBody: {
    flex: 1,
  },
}));
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Run the full Vitest suite**

Run: `npm test`
Expected: PASS — all existing + new tests green.

- [ ] **Step 4: Verify live in the browser** (per the constitution's "UI or frontend changes" rule — start the dev server, sign in, confirm the card renders once above the tabs and "Not now" dismisses it without breaking tab navigation)

```bash
npm run dev
```

Sign in on `http://localhost:8888`, confirm `PushPermissionCard` renders once near the top of the signed-in shell, "Not now" dismisses it and it stays dismissed on reload, and tab navigation still works normally underneath it.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/_layout.tsx"
git commit -m "feat: wire PushPermissionCard/AddToHomeScreenHint into the nav shell (issue #5)"
```

---

### Task 14: SES-as-Auth-SMTP runbook

**Files:**
- Create: `.docs/runbooks/ses-auth-smtp.md`

**Interfaces:**
- None — pure documentation, consumed by a human at `/deploy-staging`. No code, no test cycle.

- [ ] **Step 1: Write the runbook**

Create `.docs/runbooks/ses-auth-smtp.md`:

```markdown
# Runbook: SES as Supabase Auth's SMTP provider

> Infra/config only — no application code. Governs: `.docs/specs/system/notifications-infra.md` AC#8.
> Run this at `/deploy-staging` once, before the first real magic-link send at volume.

## Steps

1. **Verify the sending domain in SES (US-East / `us-east-1`)** and add the SPF/DKIM DNS
   records SES generates at the domain registrar.
2. **Create an IAM SMTP user** scoped to `ses:SendRawEmail` only; generate SMTP credentials
   from it. Do not reuse the app's own AWS credentials for this.
3. **Supabase Dashboard → Auth → SMTP Settings**: enable custom SMTP —
   - Host: `email-smtp.us-east-1.amazonaws.com`
   - Port: `587`
   - Username/Password: the SMTP credentials from step 2
   - Sender: the verified domain address from step 1
4. **Submit the one-time SES sandbox-exit request** (production sending access) — SES starts
   every new account in a sandbox that only sends to verified addresses.
5. **Send a real magic-link** (`/sign-in` on staging) and confirm delivery with
   `DKIM=pass` / `SPF=pass` in the received message's headers.

## Notes

- No new Netlify function and no new secret in this repo — the SMTP credentials live only in
  the SES/Supabase dashboards, never committed here (constitution rule #2).
- This does not touch magic-link's application code path — `signInWithOtp` (built in
  `client-auth-session-and-nav`, #17) is unchanged; this only repoints where Supabase Auth's
  outbound mail is routed.
```

- [ ] **Step 2: Commit**

```bash
git add .docs/runbooks/ses-auth-smtp.md
git commit -m "docs: SES-as-Auth-SMTP runbook (AC#8, /deploy-staging step)"
```

---

## Self-Review

**Spec coverage:**
- AC#1 (subscription capture) → Tasks 5, 8, 10, 11.
- AC#2 (Add to Home Screen onboarding) → Tasks 7, 12.
- AC#3 (`push-send` delivery function) → Tasks 2–4.
- AC#4 (`notify_level` dispatch) → Task 2 (`isRecipient`) + Task 4 (handler tests).
- AC#5 (no open-DM leak via push) → Task 4 — `push-send` only ever queries `conversation_participants` scoped to the message's own `conversation_id`, same boundary as the existing RLS reads; no cross-conversation query path exists in the handler.
- AC#6 (expired-subscription cleanup) → Task 3 (`gone` classification) + Task 4 (delete-on-gone tests).
- AC#7 (silent no-op, not an error) → Task 4 (`noop`/zero-subscription tests).
- AC#8 (SES as Auth's SMTP) → Task 14.
- AC#9 (payload PII-free) → Task 2 (`payloadTitleForKind`, kind-only) + Task 4 (payload-content test).
- Edge case "self-notification" → Task 2's first `isRecipient` test + Task 4's sender-still-in-participants test.
- Edge case "multi-device fan-out ... one expired doesn't affect the others" → Task 4's fan-out test covers 2 subscriptions; combine with the cleanup test mentally (both paths are independently covered by the same loop in `push-send.ts`).
- Edge case "mixed mention targeting" → Task 2's `students`-vs-`parent` non-match test.
- Edge case "missed push on client failure" (ADR-0028, accepted gap) → Global Constraints note; the client wiring (Task 10 is `push-send`-side, chat-send UI itself is out of this item's scope per the spec's `#24 class-chat-ui` boundary) deliberately never awaits/blocks on it.

**Placeholder scan:** no TBD/TODO, no "add appropriate handling" — every step has full code or an exact command with expected output.

**Type consistency:** `PushSubscriptionRow` (Task 3) fields (`id`, `endpoint`, `p256dh_key`, `auth_key`) match the real `push_subscriptions` migration columns and Task 4's `.select('id, endpoint, p256dh_key, auth_key')`. `ConversationParticipant` (Task 2) fields (`user_id`, `participant_role`, `notify_level`) match Task 4's `.select('user_id, participant_role, notify_level')`. `PushSubscriptionKeys` (Task 8: `endpoint`/`p256dhKey`/`authKey`) is consumed by Task 10's `registerForPush.ts` with matching field names, then re-mapped to the DB's snake_case (`p256dh_key`/`auth_key`) only at the `upsertSubscription` boundary — consistent with the rest of the client/DB naming split already established in `lib/auth/SessionProvider.tsx`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-21-notifications-infra.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
