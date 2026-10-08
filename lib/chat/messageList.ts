// Pure list logic for chat delivery (System -> realtime-chat-delivery, issue #6). Durable
// history in `messages` is the record; these functions are how every ingestion path -- ping,
// rejoin, foreground, timer, the sender's own saved row -- lands in one ordered, duplicate-free
// list.

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  mention_targets: string[];
  created_at: string;
}

// `created_at` is the saving transaction's start time, so two near-simultaneous saves can commit
// in the opposite order to their timestamps. Every catch-up re-reads this much history; the merge
// by id makes the overlap free of duplicates.
export const CATCH_UP_OVERLAP_MS = 10_000;
export const CATCH_UP_PAGE_SIZE = 100;
export const INITIAL_PAGE_SIZE = 50;

// [epoch milliseconds, microseconds within that millisecond]. Postgres keeps microseconds and
// trims trailing zeros when it prints them; Date.parse() keeps only milliseconds. Ordering by
// Date alone would shuffle messages saved within the same millisecond.
function timestampParts(iso: string): [number, number] {
  const fraction = /\.(\d+)/.exec(iso)?.[1] ?? '';
  return [Date.parse(iso), Number(fraction.padEnd(6, '0').slice(3, 6))];
}

// Same order as the database's `order by created_at, id`: lowercase uuid strings compare the way
// Postgres compares uuid bytes.
export function compareMessages(a: ChatMessage, b: ChatMessage): number {
  const [aMs, aMicros] = timestampParts(a.created_at);
  const [bMs, bMicros] = timestampParts(b.created_at);
  if (aMs !== bMs) return aMs - bMs;
  if (aMicros !== bMicros) return aMicros - bMicros;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function mergeMessages(held: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of held) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compareMessages);
}

// `held` is in ascending order, so its last entry is the newest. Truncating to the millisecond
// only ever moves the cursor earlier, which is the safe direction.
export function catchUpCursor(held: readonly ChatMessage[]): string | null {
  const newest = held.at(-1);
  if (!newest) return null;
  return new Date(Date.parse(newest.created_at) - CATCH_UP_OVERLAP_MS).toISOString();
}
