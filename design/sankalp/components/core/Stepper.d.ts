import * as React from "react";

export interface StepperProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
}

/**
 * Stepper — labelled +/- counter for attendee counts and quantities.
 */
export function Stepper(props: StepperProps): JSX.Element;
