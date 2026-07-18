import * as React from "react";

export interface PushPermissionPromptProps {
  title?: React.ReactNode;
  body?: React.ReactNode;
  onEnable?: () => void;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

/**
 * PushPermissionPrompt — in-app card requesting Web Push permission.
 */
export function PushPermissionPrompt(props: PushPermissionPromptProps): JSX.Element;
