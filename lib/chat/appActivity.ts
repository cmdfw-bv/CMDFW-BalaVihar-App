import { AppState, Platform } from 'react-native';

// Foreground / background for a conversation that is on screen (design decision 2: a device
// listens only while a conversation is visible, so idle apps do not hold one of the 200
// connections). Extracted so both platform branches are testable without a renderer.
export function watchAppActivity(onActive: () => void, onInactive: () => void): () => void {
  if (Platform.OS === 'web') {
    // `document` is absent during Expo Router's static web export.
    if (typeof document === 'undefined') return () => {};
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onActive();
      else onInactive();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }

  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'active') onActive();
    else if (next === 'background') onInactive();
    // 'inactive' is transient on iOS (app switcher, a call banner); leaving and rejoining the
    // channel for it would churn the connection for nothing.
  });
  return () => subscription.remove();
}
