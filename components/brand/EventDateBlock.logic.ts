export type EventDateSize = "sm" | "md" | "lg";

export function eventDateFontSize(size: EventDateSize): number {
  return size === 'sm' ? 36 : size === 'md' ? 44 : 56;
}
