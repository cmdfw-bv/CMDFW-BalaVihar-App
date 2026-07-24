import "../../../../lib/unistyles";
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { router } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { useSession } from "../../../../lib/auth/SessionProvider";
import FeedCard from "../../../../components/feed/FeedCard";
import Button from "../../../../components/core/Button";
import StateView from "../../../../components/core/StateView";
import { fetchClassUpdatesFeed, fetchCommentCounts, type ClassUpdateRow } from "../api/classUpdates";

type ScreenState = "loading" | "empty" | "error" | "content";

export default function HomeFeedScreen() {
  const { activeRole } = useSession();
  const [state, setState] = useState<ScreenState>("loading");
  const [updates, setUpdates] = useState<ClassUpdateRow[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    setState((prev) => (prev === "content" ? prev : "loading"));
    try {
      const feed = await fetchClassUpdatesFeed(supabase);
      const commentCounts = await fetchCommentCounts(supabase, feed.map((u) => u.id));
      setUpdates(feed);
      setCounts(commentCounts);
      setState(feed.length === 0 ? "empty" : "content");
    } catch {
      // error-preserving (design-system.md DoD): if a previous successful load already
      // populated `updates`, they stay rendered below; only the state flag flips.
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasContent = updates.length > 0;

  return (
    <View style={styles.screen}>
      {activeRole === "teacher" ? (
        <Button variant="primary" onClick={() => router.push("/class-update/new")} style={styles.composeButton}>
          Post class update
        </Button>
      ) : null}

      {state === "loading" || (state === "empty" && !hasContent) ? (
        <StateView state={state === "empty" ? "empty" : "loading"} emptyText="No updates yet" />
      ) : null}

      {state === "error" && !hasContent ? (
        <StateView state="error" errorText="Couldn't load the feed." onRetry={load} />
      ) : null}

      {state === "content" || (state === "error" && hasContent) ? (
        <ScrollView contentContainerStyle={styles.list}>
          {state === "error" ? (
            <View style={styles.retryBanner}>
              <Text style={styles.retryBannerText}>Couldn't refresh — showing the last loaded feed.</Text>
              <Button variant="secondary" size="sm" onClick={load}>
                Retry
              </Button>
            </View>
          ) : null}
          {updates.map((u) => (
            <FeedCard
              key={u.id}
              author={{ role: "teacher", scope: u.classLabel }}
              kind="update"
              scope="class"
              body={u.body}
              homework={u.homework ?? undefined}
              tag={u.homework ? "Homework" : undefined}
              time={new Date(u.created_at).toLocaleDateString()}
              comments={counts.get(u.id) ?? 0}
              onOpen={() => router.push(`/class-update/${u.id}`)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  composeButton: {
    margin: theme.space["4"],
  },
  list: {
    flexDirection: "column" as const,
    gap: theme.space["3"],
    paddingHorizontal: theme.space["4"],
    paddingBottom: theme.space["6"],
  },
  retryBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: theme.space["3"],
    padding: theme.space["3"],
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.statusRamp.absentSoft,
    borderWidth: 1,
    borderColor: theme.colors.statusRamp.absentLine,
  },
  retryBannerText: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.status.absent,
  },
}));
