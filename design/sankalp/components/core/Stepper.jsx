import React from "react";

/**
 * Stepper — labelled +/- number control (attendee counts, quantities).
 * Round capsule buttons with ≥40px hit targets; the value is set in the
 * display serif so it reads like a figure.
 */
export function Stepper({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 20,
  style,
  ...rest
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  const btn = (disabled) => ({
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid var(--line-2)",
    background: "var(--surface)",
    color: "var(--ink-2)",
    fontSize: 20,
    lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "grid",
    placeItems: "center",
    opacity: disabled ? 0.35 : 1,
    transition: "border-color .15s, color .15s",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "18px 0",
        ...style,
      }}
      {...rest}
    >
      {label && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <strong
            style={{
              fontFamily: "var(--serif)",
              fontWeight: 500,
              fontSize: 19,
              color: "var(--ink)",
              letterSpacing: "-.005em",
            }}
          >
            {label}
          </strong>
          {hint && <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{hint}</span>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" style={btn(value <= min)} disabled={value <= min} onClick={dec} aria-label="Decrease">
          −
        </button>
        <span
          style={{
            fontFamily: "var(--serif)",
            fontWeight: 500,
            fontSize: 26,
            color: "var(--ink)",
            minWidth: 36,
            textAlign: "center",
            letterSpacing: "-.01em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        <button type="button" style={btn(value >= max)} disabled={value >= max} onClick={inc} aria-label="Increase">
          +
        </button>
      </div>
    </div>
  );
}
