import React from "react";

/**
 * Card — the warm-paper surface container.
 * Surface fill, hairline border, 18px radius, soft warm shadow.
 * `interactive` adds the lift-on-hover used by event cards.
 * `tone="cream"` uses the raised cream well; `tone="indigo"` is the
 * dark poster surface (text flips to cream).
 */
export function Card({
  tone = "surface",
  interactive = false,
  as = "div",
  padding = 24,
  style,
  children,
  ...rest
}) {
  const tones = {
    surface: { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)" },
    cream:   { background: "var(--bg-cream)", color: "var(--ink)", border: "1px solid var(--line)" },
    indigo:  { background: "var(--indigo)", color: "var(--on-dark)", border: "1px solid var(--indigo-2)" },
  };
  const Tag = as;
  const [hover, setHover] = React.useState(false);

  return (
    <Tag
      onMouseEnter={interactive ? () => setHover(true) : undefined}
      onMouseLeave={interactive ? () => setHover(false) : undefined}
      style={{
        borderRadius: "var(--rad-lg)",
        boxShadow: "var(--shadow-sm)",
        padding,
        transition: "transform .2s var(--ease-standard), box-shadow .2s, border-color .2s",
        ...tones[tone],
        ...(interactive && hover
          ? { transform: "translateY(-3px)", boxShadow: "var(--shadow-lg)", borderColor: "var(--primary)" }
          : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
