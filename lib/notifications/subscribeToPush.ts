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
