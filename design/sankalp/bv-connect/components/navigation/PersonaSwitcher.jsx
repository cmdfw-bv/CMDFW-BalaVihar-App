import React from "react";

const ROLE_HUE = {
  student: "var(--role-student)", parent: "var(--role-parent)", teacher: "var(--role-teacher)",
  coordinator: "var(--role-coordinator)", bv: "var(--role-bv)", admin: "var(--role-admin)",
};

/**
 * PersonaSwitcher — the multi-persona active-role control. A compact pill
 * shows the current role; tapping opens a sheet to switch. Switching
 * re-scopes the whole app (own children → class → session → org), so the
 * sheet states that explicitly. One account, many scoped roles.
 */
export function PersonaSwitcher({ roles = [], activeId, onChange, style, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const active = roles.find((r) => r.id === activeId) || roles[0] || { name: "—" };
  const hue = ROLE_HUE[active.role] || "var(--ink-3)";

  const pick = (r) => { setOpen(false); if (onChange) onChange(r.id); };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 10px 6px 11px",
          borderRadius: "var(--app-rad-pill)", background: "var(--app-surface)", border: "1px solid var(--line-2)",
          cursor: "pointer", fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)",
          ...style,
        }}
        {...rest}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: hue }} />
        {active.name}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: "var(--z-sheet)", background: "var(--app-overlay)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "var(--app-maxw)", background: "var(--app-canvas)", borderRadius: "20px 20px 0 0", padding: "10px 14px 22px" }}>
            <div style={{ width: 38, height: 4, borderRadius: 999, background: "var(--line-2)", margin: "4px auto 14px" }} />
            <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-4)", margin: "0 0 12px" }}>Switch active role — re-scopes your data</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roles.map((r) => {
                const on = r.id === active.id;
                return (
                  <button key={r.id} onClick={() => pick(r)} style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", cursor: "pointer",
                    padding: 14, borderRadius: "var(--app-rad-control)", background: "var(--app-surface)",
                    border: `1px solid ${on ? "var(--primary)" : "var(--line)"}`,
                    boxShadow: on ? "0 0 0 3px rgba(184,83,26,.12)" : "none", fontFamily: "var(--sans)",
                  }}>
                    <span style={{ width: 11, height: 11, borderRadius: "50%", background: ROLE_HUE[r.role] || "var(--ink-3)", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{r.name}</span>
                      <span style={{ display: "block", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-3)", marginTop: 1 }}>{r.scope}</span>
                    </span>
                    {on && <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 6"/></svg>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
