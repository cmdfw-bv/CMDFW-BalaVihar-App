import "../../lib/unistyles";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { StyleSheet } from "react-native-unistyles";
import { logoTitleFontSize } from "./logoTitleFontSize";

// Matches the design mirror's components/brand/Logo.jsx — OM mark + serif wordmark lockup.
export type LogoProps = {
  size?: number;
  wordmark?: boolean;
  title?: string;
  tagline?: string;
  onDark?: boolean;
};

export default function Logo({
  size = 40,
  wordmark = true,
  title = "Chinmaya Mission DFW",
  tagline = "Events & Satsangs",
  onDark = false,
}: LogoProps) {
  return (
    <View style={styles.row}>
      <Image
        source={require("../../design/sankalp/assets/images/chinmaya-om.png")}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
      {wordmark && (
        <View style={styles.textCol}>
          <Text
            style={[
              styles.title,
              { fontSize: logoTitleFontSize(size), color: onDark ? styles.onDark.color : styles.ink.color },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {tagline ? (
            <Text style={[styles.tagline, { color: onDark ? styles.onDarkSoft.color : styles.ink3.color }]} numberOfLines={1}>
              {tagline}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["3"],
  },
  textCol: {
    flexDirection: "column",
  },
  title: {
    fontFamily: theme.fonts.display,
    fontWeight: "600",
    letterSpacing: 0.01,
  },
  tagline: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow,
    letterSpacing: theme.type.tracking.eyebrow,
    textTransform: "uppercase",
    marginTop: theme.space["1"],
  },
  ink: { color: theme.colors.ink },
  ink3: { color: theme.colors.ink3 },
  onDark: { color: theme.colors.onDark },
  onDarkSoft: { color: theme.colors.onDark },
}));
