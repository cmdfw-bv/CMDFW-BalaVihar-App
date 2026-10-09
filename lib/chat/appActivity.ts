import { AppState, Platform } from 'react-native';

// Foreground / background for a conversation that is on screen (design decision 2: a device
// listens only while a conversation is visible, so idle apps do not hold one of the 200
// connections). Extracted so both platform branches are testable without a renderer.
//
// Reports the state at the start as well as every change: `onActive` runs at once unless the
// app is already hidden. A screen mounted in a background tab, or restored while the app is in
// the background, therefore does not start listening until it is actually shown.
export function watchAppActivity(onActive: () => void, onInactive: () => void): () => void {
  if (Platform.OS === 'web') {
    // `document` is absent during Expo Router's static web export.
    if (typeof document === 'undefined') return () => {};
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onActive();
      else onInactive();
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') onActive();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }

  // Anything but 'background' counts as shown: the state can be null early in launch, and
  // 'inactive' is the transient state ignored below.
  if (AppState.currentState !== 'background') onActive();
  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'active') onActive();
    else if (next === 'background') onInactive();
    // 'inactive' is transient on iOS (app switcher, a call banner); leaving and rejoining the
    // channel for it would churn the connection for nothing.
  });
  return () => subscription.remove();
}
