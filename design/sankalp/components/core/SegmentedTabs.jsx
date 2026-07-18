import React from "react";

/**
 * SegmentedTabs — pill tab group (Upcoming / Past / All, verify-by, etc).
 * The active tab fills with ink; others are quiet. Optional count badges.
 */
export function SegmentedTabs({ tabs = [], value, onChange, style, ...rest }) {
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--rad-pill)",
        ...style,
      }}
      {...rest}
    >
      {tabs.map((t) => {
        const id = typeof t === "string" ? t : t.id;
        const label = typeof t === "string" ? t : t.label;
        const count = typeof t === "string" ? undefined : t.count;
        const on = id === value;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(id)}
            style={{
              border: 0,
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--on-dark)" : "var(--ink-3)",
              padding: "10px 18px",
              fontFamily: "var(--sans)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: ".04em",
              cursor: "pointer",
              borderRadius: "var(--rad-pill)",
              transition: "background .15s, color .15s",
              whiteSpace: "nowrap",
            }}
          >
            {label}
            {count != null && (
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.65, fontVariantNumeric: "tabular-nums" }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
