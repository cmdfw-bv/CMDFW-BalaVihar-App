import { describe, it, expect } from 'vitest';
import { notificationTypeMeta, NOTIFICATION_TYPE_KEYS } from '../NotificationItem.logic';

describe('NOTIFICATION_TYPE_KEYS / notificationTypeMeta', () => {
  it('covers all 5 documented types', () => {
    expect(NOTIFICATION_TYPE_KEYS.sort()).toEqual(['absence', 'announce', 'approval', 'chat', 'update'].sort());
  });
  it('absence maps to the danger tone', () => expect(notificationTypeMeta('absence')).toEqual({ colorTokenKey: 'status.absent' }));
  it('approval maps to the success tone', () => expect(notificationTypeMeta('approval')).toEqual({ colorTokenKey: 'status.present' }));
  it('chat maps to the bv role hue (plural roles map)', () => expect(notificationTypeMeta('chat')).toEqual({ colorTokenKey: 'roles.bv' }));
});
