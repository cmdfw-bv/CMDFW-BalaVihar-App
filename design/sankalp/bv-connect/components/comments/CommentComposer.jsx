import React from "react";

/**
 * CommentComposer — input row for posting a comment, with a public/private
 * visibility toggle. The toggle makes the audience explicit before sending.
 */
export function CommentComposer({ canPrivate = true, placeholder = "Add a comment…", onSend, style, ...rest }) {
  const [value, setValue] = React.useState("");
  const [priv, setPriv] = React.useState(false);
  const send = () => { if (value.trim() && onSend) onSend({ body: value, isPrivate: priv }); setValue(""); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: "1px solid var(--line)", ...style }} {...rest}>
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 8,
        background: priv ? "var(--private-soft)" : "var(--app-surface-2)",
        border: `1px solid ${priv ? "var(--private-line)" : "var(--line)"}`,
        borderRadius: "var(--app-rad-control)", padding: 6, transition: "background .15s, border-color .15s",
      }}>
        <textarea
          rows={1} value={value} placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          style={{
            flex: 1, border: 0, background: "transparent", resize: "none", outline: "none",
            fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)", padding: "7px 8px", minHeight: 20, lineHeight: 1.4,
          }}
        />
        <button onClick={send} aria-label="Send" style={{
          width: 36, height: 36, flexShrink: 0, borderRadius: "50%", border: 0, cursor: "pointer",
          background: value.trim() ? "var(--primary)" : "var(--line-2)", color: "#fff",
          display: "grid", placeItems: "center", transition: "background .15s",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
        </button>
      </div>
      {canPrivate && (
        <div style={{ display: "inline-flex", alignSelf: "flex-start", background: "var(--app-surface)", border: "1px solid var(--line)", borderRadius: "var(--app-rad-pill)", padding: 3, gap: 2 }}>
          {[{ id: false, label: "Public" }, { id: true, label: "Private" }].map((o) => {
            const on = priv === o.id;
            return (
              <button key={String(o.id)} onClick={() => setPriv(o.id)} style={{
                border: 0, cursor: "pointer", borderRadius: "var(--app-rad-pill)", padding: "5px 12px",
                fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 600,
                background: on ? (o.id ? "var(--private)" : "var(--ink)") : "transparent",
                color: on ? "#fff" : "var(--ink-3)", transition: "background .15s, color .15s",
              }}>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
