import React from "react";

/**
 * Logo — the Chinmaya Mission OM mark, optionally with the wordmark.
 * The OM is the saffron mark from assets/chinmaya-om.png. Pass a `src`
 * if the asset lives at a different relative path in your artifact.
 */
export function Logo({
  src = "assets/chinmaya-om.png",
  size = 40,
  wordmark = true,
  title = "Chinmaya Mission DFW",
  tagline = "Events & Satsangs",
  onDark = false,
  style,
  ...rest
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12, ...style }} {...rest}>
      <img
        src={src}
        alt="Chinmaya Mission OM"
        style={{ width: size, height: "auto", objectFit: "contain", flexShrink: 0, display: "block" }}
      />
      {wordmark && (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <strong
            style={{
              fontFamily: "var(--serif)",
              fontSize: Math.round(size * 0.52),
              fontWeight: 600,
              letterSpacing: ".01em",
              color: onDark ? "var(--on-dark)" : "var(--ink)",
            }}
          >
            {title}
          </strong>
          {tagline && (
            <span
              style={{
                fontFamily: "var(--sans)",
                fontSize: 11,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: onDark ? "rgba(251,243,223,.7)" : "var(--ink-3)",
                marginTop: 2,
              }}
            >
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
