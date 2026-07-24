export function clampStep(value: number, delta: number, min?: number, max?: number): number {
  let next = value + delta;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}
