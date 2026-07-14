import { describe, it, expect } from 'vitest';
import { iconNameForTab } from '../iconNameForTab';

// Pure TabKey -> icon-name mapping (Stage 12, F26), lifted from the design mirror's
// bv-connect icon sets: phone/app.jsx's ICON.{feed,msg,reg,bell,check} + desktop/dash.jsx's
// NAV.{overview,attendance,people,audit}. classes/dashboard/approvals/admin don't have a 1:1
// icon in either mockup (this app's 7-tab set is larger than the mockups' demos), so they
// borrow the closest semantic match documented per-case below.
describe('iconNameForTab', () => {
  it('feed -> feed', () => expect(iconNameForTab('feed')).toBe('feed'));
  it('classes -> people (closest semantic match — class roster)', () =>
    expect(iconNameForTab('classes')).toBe('people'));
  it('attendance -> attendance (exact name match, desktop NAV)', () =>
    expect(iconNameForTab('attendance')).toBe('attendance'));
  it('chat -> msg', () => expect(iconNameForTab('chat')).toBe('msg'));
  it('dashboard -> overview (exact concept match, desktop NAV)', () =>
    expect(iconNameForTab('dashboard')).toBe('overview'));
  it('approvals -> reg (closest semantic match — register/approve action)', () =>
    expect(iconNameForTab('approvals')).toBe('reg'));
  it('admin -> audit (exact name match, desktop NAV)', () => expect(iconNameForTab('admin')).toBe('audit'));
});
