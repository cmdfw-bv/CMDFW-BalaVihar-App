import React from "react";

/**
 * Field — label + input with reserved validation slot.
 * Validation is a state, not a tooltip: the error message renders inline
 * in --danger and the slot is always reserved so layout never jumps.
 * Renders an <input>, or a <textarea>/<select> via `as`.
 */
export function Field({
  label,
  hint,
  required = false,
  error,
  as = "input",
  id,
  uppercase = true,
  style,
  inputStyle,
  children,
  ...rest
}) {
  const reactId = React.useId();
  const fieldId = id || reactId;
  const invalid = Boolean(error);
  const Tag = as;

  const controlStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface)",
    border: `1px solid ${invalid ? "var(--danger)" : "var(--line-2)"}`,
    borderRadius: "var(--rad)",
    padding: as === "textarea" ? "12px 16px" : "13px 16px",
    fontFamily: "var(--sans)",
    fontSize: 15.5,
    color: "var(--ink)",
    outline: "none",
    minHeight: as === "textarea" ? 96 : "var(--hit-min)",
    resize: as === "textarea" ? "vertical" : undefined,
    transition: "border-color .15s, box-shadow .15s",
    ...inputStyle,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      {label && (
        <label
          htmlFor={fieldId}
          style={{
            fontFamily: "var(--sans)",
            fontSize: uppercase ? 11 : 13,
            fontWeight: 600,
            letterSpacing: uppercase ? ".2em" : ".01em",
            textTransform: uppercase ? "uppercase" : "none",
            color: "var(--ink-2)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {label}
          {required && <span style={{ color: "var(--primary)" }}>*</span>}
        </label>
      )}
      <Tag
        id={fieldId}
        aria-invalid={invalid || undefined}
        style={controlStyle}
        onFocus={(e) => {
          if (!invalid) {
            e.target.style.borderColor = "var(--primary)";
            e.target.style.boxShadow = "var(--focus-ring)";
          }
        }}
        onBlur={(e) => {
          e.target.style.borderColor = invalid ? "var(--danger)" : "var(--line-2)";
          e.target.style.boxShadow = "none";
        }}
        {...rest}
      >
        {children}
      </Tag>
      {/* validation slot — always reserved */}
      <span
        style={{
          fontFamily: "var(--sans)",
          fontSize: 12.5,
          lineHeight: 1.4,
          minHeight: 16,
          color: invalid ? "var(--danger)" : "var(--ink-3)",
        }}
      >
        {error || hint || ""}
      </span>
    </div>
  );
}
