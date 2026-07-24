import { supabase } from '../supabase';
import { urlBase64ToUint8Array } from './vapidKey';
import { subscribeToPush, type PushSubscriptionKeys, type SubscribeToPushDeps } from './subscribeToPush';

export async function subscribeForPush(userId: string): Promise<void> {
  const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  await subscribeToPush({
    register: async () => {
      // register() resolves once the worker is *installing*, not yet active — subscribe()
      // throws immediately if there's no active worker (Chrome does not wait). Await `ready`
      // so the very first Enable click doesn't lose the race (issue #41).
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;
      return { pushManager: registration.pushManager as unknown as Awaited<ReturnType<SubscribeToPushDeps['register']>>['pushManager'] };
    },
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    upsertSubscription: async (keys: PushSubscriptionKeys) => {
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: userId, endpoint: keys.endpoint, p256dh_key: keys.p256dhKey, auth_key: keys.authKey },
          { onConflict: 'endpoint' }
        );
      if (error) throw error;
    },
  });
}
