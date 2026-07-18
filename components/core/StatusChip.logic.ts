export type StatusChipStatus = "open" | "soon" | "past" | "featured" | "present" | "absent" | "excused" | "info" | "neutral";
export const STATUS_CHIP_KEYS: StatusChipStatus[] = ['open', 'soon', 'past', 'featured', 'present', 'absent', 'excused', 'info', 'neutral'];

type ChipStyle = { bg: string; fg: string; border: string; dot: string };

const STYLES: Record<StatusChipStatus, ChipStyle> = {
  open:     { bg: 'statusRamp.presentSoft', fg: 'status.present', border: 'statusRamp.presentLine', dot: 'status.present' },
  present:  { bg: 'statusRamp.presentSoft', fg: 'status.present', border: 'statusRamp.presentLine', dot: 'status.present' },
  soon:     { bg: 'primarySoft', fg: 'primaryPressed', border: 'primarySoft', dot: 'primary' },
  excused:  { bg: 'statusRamp.excusedSoft', fg: 'status.excused', border: 'statusRamp.excusedLine', dot: 'status.excused' },
  absent:   { bg: 'statusRamp.absentSoft', fg: 'status.absent', border: 'statusRamp.absentLine', dot: 'status.absent' },
  info:     { bg: 'statusRamp.infoSoft', fg: 'status.info', border: 'statusRamp.infoLine', dot: 'status.info' },
  past:     { bg: 'surfaceAlt', fg: 'ink3', border: 'line2', dot: 'ink4' },
  featured: { bg: 'gold', fg: 'onAction', border: 'gold2', dot: 'onAction' },
  neutral:  { bg: 'surface', fg: 'ink3', border: 'line', dot: 'ink4' },
};

export function statusChipStyle(status: StatusChipStatus): ChipStyle {
  return STYLES[status] ?? STYLES.neutral;
}

export function statusChipShowsDot(status: StatusChipStatus, dot?: boolean): boolean {
  return dot ?? (status === 'open' || status === 'present');
}
