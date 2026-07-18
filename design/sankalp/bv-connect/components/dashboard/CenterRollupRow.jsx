import React from "react";

/**
 * CenterRollupRow — one center in the org-level (BV Coordinator) rollup:
 * center name, a headline attendance %, marked/enrolled, and a mini bar.
 * Use `placeholder` for centers with no data yet — honest "—" over invented
 * figures (the POC's single-center rollup is intentionally degenerate).
 */
export function CenterRollupRow({ name, region, attendance, marked, enrolled, placeholder = false, onClick, style, ...rest }) {
  const pct = placeholder ? 0 : Math.max(0, Math.min(100, attendance || 0));
  const c = pct >= 85 ? "var(--success)" : pct >= 70 ? "var(--warning)" : "var(--danger)";

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
        padding: "14px 16px", border: 0, borderBottom: "1px solid var(--line)",
        background: "transparent", cursor: onClick ? "pointer" : "default", fontFamily: "var(--sans)",
        ...style,
      }}
      {...rest}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{name}</div>
        {region && <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 1 }}>{region}</div>}
        <div style={{ height: 6, borderRadius: 999, background: "var(--surface-alt)", overflow: "hidden", marginTop: 9, maxWidth: 220 }}>
          <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: placeholder ? "var(--line-2)" : c }} />
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {placeholder ? (
          <span style={{ fontFamily: "var(--mono)", fontSize: 18, color: "var(--ink-4)" }}>—</span>
        ) : (
          <>
            <div style={{ fontFamily: "var(--mono)", fontSize: 19, fontWeight: 500, color: c, fontVariantNumeric: "tabular-nums" }}>{attendance}%</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{marked}/{enrolled}</div>
          </>
        )}
      </div>
    </button>
  );
}
