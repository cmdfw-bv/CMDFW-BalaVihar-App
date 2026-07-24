import "../../../../lib/unistyles";
import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { router } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { useSession } from "../../../../lib/auth/SessionProvider";
import Field from "../../../../components/core/Field";
import Button from "../../../../components/core/Button";
import { insertClassUpdate } from "../api/classUpdates";
import { triggerClassUpdatePush } from "../api/pushTrigger";
import { buildClassUpdatePayload } from "../logic/classUpdatePayload";

type ScreenState = "form" | "submitting" | "error";

export default function ComposeClassUpdateScreen() {
  const { session, scopeId, activeRole, status } = useSession();
  const [body, setBody] = useState("");
  const [homework, setHomework] = useState("");
  const [state, setState] = useState<ScreenState>("form");
  const [errorMessage, setErrorMessage] = useState("");

  // Not a tab route, so useRoleGuard (TabKey-typed) doesn't apply directly — same
  // redirect-home convention (ADR-0014, design-system.md DoD: "no permission-denied
  // screen") applied inline: only a Teacher can post, everyone else bounces to the feed.
  useEffect(() => {
    if (status === "ready" && activeRole !== "teacher") {
      router.replace("/feed");
    }
  }, [status, activeRole]);

  const payload = buildClassUpdatePayload(body, homework);
  const canSubmit = payload !== null && state !== "submitting";

  async function submit() {
    if (!payload || !scopeId || !session) return;
    setState("submitting");
    try {
      const { id } = await insertClassUpdate(supabase, {
        classId: scopeId,
        postedBy: session.user.id,
        body: payload.body,
        homework: payload.homework,
      });
      void triggerClassUpdatePush(session.access_token, id);
      router.back();
    } catch (err) {
      // error-preserving: body/homework stay filled in, retry re-submits the same call.
      setErrorMessage(err instanceof Error ? err.message : "Couldn't post the update.");
      setState("error");
    }
  }

  return (
    <View style={styles.screen}>
      <Field
        label="What's happening in class?"
        as="textarea"
        value={body}
        onChangeText={setBody}
        placeholder="Share what your class covered today…"
      />
      <Field
        label="Homework"
        hint="Optional"
        as="textarea"
        value={homework}
        onChangeText={setHomework}
        placeholder="e.g. Read chapter 3"
      />
      {state === "error" ? <Text style={styles.error}>{errorMessage}</Text> : null}
      <Button variant="primary" fullWidth disabled={!canSubmit} onClick={submit}>
        {state === "submitting" ? "Posting…" : "Post"}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    flexDirection: "column" as const,
    gap: theme.space["4"],
    padding: theme.space["4"],
    backgroundColor: theme.colors.bg,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.status.absent,
  },
}));
