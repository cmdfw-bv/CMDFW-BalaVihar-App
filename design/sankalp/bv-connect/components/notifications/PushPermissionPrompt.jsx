import React from "react";

/**
 * PushPermissionPrompt — the in-app card that asks to enable Web Push
 * (VAPID) for the installed PWA. Honest about what's sent and offers a
 * clear "not now". Used once, near first meaningful action.
 */
export function PushPermissionPrompt({
  title = "Stay in the loop",
  body = "Turn on notifications to hear about new class updates, announcements, and absences — even when the app is closed.",
  onEnable, onDismiss, style, ...rest
}) {
  return (
    <div
      style={{
        display: "flex", gap: 14, alignItems: "flex-start",
        background: "var(--app-surface)", border: "1px solid var(--line)",
        borderRadius: "var(--app-rad-card)", boxShadow: "var(--app-shadow-card)",
        padding: 16, ...style,
      }}
      {...rest}
    >
      <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: "var(--app-rad-control)", background: "var(--primary-soft)", color: "var(--primary-2)", display: "grid", placeItems: "center" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: "block", fontFamily: "var(--serif)", fontWeight: 400, fontSize: 18, color: "var(--ink)", marginBottom: 4 }}>{title}</strong>
        <p style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-3)", margin: "0 0 12px" }}>{body}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onEnable} style={{
            border: 0, cursor: "pointer", borderRadius: "var(--app-rad-pill)", padding: "9px 16px",
            background: "var(--primary)", color: "#fff", fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600,
          }}>Enable notifications</button>
          <button onClick={onDismiss} style={{
            border: "1px solid var(--line-2)", cursor: "pointer", borderRadius: "var(--app-rad-pill)", padding: "9px 16px",
            background: "transparent", color: "var(--ink-2)", fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600,
          }}>Not now</button>
        </div>
      </div>
    </div>
  );
}
