import { describe, it, expect } from 'vitest';
import { commentStyleMeta } from '../Comment.logic';

describe('commentStyleMeta', () => {
  it('public comment: role hue only, transparent card, no border', () => {
    expect(commentStyleMeta('teacher', false)).toEqual({ hueTokenKey: 'roles.teacher', bgTokenKey: 'transparent', borderTokenKey: null });
  });
  it('private comment: tinted privateSoft card with a privateLine border', () => {
    expect(commentStyleMeta('parent', true)).toEqual({ hueTokenKey: 'roles.parent', bgTokenKey: 'privateSoft', borderTokenKey: 'privateLine' });
  });
  it('bv role resolves via the plural roles map', () => {
    expect(commentStyleMeta('bv', false).hueTokenKey).toBe('roles.bv');
  });
});
