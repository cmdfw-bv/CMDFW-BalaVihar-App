import "../../../../lib/unistyles";
import { useEffect, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { router } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { useSession } from "../../../../lib/auth/SessionProvider";
import Field from "../../../../components/core/Field";
import Button from "../../../../components/core/Button";
import SegmentedTabs from "../../../../components/core/SegmentedTabs";
import { insertClassUpdate, fetchRecentClassMeetings } from "../api/classUpdates";
import { triggerClassUpdatePush } from "../api/pushTrigger";
import { buildClassUpdatePayload, CLASS_UPDATE_BODY_MAX, CLASS_UPDATE_HOMEWORK_MAX } from "../logic/classUpdatePayload";
import { meetingDateLabel } from "../logic/meetingDateLabel";

type ScreenState = "form" | "submitting" | "error";
type MeetingsState = "loading" | "ready" | "none";

export default function ComposeClassUpdateScreen() {
  const { session, scopeId, activeRole, status } = useSession();
  const [body, setBody] = useState("");
  const [homework, setHomework] = useState("");
  const [state, setState] = useState<ScreenState>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [meetings, setMeetings] = useState<string[]>([]);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingsState, setMeetingsState] = useState<MeetingsState>("loading");

  // Not a tab route, so useRoleGuard (TabKey-typed) doesn't apply directly — same
  // redirect-home convention (ADR-0014, design-system.md DoD: "no permission-denied
  // screen") applied inline: only a Teacher can post, everyone else bounces to the feed.
  useEffect(() => {
    if (status === "ready" && activeRole !== "teacher") {
      router.replace("/feed");
    }
  }, [status, activeRole]);

  // ADR-0036 §3: which meeting this update is about is a choice, not `today`. Offer the class's
  // recent scheduled meetings (newest first) and default to the most recent, so the common case —
  // posting right after class — is one tap, while a Teacher catching up on Monday can still file
  // against Sunday's meeting.
  useEffect(() => {
    if (!scopeId) return;
    let cancelled = false;
    const todayIso = new Date().toLocaleDateString("en-CA"); // local calendar day, not UTC
    fetchRecentClassMeetings(supabase, scopeId, todayIso)
      .then((dates) => {
        if (cancelled) return;
        setMeetings(dates);
        setMeetingDate(dates[0] ?? "");
        setMeetingsState(dates.length === 0 ? "none" : "ready");
      })
      .catch(() => {
        if (!cancelled) setMeetingsState("none");
      });
    return () => {
      cancelled = true;
    };
  }, [scopeId]);

  const payload = buildClassUpdatePayload(body, homework, meetingDate);
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
        meetingDate: payload.meetingDate,
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
      {meetingsState === "none" ? (
        // Honest state rather than a form that cannot succeed: meeting_date is NOT NULL, so with
        // no scheduled meeting on or before today there is nothing valid to post against.
        <Text style={styles.notice}>
          No class meetings have happened yet for this class, so there&apos;s nothing to post an update about.
        </Text>
      ) : (
        <Field label="Which class meeting?" as="select">
          {/*
            Horizontally scrollable: SegmentedTabs lays its rail out as a non-wrapping flex row, so
            at 360px the fourth date sits past the capsule's right edge and is unreachable. Found by
            screenshot during the ADR-0036 live walk — page-level overflow reads 0 because the rail
            clips it, so no automated breakpoint check flagged it (same shape as the #50 dashboard
            scroll bug). Scoped here rather than adding flexWrap to SegmentedTabs, which is shared
            with the home feed and the compliance dashboard.
          */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <SegmentedTabs
              tabs={meetings.map((d) => ({ id: d, label: meetingDateLabel(d) }))}
              value={meetingDate}
              onChange={setMeetingDate}
            />
          </ScrollView>
        </Field>
      )}
      <Field
        label="What's happening in class?"
        as="textarea"
        value={body}
        onChangeText={setBody}
        maxLength={CLASS_UPDATE_BODY_MAX}
        placeholder="Share what your class covered today…"
      />
      <Field
        label="Homework"
        hint="Optional"
        as="textarea"
        value={homework}
        onChangeText={setHomework}
        maxLength={CLASS_UPDATE_HOMEWORK_MAX}
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
  notice: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink3,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.status.absent,
  },
}));
