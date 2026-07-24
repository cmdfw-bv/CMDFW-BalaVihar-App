// Web Push only exists on the web build at POC (native APNs/FCM is post-POC, doc 3 §8.3) —
// the card never renders on ios/android, regardless of dismissed state.
export function shouldShowPushPrompt(platformOS: string, dismissed: boolean): boolean {
  return platformOS === 'web' && !dismissed;
}
