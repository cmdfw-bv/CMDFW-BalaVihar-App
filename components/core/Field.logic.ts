export type FieldAs = "input" | "textarea" | "select";

export function fieldControlMeta(as: FieldAs, hasError: boolean): { minHeight: number; borderTokenKey: string; multiline: boolean } {
  return {
    minHeight: as === 'textarea' ? 96 : 44, // 44 === theme.chrome.hitMin; Field.tsx reads the real token, this fixture pins the documented value
    borderTokenKey: hasError ? 'status.absent' : 'line2',
    multiline: as === 'textarea',
  };
}
