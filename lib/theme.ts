// GENERATED placeholder (od-design-tokens/v1). Real values arrive via `gen:theme`
// once design/sankalp/design-tokens.json is imported (ADR-0010/0011). Do not hand-tune.
export const lightTheme = {
  colors: {
    bg: "#ffffff",
    accent: "#3f51b5",        // indigo — the single primary action (placeholder)
    brand: "#ff9800",         // saffron — identity-only (placeholder)
    status: { present: "#2e7d32", absent: "#c62828", excused: "#f9a825", info: "#0277bd" },
    role: { student: "#5c6bc0", parent: "#26a69a", teacher: "#7e57c2", coordinator: "#ef6c00", admin: "#455a64" },
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 4, md: 8, lg: 16 },
  type: { body: 16, display: 28 },
  motion: { fast: 120, base: 200 },
} as const;

export const breakpoints = { xs: 0, sm: 360, md: 768, lg: 1024, xl: 1440 } as const;
export type AppTheme = typeof lightTheme;
