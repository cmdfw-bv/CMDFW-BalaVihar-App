import "../../../../lib/unistyles";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { useSession } from "../../../../lib/auth/SessionProvider";
import FeedCard from "../../../../components/feed/FeedCard";
import CommentThread from "../../../../components/comments/CommentThread";
import CommentComposer from "../../../../components/comments/CommentComposer";
import StateView from "../../../../components/core/StateView";
import { fetchClassUpdatesFeed, type ClassUpdateRow } from "../api/classUpdates";
import { fetchComments, insertComment, resolveParentFamilyLabel, type CommentRow } from "../api/comments";
import { groupCommentsForViewer } from "../logic/threadAssembly";

type ScreenState = "loading" | "error" | "content";
type ViewerRole = "student" | "parent" | "teacher";

export default function ClassUpdateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, activeRole } = useSession();
  const [state, setState] = useState<ScreenState>("loading");
  const [update, setUpdate] = useState<ClassUpdateRow | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [parentLabels, setParentLabels] = useState<Map<string, string | null>>(new Map());

  const role = (activeRole as ViewerRole) ?? "student";
  const groups = useMemo(() => groupCommentsForViewer(comments, role, session?.user.id ?? ""), [comments, role, session]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const feed = await fetchClassUpdatesFeed(supabase);
      const found = feed.find((u) => u.id === id) ?? null;
      const rows = await fetchComments(supabase, id);
      setUpdate(found);
      setComments(rows);
      setState("content");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Teacher's stacked private-thread cards are labeled with the target Parent/family's own
  // display name (M4's resolve_parent_family_label RPC) — fetched once per private group key,
  // never a Student's name (data minimization, /design's UI section).
  useEffect(() => {
    if (role !== "teacher" || !update) return;
    const privateKeys = groups.filter((g) => g.isPrivate).map((g) => g.key);
    const missing = privateKeys.filter((k) => !parentLabels.has(k));
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (parentUserId) => [parentUserId, await resolveParentFamilyLabel(supabase, parentUserId, update.class_id)] as const)
      );
      setParentLabels((prev) => new Map([...prev, ...entries]));
    })();
  }, [role, update, groups, parentLabels]);

  async function send(targetParentId: string | null, isPrivate: boolean, body: string) {
    if (!session) return;
    await insertComment(supabase, {
      classUpdateId: id,
      authorUserId: session.user.id,
      authorRole: role,
      body,
      isPrivate,
      targetParentId: isPrivate ? (targetParentId ?? session.user.id) : null,
    });
    await load();
  }

  if (state === "loading") return <StateView state="loading" />;
  if (state === "error") return <StateView state="error" errorText="Couldn't load this update." onRetry={load} />;
  if (!update || !session) return <StateView state="empty" emptyText="This update couldn't be found." />;

  const allEmpty = groups.every((g) => g.comments.length === 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <FeedCard
        author={{ role: "teacher", scope: update.classLabel }}
        kind="update"
        scope="class"
        body={update.body}
        homework={update.homework ?? undefined}
        tag={update.homework ? "Homework" : undefined}
        time={new Date(update.created_at).toLocaleDateString()}
      />

      {allEmpty ? <Text style={styles.emptyComments}>No comments yet</Text> : null}

      {groups.map((g) => (
        <View key={g.key} style={styles.threadCard}>
          {role === "teacher" ? (
            <Text style={styles.threadLabel}>
              {g.isPrivate ? (parentLabels.get(g.key) ?? "Private thread") : "Public"}
            </Text>
          ) : null}
          <CommentThread
            comments={g.comments.map((c) => ({
              author: { role: c.author_role },
              body: c.body,
              isPrivate: c.is_private,
              time: new Date(c.created_at).toLocaleDateString(),
            }))}
          >
            <CommentComposer
              canPrivate={role === "parent"}
              onSend={({ body, isPrivate }) =>
                send(role === "teacher" && g.isPrivate ? g.key : null, role === "teacher" ? g.isPrivate : isPrivate, body)
              }
            />
          </CommentThread>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    flexDirection: "column" as const,
    gap: theme.space["4"],
    padding: theme.space["4"],
  },
  emptyComments: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink3,
    textAlign: "center" as const,
    paddingVertical: theme.space["4"],
  },
  threadCard: {
    flexDirection: "column" as const,
    gap: theme.space["2"],
    padding: theme.space["3"],
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  threadLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: theme.type.scale.eyebrow,
    letterSpacing: theme.type.tracking.eyebrow,
    textTransform: "uppercase" as const,
    color: theme.colors.ink3,
  },
}));
