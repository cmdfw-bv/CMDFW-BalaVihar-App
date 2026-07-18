import React from "react";

/**
 * ConsentCapture — timestamped parental + media consent. Each item is an
 * explicit opt-in checkbox; the captured timestamp is shown once checked,
 * because consent must be auditable for a minors' platform.
 */
export function ConsentCapture({ items = [], values = {}, timestamps = {}, onToggle, style, ...rest }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "var(--sans)", ...style }} {...rest}>
      {items.map((it) => {
        const on = !!values[it.id];
        return (
          <label key={it.id} style={{
            display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer",
            padding: 14, borderRadius: "var(--app-rad-control)",
            background: on ? "var(--success-soft)" : "var(--app-surface)",
            border: `1px solid ${on ? "var(--success-line)" : "var(--line)"}`,
            transition: "background .15s, border-color .15s",
          }}>
            <span style={{
              width: 22, height: 22, flexShrink: 0, marginTop: 1, borderRadius: 6,
              border: `1.5px solid ${on ? "var(--success)" : "var(--line-2)"}`,
              background: on ? "var(--success)" : "transparent",
              display: "grid", placeItems: "center", transition: "all .15s",
            }}>
              {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 6"/></svg>}
            </span>
            <input type="checkbox" checked={on} onChange={() => onToggle && onToggle(it.id)} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{it.label}{it.required && <span style={{ color: "var(--primary)" }}> *</span>}</span>
              {it.help && <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5, marginTop: 3 }}>{it.help}</span>}
              {on && timestamps[it.id] && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--mono)", fontSize: 11, color: "var(--success)", marginTop: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                  Recorded {timestamps[it.id]}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
