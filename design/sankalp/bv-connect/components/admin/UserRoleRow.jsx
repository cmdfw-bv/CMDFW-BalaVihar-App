import React from "react";
import { RoleBadge } from "../../../components/core/RoleBadge.jsx";

/**
 * UserRoleRow — admin row for a person: avatar, name, scope, their role
 * badges (multi-persona supported), and approve/reject actions for pending
 * accounts. Pending rows surface the approval affordance inline.
 */
export function UserRoleRow({
  name, email, scope, roles = [], status = "active", onApprove, onReject, onManage, style, ...rest
}) {
  const pending = status === "pending";
  const initial = (name || "?").trim().charAt(0);

  const iconBtn = (bg, fg, bd) => ({
    width: 36, height: 36, borderRadius: "50%", border: `1px solid ${bd}`, background: bg, color: fg,
    display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderBottom: "1px solid var(--line)", fontFamily: "var(--sans)", ...style }} {...rest}>
      <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%", background: "var(--indigo)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "var(--serif)", fontSize: 16 }}>{initial}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</strong>
          {pending && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--warning)", background: "var(--warning-soft)", border: "1px solid var(--warning-line)", borderRadius: "var(--app-rad-pill)", padding: "2px 7px" }}>Pending</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {email}{email && scope ? " · " : ""}{scope && <span style={{ fontFamily: "var(--mono)" }}>{scope}</span>}
        </div>
        {roles.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
            {roles.map((r) => <RoleBadge key={typeof r === "string" ? r : r.role} role={typeof r === "string" ? r : r.role} scope={typeof r === "string" ? undefined : r.scope} />)}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {pending ? (
          <>
            <button onClick={onReject} aria-label="Reject" style={iconBtn("var(--danger-soft)", "var(--danger)", "var(--danger-line)")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
            <button onClick={onApprove} aria-label="Approve" style={iconBtn("var(--success-soft)", "var(--success)", "var(--success-line)")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 6"/></svg>
            </button>
          </>
        ) : (
          <button onClick={onManage} aria-label="Manage" style={iconBtn("var(--app-surface)", "var(--ink-3)", "var(--line-2)")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="12" r="1.6"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}
