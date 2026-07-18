import { describe, it, expect } from 'vitest';
import { statTileValueStyle } from '../StatTile.logic';

describe('statTileValueStyle', () => {
  it('default: mono font, ink color', () => {
    expect(statTileValueStyle(false, false)).toEqual({ fontFamily: 'mono', colorTokenKey: 'ink' });
  });
  it('display=true switches to the display (serif) font', () => {
    expect(statTileValueStyle(true, false).fontFamily).toBe('display');
  });
  it('accent=true colors the figure with the primary token regardless of display', () => {
    expect(statTileValueStyle(false, true).colorTokenKey).toBe('primary');
    expect(statTileValueStyle(true, true).colorTokenKey).toBe('primary');
  });
});
