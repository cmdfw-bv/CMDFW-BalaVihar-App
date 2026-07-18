import React from "react";

/**
 * EventDateBlock — the editorial date used in event rows and cards:
 * a big terracotta serif day over an uppercase month and year.
 */
export function EventDateBlock({ day, month, year, size = "lg", style, ...rest }) {
  const dayFs = size === "sm" ? 36 : size === "md" ? 44 : 56;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--serif)",
        lineHeight: 1,
        color: "var(--ink)",
        ...style,
      }}
      {...rest}
    >
      <span style={{ fontSize: dayFs, fontWeight: 500, letterSpacing: "-.02em", color: "var(--primary)" }}>
        {day}
      </span>
      <span
        style={{
          fontFamily: "var(--sans)",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: ".22em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          marginTop: 8,
        }}
      >
        {month}
      </span>
      {year && (
        <span
          style={{
            fontFamily: "var(--sans)",
            fontSize: 11,
            letterSpacing: ".14em",
            color: "var(--ink-4)",
            marginTop: 3,
          }}
        >
          {year}
        </span>
      )}
    </div>
  );
}
