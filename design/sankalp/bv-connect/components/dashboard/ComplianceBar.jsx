import React from "react";

function tone(value, explicit) {
  if (explicit) return explicit;
  if (value >= 85) return "success";
  if (value >= 70) return "warning";
  return "danger";
}
const COLORS = { success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", info: "var(--info)" };

/**
 * ComplianceBar — a labelled progress bar for a single metric (attendance,
 * update compliance, approvals). Tone auto-derives from the value unless
 * set explicitly; the percentage is mono-tabular so rows align.
 */
export function ComplianceBar({ label, value = 0, suffix = "%", display, note, status, style, ...rest }) {
  const c = COLORS[tone(value, status)];
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ fontFamily: "var(--sans)", ...style }} {...rest}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 17, letterSpacing: ".005em", color: "var(--ink)", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 500, color: c, fontVariantNumeric: "tabular-nums" }}>
          {display != null ? display : `${value}${suffix}`}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--surface-alt)", overflow: "hidden", margin: "12px 0 0" }}>
        <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: c, transition: "width .4s var(--ease-standard)" }} />
      </div>
      {note && <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "11px 0 0" }}>{note}</p>}
    </div>
  );
}
