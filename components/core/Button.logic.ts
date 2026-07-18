export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "gold" | "danger" | "dark";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

// Token keys only — Button.tsx resolves these against `theme.colors`/`theme.space` at render time.
export const BUTTON_VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary:   { bg: 'primary',   fg: 'onAction',  border: 'transparent' },
  secondary: { bg: 'surface',   fg: 'ink',       border: 'line2' },
  ghost:     { bg: 'transparent', fg: 'ink',     border: 'line2' },
  outline:   { bg: 'transparent', fg: 'onDark',  border: 'onDark' },
  gold:      { bg: 'gold',      fg: 'ink',       border: 'transparent' },
  danger:    { bg: 'status.absent', fg: 'onAction', border: 'transparent' },
  dark:      { bg: 'ink',       fg: 'onDark',    border: 'transparent' },
};

export const BUTTON_SIZES: Record<ButtonSize, { paddingX: number; paddingY: number; fontSize: 'xs' | 'sm' | 'body' }> = {
  sm: { paddingX: 16, paddingY: 9, fontSize: 'xs' },
  md: { paddingX: 18, paddingY: 11, fontSize: 'sm' },
  lg: { paddingX: 24, paddingY: 14, fontSize: 'sm' },
  xl: { paddingX: 30, paddingY: 16, fontSize: 'body' },
};

export function resolveButtonMode(href?: string, disabled?: boolean): 'link' | 'button' {
  return href && !disabled ? 'link' : 'button';
}
