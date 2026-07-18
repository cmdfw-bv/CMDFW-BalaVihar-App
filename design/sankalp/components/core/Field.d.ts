import * as React from "react";

export interface FieldProps {
  /** Field label (rendered as an uppercase eyebrow by default). */
  label?: React.ReactNode;
  /** Helper text shown in the reserved slot when there's no error. */
  hint?: React.ReactNode;
  required?: boolean;
  /** Error message; presence switches the field into the invalid state. */
  error?: React.ReactNode;
  /** Control element: input (default), textarea, or select (pass <option> children). */
  as?: "input" | "textarea" | "select";
  id?: string;
  /** Uppercase eyebrow label styling (default) vs. plain sentence label. */
  uppercase?: boolean;
  type?: string;
  placeholder?: string;
  value?: any;
  onChange?: (e: React.ChangeEvent) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

/**
 * Field — labelled input with an always-reserved inline validation slot.
 */
export function Field(props: FieldProps): JSX.Element;
