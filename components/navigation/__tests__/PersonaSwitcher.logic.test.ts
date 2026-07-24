import { describe, it, expect } from 'vitest';
import { resolveActivePersona } from '../PersonaSwitcher.logic';

const roles = [
  { id: 'a', name: 'Teacher · JR·A', role: 'teacher' as const },
  { id: 'b', name: 'Admin', role: 'admin' as const },
];

describe('resolveActivePersona', () => {
  it('finds the persona matching activeId', () => {
    expect(resolveActivePersona(roles, 'b')).toEqual(roles[1]);
  });
  it('falls back to the first role when activeId matches nothing', () => {
    expect(resolveActivePersona(roles, 'nope')).toEqual(roles[0]);
  });
  it('falls back to an em-dash placeholder when roles is empty', () => {
    expect(resolveActivePersona([], undefined)).toEqual({ name: '—' });
  });
});
