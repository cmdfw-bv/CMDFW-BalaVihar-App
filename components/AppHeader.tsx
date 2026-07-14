import "../lib/unistyles";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { StyleSheet } from "react-native-unistyles";
import { useSession } from "../lib/auth/SessionProvider";
import { appHeaderSubtitle } from "./appHeaderSubtitle";

export default function AppHeader() {
  const { activeRole, scopeType } = useSession();
  const subtitle = appHeaderSubtitle(activeRole, scopeType);

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
