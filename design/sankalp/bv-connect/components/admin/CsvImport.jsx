import React from "react";

/**
 * CsvImport — enrollment import control. A dropzone before a file is
 * chosen; a parsed summary (rows ready / flagged) after. The POC baseline
 * is CSV; this is the seam where an API sync would later plug in.
 */
export function CsvImport({ fileName, total, ready, flagged = 0, onChoose, onConfirm, style, ...rest }) {
  const parsed = fileName != null;

  return (
    <div style={{ fontFamily: "var(--sans)", ...style }} {...rest}>
      {!parsed ? (
        <button
          onClick={onChoose}
          style={{
            width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            padding: "30px 20px", cursor: "pointer",
            background: "var(--app-surface-2)", border: "1.5px dashed var(--line-2)",
            borderRadius: "var(--app-rad-card)", color: "var(--ink-2)",
          }}
        >
          <span style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--app-surface)", border: "1px solid var(--line)", display: "grid", placeItems: "center", color: "var(--primary)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>Upload enrollment CSV</span>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)", textAlign: "center", lineHeight: 1.5 }}>
            One row per student · columns: name, family ID, class, parent email.
          </span>
        </button>
      ) : (
        <div style={{ background: "var(--app-surface)", border: "1px solid var(--line)", borderRadius: "var(--app-rad-card)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ width: 34, height: 34, borderRadius: "var(--app-rad-control)", background: "var(--success-soft)", color: "var(--success)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fileName}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-4)" }}>{total} rows parsed</div>
            </div>
            <button onClick={onChoose} style={{ border: "1px solid var(--line-2)", background: "transparent", borderRadius: "var(--app-rad-pill)", padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer" }}>Replace</button>
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            <div style={{ flex: 1, padding: "13px 15px", textAlign: "center", borderRight: "1px solid var(--line)" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 500, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>{ready}</div>
              <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-4)", marginTop: 2 }}>Ready</div>
            </div>
            <div style={{ flex: 1, padding: "13px 15px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 500, color: flagged ? "var(--danger)" : "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>{flagged}</div>
              <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-4)", marginTop: 2 }}>Flagged</div>
            </div>
          </div>
          <div style={{ padding: 12, borderTop: "1px solid var(--line)" }}>
            <button onClick={onConfirm} style={{ width: "100%", minHeight: 46, border: 0, borderRadius: "var(--app-rad-pill)", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Import {ready} students
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
