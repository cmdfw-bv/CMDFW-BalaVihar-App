import { describe, it, expect } from 'vitest';
import { eventDateFontSize } from '../EventDateBlock.logic';

describe('eventDateFontSize', () => {
  it('sm is 36', () => expect(eventDateFontSize('sm')).toBe(36));
  it('md is 44', () => expect(eventDateFontSize('md')).toBe(44));
  it('lg is 56 (also the documented default)', () => expect(eventDateFontSize('lg')).toBe(56));
});
