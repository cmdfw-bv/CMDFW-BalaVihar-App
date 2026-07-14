import * as React from "react";

export interface MagicLinkLoginProps {
  /** Relative path to the OM mark. */
  logoSrc?: string;
  appName?: string;
  /** Toggle the "check your email" confirmation state. */
  sent?: boolean;
  email?: string;
  /** Called with the email on send / resend. */
  onSend?: (email: string) => void;
  style?: React.CSSProperties;
}

/**
 * MagicLinkLogin — passwordless email sign-in with a sent-confirmation state.
 * @startingPoint section="BV Auth" subtitle="Magic-link sign-in (no self-registration)" viewport="440x520"
 */
export function MagicLinkLogin(props: MagicLinkLoginProps): JSX.Element;
