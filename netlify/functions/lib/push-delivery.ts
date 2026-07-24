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
