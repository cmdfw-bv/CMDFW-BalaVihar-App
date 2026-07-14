import React from "react";

const ROLE_HUE = {
  student: "var(--role-student)", parent: "var(--role-parent)", teacher: "var(--role-teacher)",
  coordinator: "var(--role-coordinator)", bv: "var(--role-bv)", admin: "var(--role-admin)",
};

/**
 * ConversationRow — a row in the messages list: a class group chat or a
 * 1:1 student DM. Shows avatar (or group glyph), name, last message,
 * time, and an unread count. `kind="group"` renders a class-chat glyph.
 */
export function ConversationRow({
  name, preview, time = "", unread = 0, kind = "dm", role = "student", scope, active = false, onClick, style, ...rest
}) {
  const hue = ROLE_HUE[role] || "var(--ink-3)";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        padding: "11px 12px", border: 0, cursor: "pointer",
        background: active ? "var(--app-surface-2)" : "transparent",
        borderRadius: "var(--app-rad-control)", fontFamily: "var(--sans)",
        ...style,
      }}
      {...rest}
    >
      <span style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: "50%",
        background: kind === "group" ? "var(--indigo)" : hue,
        color: "#fff", display: "grid", placeItems: "center",
      }}>
        {kind === "group" ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold-light)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ) : (
          <span style={{ fontFamily: "var(--serif)", fontSize: 17 }}>{(name || "?").trim().charAt(0)}</span>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</strong>
          {scope && <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-4)", flexShrink: 0 }}>{scope}</span>}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)", flexShrink: 0 }}>{time}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: unread ? "var(--ink-2)" : "var(--ink-3)", fontWeight: unread ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview}</span>
          {unread > 0 && (
            <span style={{
              flexShrink: 0, minWidth: 20, height: 20, padding: "0 6px", borderRadius: "var(--app-rad-pill)",
              background: "var(--chat-unread)", color: "#fff", fontSize: 11, fontWeight: 700,
              display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums",
            }}>{unread}</span>
          )}
        </span>
      </span>
    </button>
  );
}
