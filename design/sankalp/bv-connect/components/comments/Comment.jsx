import React from "react";

const ROLE_HUE = {
  student: "var(--role-student)", parent: "var(--role-parent)", teacher: "var(--role-teacher)",
  coordinator: "var(--role-coordinator)", bv: "var(--role-bv)", admin: "var(--role-admin)",
};

/**
 * Comment — a single comment in a thread. Public by default; a `private`
 * comment (teacher ↔ one parent) is tinted and carries a lock so the
 * visibility is never ambiguous.
 */
export function Comment({ author = { name: "", role: "parent" }, time = "", body, isPrivate = false, style, ...rest }) {
  const hue = ROLE_HUE[author.role] || "var(--ink-3)";
  return (
    <div
      style={{
        display: "flex", gap: 11,
        padding: isPrivate ? "11px 12px" : "11px 2px",
        borderRadius: isPrivate ? "var(--app-rad-control)" : 0,
        background: isPrivate ? "var(--private-soft)" : "transparent",
        border: isPrivate ? "1px solid var(--private-line)" : "0",
        ...style,
      }}
      {...rest}
    >
      <span style={{
        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
        background: hue, color: "#fff", display: "grid", placeItems: "center",
        fontFamily: "var(--serif)", fontSize: 13, fontWeight: 400,
      }}>
        {(author.name || "?").trim().charAt(0)}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
          <strong style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{author.name}</strong>
          <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--ink-4)", textTransform: "capitalize" }}>{author.role}</span>
          {isPrivate && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--private)", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              Private
            </span>
          )}
          <span style={{ marginLeft: "auto", fontFamily: "var(--sans)", fontSize: 11, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{time}</span>
        </div>
        <p style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)", margin: 0 }}>{body}</p>
      </div>
    </div>
  );
}
