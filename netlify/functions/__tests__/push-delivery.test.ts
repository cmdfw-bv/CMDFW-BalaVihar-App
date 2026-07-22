import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSetVapidDetails, mockSendNotification } = vi.hoisted(() => {
  return {
    mockSetVapidDetails: vi.fn(),
    mockSendNotification: vi.fn(),
  };
});

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
