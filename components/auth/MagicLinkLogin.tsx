import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Rect, Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Logo from "../brand/Logo";
import Field from "../core/Field";
import Button from "../core/Button";
import { magicLinkCopy } from "./MagicLinkLogin.logic";

// Matches design/sankalp/bv-connect/components/auth/MagicLinkLogin.jsx — passwordless sign-in.
// One email field -> "send magic link", then a confirmation state. No minor self-registration:
// accounts are coordinator/admin-provisioned, so there is deliberately no sign-up affordance
// here. Presentational only — `onSend` is a callback prop; this component never calls Supabase
// Auth itself (ships alongside, not instead of, app/(auth)/sign-in.tsx from issue #17).
export interface MagicLinkLoginProps {
  appName?: string;
  tagline?: string;
  /** Toggle the "check your email" confirmation state. */
  sent?: boolean;
  email?: string;
  /** Called with the current email on send / resend. */
  onSend?: (email: string) => void;
  style?: StyleProp<ViewStyle>;
}

function MailSentIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={5} width={18} height={14} rx={2} />
      <Path d="m3 7 9 6 9-6" />
    </Svg>
  );
}

export default function MagicLinkLogin({
  appName = "Bala Vihar App",
  tagline = "CMDFW · Dallas–Fort Worth",
  sent = false,
  email: emailProp = "",
  onSend,
  style,
}: MagicLinkLoginProps) {
  const { theme } = useUnistyles();
  const [email, setEmail] = React.useState(emailProp);
  const copy = magicLinkCopy(sent, email);

  const submit = () => {
    if (email.trim() && onSend) onSend(email);
  };

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.logoRow}>
        <Logo size={44} title={appName} tagline={tagline} />
      </View>

      {!sent ? (
        <View style={styles.form}>
          <View style={styles.headingCol}>
            <Text style={styles.heading}>{copy.heading}</Text>
            <Text style={styles.body}>{copy.body}</Text>
          </View>
          <Field
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
          />
          <Button variant="primary" fullWidth onClick={submit}>
            Send magic link
          </Button>
          <Text style={styles.footnote}>
            Accounts are set up by your center. There's no public sign-up — students never self-register.
          </Text>
        </View>
      ) : (
        <View style={styles.confirm}>
          <View style={styles.iconWell}>
            <MailSentIcon color={theme.colors.status.present} size={28} />
          </View>
          <View style={styles.headingCol}>
            <Text style={[styles.heading, styles.centered]}>{copy.heading}</Text>
            <Text style={[styles.body, styles.centered]}>{copy.body}</Text>
          </View>
          <Button variant="ghost" size="sm" onClick={submit}>
            Resend link
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    width: "100%" as const,
    maxWidth: theme.chrome.maxw,
    alignSelf: "center" as const,
  },
  logoRow: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: theme.space["6"],
  },
  form: {
    flexDirection: "column" as const,
    gap: theme.space["4"],
  },
  headingCol: {
    flexDirection: "column" as const,
    gap: theme.space["1"],
  },
  heading: {
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.h3,
    color: theme.colors.ink,
    letterSpacing: theme.type.tracking.display,
  },
  body: {
    fontFamily: theme.fonts.body,
    // Deliberate literal — reference's 13.5px sits between scale.xs=13 and scale.sm=14, neither
    // is an exact fit (StatTile.tsx/PushPermissionPrompt.tsx precedent for disclosed literals).
    fontSize: 13.5,
    lineHeight: 13.5 * theme.type.leading.body,
    color: theme.colors.ink3,
  },
  centered: {
    textAlign: "center" as const,
  },
  footnote: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow,
    lineHeight: theme.type.scale.eyebrow * theme.type.leading.body,
    color: theme.colors.ink4,
  },
  confirm: {
    flexDirection: "column" as const,
    alignItems: "center" as const,
    gap: theme.space["4"],
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.statusRamp.presentSoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
}));
