import { supabase } from '../supabase';
import { urlBase64ToUint8Array } from './vapidKey';
import { subscribeToPush, type PushSubscriptionKeys } from './subscribeToPush';

export async function subscribeForPush(userId: string): Promise<void> {
  const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  await subscribeToPush({
    register: async () => {
      const registration = await navigator.serviceWorker.register('/sw.js');
      return { pushManager: registration.pushManager as any };
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
