import { describe, it, expect } from 'vitest';
import { fieldControlMeta } from '../Field.logic';

describe('fieldControlMeta', () => {
  it('textarea gets a taller reserved minHeight and is multiline', () => {
    expect(fieldControlMeta('textarea', false)).toEqual({ minHeight: 96, borderTokenKey: 'line2', multiline: true });
  });
  it('input/select use hitMin height and are single-line', () => {
    expect(fieldControlMeta('input', false)).toEqual({ minHeight: 44, borderTokenKey: 'line2', multiline: false });
    expect(fieldControlMeta('select', false)).toEqual({ minHeight: 44, borderTokenKey: 'line2', multiline: false });
  });
  it('error presence switches the border token to the danger tone, any `as`', () => {
    expect(fieldControlMeta('input', true).borderTokenKey).toBe('status.absent');
  });
});
