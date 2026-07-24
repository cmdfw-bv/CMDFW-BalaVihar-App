import "../../lib/unistyles";
import * as React from "react";
import { View, Text, Pressable, Modal, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { resolveActivePersona, type Persona } from "./PersonaSwitcher.logic";
import { colorAtPath } from "../core/tokenPath";

// Matches design/sankalp/bv-connect/components/navigation/PersonaSwitcher.jsx — the
// multi-persona active-role control. A compact pill shows the current role; tapping opens a
// bottom sheet to switch. Independent of components/RoleSwitcher.tsx (#17) — no shared code,
// no retrofit, ships as a fully separate primitive per ADR-0029.
export interface PersonaSwitcherProps {
  roles?: Persona[];
  activeId?: string;
  onChange?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}

export default function PersonaSwitcher({ roles = [], activeId, onChange, style }: PersonaSwitcherProps) {
  const { theme } = useUnistyles();
  const [open, setOpen] = React.useState(false);
  const active = resolveActivePersona(roles, activeId);
  const activeRole = "role" in active ? active.role : undefined;
  const activeRowId = "id" in active ? active.id : undefined;
  // Fallback matches the reference's `ROLE_HUE[active.role] || "var(--ink-3)"` — colorAtPath's
  // own fallback (colors.ink) is for genuinely-missing token paths, not the "no role at all"
  // empty-roles placeholder case, so that's resolved here instead.
  const hue = activeRole ? colorAtPath(theme.colors, `roles.${activeRole}`) : theme.colors.ink3;

  const pick = (id: string) => {
    setOpen(false);
    onChange?.(id);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.pill, style]}
        accessibilityRole="button"
        accessibilityLabel="Switch active role"
      >
        <View style={styles.pillDot(hue)} />
        <Text style={styles.pillLabel} numberOfLines={1}>
          {active.name}
        </Text>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.colors.ink4} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 9l6 6 6-6" />
        </Svg>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close">
          {/* Stops the tap from bubbling to the overlay's close handler — standard RN nested-Pressable pattern. */}
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.eyebrow}>Switch active role — re-scopes your data</Text>
            <View style={styles.list}>
              {roles.map((r) => {
                const on = r.id === activeRowId;
                return (
                  <Pressable key={r.id} onPress={() => pick(r.id)} style={styles.row(on)} accessibilityRole="button">
                    <View style={styles.rowDot(colorAtPath(theme.colors, `roles.${r.role}`))} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {r.name}
                      </Text>
                      {r.scope ? (
                        <Text style={styles.rowScope} numberOfLines={1}>
                          {r.scope}
                        </Text>
                      ) : null}
                    </View>
                    {on ? (
                      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M5 12l4 4L19 6" />
                      </Svg>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["2"], // 8 — nearest token to the reference's 7px
    paddingLeft: theme.space["3"], // 12 — nearest token to the reference's 11px
    // Deliberate literal — 10px sits exactly between space.2=8 and space.3=12, neither is a
    // closer fit, so this is disclosed rather than silently rounded (CsvImport.tsx precedent).
    paddingRight: 10,
    // Deliberate literal — 6px sits exactly between space.1=4 and space.2=8, neither is a
    // closer fit, so this is disclosed rather than silently rounded (StatusChip.tsx precedent).
    paddingVertical: 6,
    // The reference's own vertical padding (6px) is under the touch-target min — pinned to
    // theme.chrome.hitMin per the global >=44px touch-target constraint (Stage 7 review finding).
    minHeight: theme.chrome.hitMin,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.appSurface,
    borderWidth: 1,
    borderColor: theme.colors.line2,
    alignSelf: "flex-start",
  },
  pillDot: (color: string) => ({
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: color,
    flexShrink: 0,
  }),
  pillLabel: {
    flexShrink: 1,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.xs, // 13 — nearest token to the reference's 12.5px
    color: theme.colors.ink2,
  },
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: theme.chrome.maxw, // 440, exact match to the reference's var(--app-maxw)
    backgroundColor: theme.colors.canvas,
    borderTopLeftRadius: theme.radius.lg, // 18 — nearest token to the reference's 20px
    borderTopRightRadius: theme.radius.lg,
    // Deliberate literal — 10px sits exactly between space.2=8 and space.3=12, neither is a
    // closer fit, so this is disclosed rather than silently rounded.
    paddingTop: 10,
    // Deliberate literal — 14px sits exactly between space.3=12 and space.4=16, neither is a
    // closer fit, so this is disclosed rather than silently rounded.
    paddingHorizontal: 14,
    // Deliberate literal — 22px sits exactly between space.5=20 and space.6=24, neither is a
    // closer fit, so this is disclosed rather than silently rounded.
    paddingBottom: 22,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.line2,
    alignSelf: "center",
    marginTop: theme.space["1"], // 4, exact match
    // Deliberate literal — 14px sits exactly between space.3=12 and space.4=16, neither is a
    // closer fit, so this is disclosed rather than silently rounded.
    marginBottom: 14,
  },
  eyebrow: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.eyebrow, // 11 — nearest token to the reference's 10.5px
    letterSpacing: theme.type.tracking.eyebrow, // nearest token to the reference's .14em tracking
    textTransform: "uppercase",
    color: theme.colors.ink4,
    marginBottom: theme.space["3"], // 12, exact match
  },
  list: {
    flexDirection: "column",
    gap: theme.space["2"], // 8, exact match
  },
  // Divergence from the reference's box-shadow selection ring — RN has no reliable
  // cross-platform boxShadow equivalent (design-system rule: no web-only APIs). The primary
  // border color plus the trailing checkmark already communicate selection unambiguously.
  row: (on: boolean) => ({
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["3"], // 12, exact match
    width: "100%" as const,
    // Deliberate literal — 14px sits exactly between space.3=12 and space.4=16, neither is a
    // closer fit, so this is disclosed rather than silently rounded.
    padding: 14,
    minHeight: theme.chrome.hitMin,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: on ? theme.colors.primary : theme.colors.line,
    backgroundColor: theme.colors.appSurface,
  }),
  rowDot: (color: string) => ({
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: color,
    flexShrink: 0,
  }),
  rowBody: { flex: 1, minWidth: 0 },
  rowName: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm, // 14, exact match
    color: theme.colors.ink,
  },
  rowScope: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.eyebrow, // 11 — nearest token to the reference's 11.5px
    color: theme.colors.ink3,
    marginTop: 1, // no matching token — small vertical nudge (ListRow.tsx subtitle precedent)
  },
}));
