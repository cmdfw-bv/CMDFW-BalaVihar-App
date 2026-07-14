import React from "react";

/**
 * StatTile — a single figure with an uppercase label.
 * The value is mono tabular by default (so compared figures align in a
 * row); set `display` to render it in the large serif for hero stats.
 */
export function StatTile({ label, value, display = false, accent = false, style, ...rest }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }} {...rest}>
      <span
        style={{
          fontFamily: "var(--sans)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--ink-4)",
        }}
      >
        {label}
      </span>
      <span
        style={
          display
            ? {
                fontFamily: "var(--serif)",
                fontWeight: 500,
                fontSize: 44,
                lineHeight: 1,
                letterSpacing: "-.02em",
                color: accent ? "var(--primary)" : "var(--ink)",
              }
            : {
                fontFamily: "var(--mono)",
                fontSize: 28,
                fontWeight: 500,
                lineHeight: 1,
                letterSpacing: "-.01em",
                fontVariantNumeric: "tabular-nums",
                color: accent ? "var(--primary)" : "var(--ink)",
              }
        }
      >
        {value}
      </span>
    </div>
  );
}
