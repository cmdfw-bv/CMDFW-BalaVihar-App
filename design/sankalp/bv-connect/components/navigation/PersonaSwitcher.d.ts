import * as React from "react";

export interface Persona {
  id: string;
  name: React.ReactNode;
  role: "student" | "parent" | "teacher" | "coordinator" | "bv" | "admin";
  /** Scope description shown in the sheet, e.g. "JR·A · Brampton". */
  scope?: React.ReactNode;
}

export interface PersonaSwitcherProps {
  roles?: Persona[];
  activeId?: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}

/**
 * PersonaSwitcher — pill + bottom sheet for switching the active scoped role.
 * @startingPoint section="BV Navigation" subtitle="Multi-persona active-role switch" viewport="440x420"
 */
export function PersonaSwitcher(props: PersonaSwitcherProps): JSX.Element;
