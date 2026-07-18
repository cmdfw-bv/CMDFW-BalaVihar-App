import React from "react";

const TYPES = {
  update:   { bg: "var(--scope-class)", d: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/> },
  announce: { bg: "var(--info)", d: <><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></> },
  absence:  { bg: "var(--danger)", d: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></> },
  approval: { bg: "var(--success)", d: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/> },
  chat:     { bg: "var(--role-bv)", d: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/> },
};

/**
 * NotificationItem — one row in the notifications center. A type icon, a
 * title + body, a timestamp, and an unread dot. Maps push/email events to
 * a consistent visual language across personas.
 */
export function NotificationItem({ type = "update", title, body, time = "", unread = false, onClick, style, ...rest }) {
  const t = TYPES[type] || TYPES.update;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", gap: 12, width: "100%", textAlign: "left", cursor: "pointer",
        padding: "13px 14px", border: 0,
        background: unread ? "var(--app-surface)" : "transparent",
        borderBottom: "1px solid var(--line)", fontFamily: "var(--sans)",
        ...style,
      }}
      {...rest}
    >
      <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: t.bg, color: "#fff", display: "grid", placeItems: "center" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.d}</svg>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{title}</strong>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)", flexShrink: 0, whiteSpace: "nowrap" }}>{time}</span>
        </span>
        {body && <span style={{ display: "block", fontSize: 13, color: "var(--ink-3)", lineHeight: 1.45, marginTop: 2 }}>{body}</span>}
      </span>
      {unread && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--primary)", flexShrink: 0, marginTop: 6 }} />}
    </button>
  );
}
