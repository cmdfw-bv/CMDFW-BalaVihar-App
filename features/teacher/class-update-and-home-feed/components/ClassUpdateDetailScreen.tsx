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
import { fetchClassUpdateById, type ClassUpdateRow } from "../api/classUpdates";
import { fetchComments, insertComment, resolveParentFamilyLabel, type CommentRow } from "../api/comments";
import { groupCommentsForViewer } from "../logic/threadAssembly";

type ScreenState = "loading" | "error" | "content";
type ViewerRole = "student" | "parent" | "teacher";

// Only these three roles have an INSERT policy on `comments` (comments_student_insert /
// comments_parent_insert / comments_teacher_insert). Coordinator/BV Coordinator/Admin have
// select-only oversight policies (comments_coordinator_select/comments_org_select), so they must
// never see a live composer (finding: PR #48 review).
const COMMENTABLE_ROLES: ReadonlySet<string> = new Set<ViewerRole>(["student", "parent", "teacher"]);

export default function ClassUpdateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, activeRole } = useSession();
  const [state, setState] = useState<ScreenState>("loading");
  const [update, setUpdate] = useState<ClassUpdateRow | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [parentLabels, setParentLabels] = useState<Map<string, string | null>>(new Map());

  const canComment = COMMENTABLE_ROLES.has(activeRole ?? "");
  const role: ViewerRole = canComment ? (activeRole as ViewerRole) : "student";
  // Oversight roles get the same full public+private read Teacher gets (comments_coordinator_select /
  // comments_org_select mirror comments_teacher_public_select's scope) — reuse the teacher-shaped
  // grouping for them too, just without a composer.
  const groupingRole: ViewerRole = canComment ? role : "teacher";
  const groups = useMemo(
    () => groupCommentsForViewer(comments, groupingRole, session?.user.id ?? ""),
    [comments, groupingRole, session]
  );

  const load = useCallback(async () => {
    // Matches HomeFeedScreen's guard: a refetch after an already-successful load (e.g. the
    // post-send reload below) stays on "content" instead of blanking the whole thread stack
    // to a full-screen spinner.
    setState((prev) => (prev === "content" ? prev : "loading"));
    try {
      const found = await fetchClassUpdateById(supabase, id);
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
    if (groupingRole !== "teacher" || !update) return;
    const privateKeys = groups.filter((g) => g.isPrivate).map((g) => g.key);
    const missing = privateKeys.filter((k) => !parentLabels.has(k));
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (parentUserId) => [parentUserId, await resolveParentFamilyLabel(supabase, parentUserId, update.class_id)] as const)
      );
      setParentLabels((prev) => new Map([...prev, ...entries]));
    })();
  }, [groupingRole, update, groups, parentLabels]);

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
          {groupingRole === "teacher" ? (
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
            {canComment ? (
              <CommentComposer
                canPrivate={role === "parent"}
                onSend={({ body, isPrivate }) =>
                  send(role === "teacher" && g.isPrivate ? g.key : null, role === "teacher" ? g.isPrivate : isPrivate, body)
                }
              />
            ) : null}
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
