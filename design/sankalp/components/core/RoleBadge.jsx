import React from "react";

const ROLES = {
  student:     { label: "Student", color: "var(--role-student)" },
  parent:      { label: "Parent", color: "var(--role-parent)" },
  teacher:     { label: "Teacher", color: "var(--role-teacher)" },
  coordinator: { label: "Coordinator", color: "var(--role-coordinator)" },
  bv:          { label: "BV Coordinator", color: "var(--role-bv)" },
  admin:       { label: "Admin", color: "var(--role-admin)" },
};

/**
 * RoleBadge — capsule that codes a persona by its role hue, optionally
 * with a mono scope label (e.g. the class/center it's scoped to).
 * Role hues are data-coding only — never page or action colors.
 */
export function RoleBadge({ role = "student", label, scope, style, ...rest }) {
  const r = ROLES[role] || ROLES.student;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 11px",
        borderRadius: "var(--rad-pill)",
        fontFamily: "var(--sans)",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--ink-2)",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
      {label || r.label}
      {scope && (
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            letterSpacing: ".04em",
            color: "var(--ink-4)",
            paddingLeft: 6,
            marginLeft: 2,
            borderLeft: "1px solid var(--line)",
          }}
        >
          {scope}
        </span>
      )}
    </span>
  );
}
