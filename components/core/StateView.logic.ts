export type ViewState = "loading" | "empty" | "error" | "content";

export function shouldShowRetry(state: ViewState, onRetry?: () => void): boolean {
  return state === 'error' && typeof onRetry === 'function';
}
