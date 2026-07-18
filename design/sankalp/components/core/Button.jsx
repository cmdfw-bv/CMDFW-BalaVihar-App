import React from "react";

/**
 * Button — the Chinmaya Mission action control.
 * Capsule geometry, Inter 600. One PRIMARY (terracotta) action per view;
 * everything else is secondary / ghost / outline / gold / danger.
 */
export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  href,
  icon,
  iconRight,
  disabled = false,
  fullWidth = false,
  onClick,
  children,
  style,
  ...rest
}) {
  const sizes = {
    sm: { padding: "9px 16px", fontSize: 13 },
    md: { padding: "11px 18px", fontSize: 14 },
    lg: { padding: "14px 24px", fontSize: 15 },
    xl: { padding: "16px 30px", fontSize: 16 },
  };

  const variants = {
    primary: { background: "var(--primary)", color: "#fff", borderColor: "transparent" },
    secondary: { background: "var(--surface)", color: "var(--ink)", borderColor: "var(--line-2)" },
    ghost: { background: "transparent", color: "var(--ink)", borderColor: "var(--line-2)" },
    outline: { background: "transparent", color: "var(--on-dark)", borderColor: "rgba(255,255,255,.4)" },
    gold: { background: "var(--gold)", color: "#1c1410", borderColor: "transparent" },
    danger: { background: "var(--danger)", color: "#fff", borderColor: "transparent" },
    dark: { background: "var(--ink)", color: "var(--on-dark)", borderColor: "transparent" },
  };

  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "var(--sans)",
    fontWeight: 600,
    letterSpacing: ".01em",
    lineHeight: 1,
    borderRadius: "var(--rad-pill)",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background .15s var(--ease-standard), border-color .15s, transform .15s, box-shadow .15s",
    textDecoration: "none",
    minHeight: "var(--hit-min)",
    width: fullWidth ? "100%" : undefined,
    opacity: disabled ? 0.5 : 1,
    ...sizes[size],
    ...variants[variant],
    ...style,
  };

  const content = (
    <>
      {icon}
      {children}
      {iconRight}
    </>
  );

  if (href && !disabled) {
    return (
      <a href={href} style={base} onClick={onClick} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} style={base} disabled={disabled} onClick={onClick} {...rest}>
      {content}
    </button>
  );
}
