import { describe, it, expect } from 'vitest';
import { cardToneStyle } from '../Card.logic';

describe('cardToneStyle', () => {
  it('surface tone uses surface bg + ink fg + line border', () => {
    expect(cardToneStyle('surface')).toEqual({ bg: 'surface', fg: 'ink', border: 'line' });
  });
  it('cream tone uses bgCream bg', () => {
    expect(cardToneStyle('cream')).toEqual({ bg: 'bgCream', fg: 'ink', border: 'line' });
  });
  it('indigo tone flips fg to onDark and borders with indigo2', () => {
    expect(cardToneStyle('indigo')).toEqual({ bg: 'indigo', fg: 'onDark', border: 'indigo2' });
  });
});
