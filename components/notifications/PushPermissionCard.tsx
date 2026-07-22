import '../../lib/unistyles';
import { useState } from 'react';
import { Platform, View, Text, Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { shouldShowPushPrompt } from './pushPromptVisibility';
import { hasDismissedPushPrompt, dismissPushPrompt } from '../../lib/notifications/promptState';
import { subscribeForPush } from '../../lib/notifications/registerForPush';
import { needsIosInstallHint } from '../../lib/notifications/installHint';
import { useSession } from '../../lib/auth/SessionProvider';

export default function PushPermissionCard() {
  const { session } = useSession();
  const [dismissed, setDismissed] = useState<boolean>(() =>
    Platform.OS === 'web' ? hasDismissedPushPrompt(window.localStorage) : true
  );

  if (!shouldShowPushPrompt(Platform.OS, dismissed)) return null;

  // iOS Safari (not yet added to Home Screen) can never complete pushManager.subscribe() —
  // defer entirely to AddToHomeScreenHint instead of showing a dead "Enable notifications"
  // button ahead of it (spec: notifications-infra.md, "Client-side subscribe flow" step 5).
  if (Platform.OS === 'web') {
    const isStandalone =
      typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches;
    if (needsIosInstallHint(navigator.userAgent, isStandalone)) return null;
  }

  function persistDismiss() {
    if (Platform.OS === 'web') dismissPushPrompt(window.localStorage);
    setDismissed(true);
  }

  function handleEnable() {
    const userId = session?.user.id;
    if (userId) {
      subscribeForPush(userId).catch((err) => {
        console.warn('[push] subscribe failed', err);
      });
    }
    persistDismiss();
  }

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Text style={styles.iconGlyph}>🔔</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Stay in the loop</Text>
        <Text style={styles.copy}>
          Turn on notifications to hear about new class updates, announcements, and absences — even when the app is
          closed.
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.enableButton} onPress={handleEnable} accessibilityRole="button">
            <Text style={styles.enableText}>Enable notifications</Text>
          </Pressable>
          <Pressable style={styles.dismissButton} onPress={persistDismiss} accessibilityRole="button">
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: 'row',
    gap: theme.space['4'],
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.card,
    padding: theme.space['4'],
    margin: theme.space['4'],
  },
  iconWrap: {
    width: theme.space['10'],
    height: theme.space['10'],
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // No theme token maps to a single-glyph icon size: type.scale is text-purpose sizing
  // (h3=22 for headings, lead=18 for lead paragraphs) — both equidistant from 20 and neither
  // semantically an icon-glyph size. Left as a literal per finding-3 guidance rather than
  // contorting an unrelated token. See final-review-fix-report.md.
  iconGlyph: {
    fontSize: 20,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.h3,
    color: theme.colors.ink,
    marginBottom: theme.space['1'],
  },
  copy: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: theme.colors.ink3,
    marginBottom: theme.space['3'],
  },
  actions: {
    flexDirection: 'row',
    gap: theme.space['2'],
    flexWrap: 'wrap',
  },
  enableButton: {
    minHeight: theme.chrome.hitMin,
    justifyContent: 'center',
    paddingHorizontal: theme.space['4'],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  enableText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.onAction,
  },
  dismissButton: {
    minHeight: theme.chrome.hitMin,
    justifyContent: 'center',
    paddingHorizontal: theme.space['4'],
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.line2,
    backgroundColor: 'transparent',
  },
  dismissText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink2,
  },
}));
