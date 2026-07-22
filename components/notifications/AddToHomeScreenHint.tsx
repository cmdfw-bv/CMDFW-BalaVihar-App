import '../../lib/unistyles';
import { Platform, View, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { needsIosInstallHint } from '../../lib/notifications/installHint';

export default function AddToHomeScreenHint() {
  if (Platform.OS !== 'web') return null;

  const isStandalone =
    typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches;
  if (!needsIosInstallHint(navigator.userAgent, isStandalone)) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Get notifications on iPhone</Text>
      <Text style={styles.copy}>
        Add Bala Vihar Connect to your Home Screen to get notifications on iPhone — tap the Share icon, then &quot;Add
        to Home Screen&quot;.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.card,
    padding: theme.space['4'],
    margin: theme.space['4'],
  },
  title: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink,
    marginBottom: theme.space['1'],
  },
  copy: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: theme.colors.ink3,
  },
}));
