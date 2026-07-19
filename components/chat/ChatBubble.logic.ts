export type TickState = "none" | "sent" | "read";

export function chatBubbleMeta(own: boolean, read?: boolean, showName?: boolean): { align: 'flex-end' | 'flex-start'; fillTokenKey: string; inkTokenKey: string; tick: TickState; showName: boolean } {
  const tick: TickState = own && read !== undefined ? (read ? 'read' : 'sent') : 'none';
  return {
    align: own ? 'flex-end' : 'flex-start',
    fillTokenKey: own ? 'chatOut' : 'chatIn',
    inkTokenKey: own ? 'chatOutInk' : 'chatInInk',
    tick,
    showName: showName ?? !own,
  };
}
