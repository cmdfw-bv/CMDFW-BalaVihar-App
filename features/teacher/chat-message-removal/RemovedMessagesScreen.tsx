import "../../../lib/unistyles";
import * as React from "react";
import { ScrollView, View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Card from "../../../components/core/Card";
import Button from "../../../components/core/Button";
import RoleBadge from "../../../components/core/RoleBadge";
import StateView from "../../../components/core/StateView";
import { SIDEBAR_WIDTH } from "../../../components/DesktopSidebar";
import { useSession } from "../../../lib/auth/SessionProvider";
import { useRemovedMessages } from "./useRemovedMessages";
import {
  reviewBody,
  reviewMetaLine,
  reviewRemoverLine,
  reviewScopeText,
  reviewBadgeRole,
} from "./reviewScreen";

// Spec: .docs/specs/teacher/chat-message-removal.md, "Removed messages review (this item)".
// Card rows follow the Dashboard's card language (design/sankalp/bv-connect/screens/desktop/
// dash.jsx); the footnote takes AuditEntry's quiet, factual tone (bv-connect/components/privacy/
// AuditEntry.prompt.md). Who may read the list is decided by the database function; this screen
// only lays it out.
export default function RemovedMessagesScreen() {
  const { activeRole, scopeLabel } = useSession();
  const { view, retryFirst, loadMore } = useRemovedMessages();
  const body = reviewBody(view);
  const scope = reviewScopeText(activeRole, scopeLabel);
  const badgeRole = reviewBadgeRole(activeRole);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap}>
      {/* The title "Removed messages" is the route's Stack header (with the back button), so
          this row carries only the role badge and scope. */}
      {badgeRole ? (
        <View style={styles.header}>
          <RoleBadge role={badgeRole} scope={scope ?? undefined} />
        </View>
      ) : null}

      {body.kind === "skeleton" ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Card key={i} style={styles.skeletonCard} />
          ))}
        </View>
      ) : body.kind === "empty" ? (
        <StateView state="empty" emptyText="No messages have been removed." />
      ) : body.kind === "error" ? (
        <StateView state="error" errorText="Couldn't load removed messages." onRetry={retryFirst} />
      ) : (
        <>
          <View style={styles.list}>
            {body.rows.map((row) => (
              <Card key={row.messageId} style={styles.rowCard}>
                <Text style={styles.meta}>{reviewMetaLine(row)}</Text>
                <View style={styles.quote}>
                  <Text style={styles.quoteText}>{row.body}</Text>
                </View>
                <Text style={styles.remover}>{reviewRemoverLine(row)}</Text>
              </Card>
            ))}
          </View>

          {body.footer === "loadMore" || body.footer === "loadingMore" ? (
            <Button
              variant="secondary"
              onClick={loadMore}
              disabled={body.footer === "loadingMore"}
              style={styles.footerButton}
            >
              Load more
            </Button>
          ) : body.footer === "retry" ? (
            <View style={styles.inlineError}>
              <Text style={styles.inlineErrorText}>Couldn&apos;t load more.</Text>
              <Button variant="secondary" onClick={loadMore}>
                Retry
              </Button>
            </View>
          ) : null}

          <Text style={styles.footnote}>Viewing these messages is recorded.</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
  },
  // Single column at every width; capped at the Dashboard content pane's width (deskw minus the
  // sidebar, as in app/(tabs)/_layout.tsx) so the two read as the same surface.
  wrap: {
    flexGrow: 1,
    width: "100%",
    maxWidth: theme.chrome.deskw - SIDEBAR_WIDTH,
    alignSelf: "center",
    gap: theme.space["4"],
    padding: {
      xs: theme.space["4"],
      md: theme.space["6"],
    },
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.space["3"],
  },
  list: {
    gap: theme.space["3"],
  },
  skeletonCard: {
    height: 112,
    opacity: 0.4,
  },
  rowCard: {
    gap: theme.space["3"],
  },
  meta: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink3,
    fontVariant: ["tabular-nums" as const],
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.line2,
    paddingLeft: theme.space["3"],
  },
  quoteText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.body,
    color: theme.colors.ink,
  },
  remover: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink4,
    fontVariant: ["tabular-nums" as const],
  },
  footerButton: {
    alignSelf: "center",
  },
  inlineError: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space["3"],
  },
  inlineErrorText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink3,
  },
  footnote: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink4,
    textAlign: "center",
  },
}));
