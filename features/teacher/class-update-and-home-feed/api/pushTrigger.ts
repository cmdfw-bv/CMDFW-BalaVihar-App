// Fire-and-forget, same UX posture as chat send (notifications-infra's Behavior section) — the
// class_updates insert's own success/failure is never blocked or held on this call.
export async function triggerClassUpdatePush(accessToken: string, classUpdateId: string): Promise<void> {
  try {
    await fetch('/.netlify/functions/push-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ class_update_id: classUpdateId }),
    });
  } catch {
    // Best-effort delivery (ADR-0028's accepted gap) — a failed/slow push-send call is never
    // surfaced to the Teacher who just posted; their update already committed successfully.
  }
}
