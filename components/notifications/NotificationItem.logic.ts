export type NotificationType = "update" | "announce" | "absence" | "approval" | "chat";
export const NOTIFICATION_TYPE_KEYS: NotificationType[] = ['update', 'announce', 'absence', 'approval', 'chat'];

const META: Record<NotificationType, { colorTokenKey: string }> = {
  update:   { colorTokenKey: 'scope.class' },
  announce: { colorTokenKey: 'status.info' },
  absence:  { colorTokenKey: 'status.absent' },
  approval: { colorTokenKey: 'status.present' },
  chat:     { colorTokenKey: 'roles.bv' },
};

export function notificationTypeMeta(type: NotificationType): { colorTokenKey: string } {
  return META[type];
}
