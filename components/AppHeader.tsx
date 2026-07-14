import "../lib/unistyles";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { StyleSheet } from "react-native-unistyles";
import { useSession } from "../lib/auth/SessionProvider";
import { appHeaderSubtitle } from "./appHeaderSubtitle";
import RoleSwitcher from "./RoleSwitcher";

type AppHeaderProps = {
  // Desktop mounts the switcher in DesktopSidebar's footer instead (matches the design
  // mirror's dash.jsx side__foot) — passing true here would duplicate it (issue #31). Phone/
  // tablet widths have no sidebar, so the design mirror's own phone header (bv-connect/
  // screens/phone/app.jsx .hdr) puts the switcher directly in this header instead.
  showSwitcher?: boolean;
};

export default function AppHeader({ showSwitcher = false }: AppHeaderProps) {
  const { activeRole, scopeType, scopeLabel } = useSession();
  const subtitle = appHeaderSubtitle(activeRole, scopeType, scopeLabel);

  return (
    <View style={styles.header}>
      <Image
        source={require("../design/sankalp/assets/images/chinmaya-om.png")}
        style={styles.mark}
        contentFit="contain"
      />
      <View style={styles.titleCol}>
        <Text style={styles.title} numberOfLines={1}>
          Bala Vihar App
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showSwitcher ? <RoleSwitcher /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["3"],
    minHeight: theme.chrome.header,
    paddingHorizontal: theme.space["4"],
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  mark: {
    width: 26,
    height: 26,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink3,
  },
}));
