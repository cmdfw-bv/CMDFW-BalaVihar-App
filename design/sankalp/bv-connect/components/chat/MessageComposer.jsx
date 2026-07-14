import React from "react";

/**
 * MessageComposer — the chat input bar: text field + send button. Optional
 * attach affordance. Submits on Enter (Shift+Enter for newline).
 */
export function MessageComposer({ placeholder = "Message…", onSend, allowAttach = false, style, ...rest }) {
  const [value, setValue] = React.useState("");
  const send = () => { if (value.trim() && onSend) onSend(value); setValue(""); };
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const icon = (size, d) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;

  return (
    <div style={{
      display: "flex", alignItems: "flex-end", gap: 8,
      padding: 10, background: "var(--app-surface)", borderTop: "1px solid var(--line)",
      ...style,
    }} {...rest}>
      {allowAttach && (
        <button aria-label="Attach" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%", border: "1px solid var(--line-2)", background: "var(--app-surface)", color: "var(--ink-3)", display: "grid", placeItems: "center", cursor: "pointer" }}>
          {icon(18, <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49"/>)}
        </button>
      )}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", background: "var(--app-surface-2)", border: "1px solid var(--line)", borderRadius: "var(--app-rad-bubble)" }}>
        <textarea
          rows={1} value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}
          style={{ flex: 1, border: 0, background: "transparent", resize: "none", outline: "none", fontFamily: "var(--sans)", fontSize: 15, color: "var(--ink)", padding: "11px 14px", minHeight: 22, lineHeight: 1.4, maxHeight: 120 }}
        />
      </div>
      <button onClick={send} aria-label="Send" style={{
        width: 44, height: 44, flexShrink: 0, borderRadius: "50%", border: 0, cursor: "pointer",
        background: value.trim() ? "var(--primary)" : "var(--line-2)", color: "#fff",
        display: "grid", placeItems: "center", transition: "background .15s",
      }}>
        {icon(18, <><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></>)}
      </button>
    </div>
  );
}
