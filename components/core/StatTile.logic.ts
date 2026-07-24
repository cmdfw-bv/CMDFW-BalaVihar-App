export function statTileValueStyle(display?: boolean, accent?: boolean): { fontFamily: 'display' | 'mono'; colorTokenKey: string } {
  return { fontFamily: display ? 'display' : 'mono', colorTokenKey: accent ? 'primary' : 'ink' };
}
