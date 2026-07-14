import React from "react";

const ACTIONS = {
  view:    { label: "viewed", color: "var(--info)" },
  edit:    { label: "edited", color: "var(--warning)" },
  export:  { label: "exported", color: "var(--primary-2)" },
  approve: { label: "approved", color: "var(--success)" },
  delete:  { label: "deleted", color: "var(--danger)" },
};

/**
 * AuditEntry — one line in the minors'-access audit log. Mono, dense, and
 * scannable: timestamp · actor (role:scope) · action · target. Required
 * by the compliance rule that access to minors' records is logged.
 */
export function AuditEntry({ time, actor, action = "view", target, style, ...rest }) {
  const a = ACTIONS[action] || ACTIONS.view;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
        borderBottom: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 11.5,
        color: "var(--ink-3)", lineHeight: 1.4, ...style,
      }}
      {...rest}
    >
      <span style={{ color: "var(--ink-4)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{time}</span>
      <span style={{ color: "var(--ink-2)", flexShrink: 0 }}>{actor}</span>
      <span style={{ color: a.color, fontWeight: 600, flexShrink: 0 }}>{a.label}</span>
      <span style={{ color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{target}</span>
    </div>
  );
}
