import React from "react";

/**
 * StatusChip — small capsule status marker.
 * Marketing/registration statuses: open / soon / past / featured.
 * App/attendance statuses: present / absent / excused / info / neutral.
 * A leading dot appears on "live" states (open, present).
 */
export function StatusChip({ status = "neutral", children, dot, style, ...rest }) {
  const map = {
    open:     { bg: "var(--success-soft)", fg: "var(--success)", bd: "var(--success-line)", dot: "var(--success-2)" },
    present:  { bg: "var(--success-soft)", fg: "var(--success)", bd: "var(--success-line)", dot: "var(--success-2)" },
    soon:     { bg: "var(--primary-soft)", fg: "var(--primary-2)", bd: "#e8c597", dot: "var(--primary)" },
    excused:  { bg: "var(--warning-soft)", fg: "var(--warning)", bd: "var(--warning-line)", dot: "var(--warning)" },
    absent:   { bg: "var(--danger-soft)", fg: "var(--danger)", bd: "var(--danger-line)", dot: "var(--danger)" },
    info:     { bg: "var(--info-soft)", fg: "var(--info)", bd: "var(--info-line)", dot: "var(--info)" },
    past:     { bg: "#efe8db", fg: "var(--ink-3)", bd: "var(--line-2)", dot: "var(--ink-4)" },
    featured: { bg: "var(--gold)", fg: "#fbf3df", bd: "var(--gold-2)", dot: "#fbf3df" },
    neutral:  { bg: "var(--surface)", fg: "var(--ink-3)", bd: "var(--line)", dot: "var(--ink-4)" },
  };
  const c = map[status] || map.neutral;
  const showDot = dot ?? (status === "open" || status === "present");

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        fontFamily: "var(--sans)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".16em",
        textTransform: "uppercase",
        borderRadius: "var(--rad-pill)",
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {showDot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: c.dot,
            boxShadow: `0 0 0 3px color-mix(in srgb, ${c.dot} 22%, transparent)`,
          }}
        />
      )}
      {children}
    </span>
  );
}
