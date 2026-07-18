import React from "react";

/**
 * ChatBubble — one message in a class group chat or a student DM.
 * Outgoing (own) bubbles fill terracotta and align right; incoming align
 * left with the sender name above (group chats). A read tick is optional.
 */
export function ChatBubble({ own = false, author, time = "", read, showName = !own, children, style, ...rest }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: own ? "flex-end" : "flex-start", gap: 3, ...style }} {...rest}>
      {showName && author && (
        <span style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, color: "var(--ink-3)", padding: "0 4px", whiteSpace: "nowrap" }}>{author}</span>
      )}
      <div style={{
        maxWidth: "78%",
        background: own ? "var(--chat-out)" : "var(--chat-in)",
        color: own ? "var(--chat-out-ink)" : "var(--chat-in-ink)",
        border: own ? "0" : "1px solid var(--chat-in-line)",
        borderRadius: "var(--app-rad-bubble)",
        borderBottomRightRadius: own ? 5 : "var(--app-rad-bubble)",
        borderBottomLeftRadius: own ? "var(--app-rad-bubble)" : 5,
        padding: "9px 13px",
        fontFamily: "var(--sans)", fontSize: 14.5, lineHeight: 1.45,
        boxShadow: own ? "none" : "var(--app-shadow-row)",
      }}>
        {children}
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--sans)", fontSize: 10.5, color: "var(--ink-4)", padding: "0 4px" }}>
        {time}
        {own && read != null && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={read ? "var(--info)" : "var(--ink-4)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 13l4 4L13 7"/><path d="M11 13l4 4L23 7"/>
          </svg>
        )}
      </span>
    </div>
  );
}
