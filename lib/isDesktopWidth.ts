import { breakpoints } from './theme';

export function isDesktopWidth(width: number): boolean {
  return width >= breakpoints.lg;
}
