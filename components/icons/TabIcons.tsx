import type { ColorValue } from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import type { TabKey } from "../../lib/auth/navMap";
import { iconNameForTab, type IconName } from "./iconNameForTab";

// SVG path data lifted from the design mirror's bv-connect icon sets (phone/app.jsx's ICON,
// desktop/dash.jsx's NAV) — see iconNameForTab.ts for the TabKey -> IconName mapping this
// switches on.
type IconProps = { color: ColorValue; size: number };

function FeedIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 11a9 9 0 0 1 9 9" />
      <Path d="M4 4a16 16 0 0 1 16 16" />
      <Circle cx={5} cy={19} r={1.6} fill={color} stroke="none" />
    </Svg>
  );
}

function PeopleIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Circle cx={9} cy={7} r={4} />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    </Svg>
  );
}

function AttendanceIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 11l3 3L22 4" />
      <Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Svg>
  );
}

function MsgIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function OverviewIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={7} height={9} rx={1.5} />
      <Rect x={14} y={3} width={7} height={5} rx={1.5} />
      <Rect x={14} y={12} width={7} height={9} rx={1.5} />
      <Rect x={3} y={16} width={7} height={5} rx={1.5} />
    </Svg>
  );
}

function RegIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 11l3 3L22 4" />
      <Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Svg>
  );
}

function AuditIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Path d="M14 2v6h6M9 13h6M9 17h4" />
    </Svg>
  );
}

const ICONS: Record<IconName, (props: IconProps) => ReturnType<typeof FeedIcon>> = {
  feed: FeedIcon,
  people: PeopleIcon,
  attendance: AttendanceIcon,
  msg: MsgIcon,
  overview: OverviewIcon,
  reg: RegIcon,
  audit: AuditIcon,
};

export function TabIcon({ tab, color, size = 22 }: { tab: TabKey; color: ColorValue; size?: number }) {
  const Icon = ICONS[iconNameForTab(tab)];
  return <Icon color={color} size={size} />;
}
