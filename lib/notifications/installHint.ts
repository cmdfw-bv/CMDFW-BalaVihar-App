// Web Push on iOS only fires for a PWA added to the Home Screen (iOS 16.4+), not a plain
// Safari tab (doc 3 §8.1, highest-risk POC item) — surface the install hint whenever the
// device is iOS and not already running standalone.
export function needsIosInstallHint(userAgent: string, isStandalone: boolean): boolean {
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  return isIos && !isStandalone;
}
