export type CardTone = "surface" | "cream" | "indigo";

export function cardToneStyle(tone: CardTone): { bg: string; fg: string; border: string } {
  switch (tone) {
    case 'cream': return { bg: 'bgCream', fg: 'ink', border: 'line' };
    case 'indigo': return { bg: 'indigo', fg: 'onDark', border: 'indigo2' };
    default: return { bg: 'surface', fg: 'ink', border: 'line' };
  }
}
