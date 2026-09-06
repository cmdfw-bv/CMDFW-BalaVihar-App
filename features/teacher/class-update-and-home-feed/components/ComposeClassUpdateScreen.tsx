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
import { meetingsPanel, type MeetingsState } from "../logic/meetingsPanel";

type ScreenState = "form" | "submitting" | "error";

export default function ComposeClassUpdateScreen() {
  const { session, scopeId, activeRole, status } = useSession();
  const [body, setBody] = useState("");
  const [homework, setHomework] = useState("");
  const [state, setState] = useState<ScreenState>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [meetings, setMeetings] = useState<string[]>([]);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingsState, setMeetingsState] = useState<MeetingsState>("loading");
  // Bumped by the retry affordance to re-run the fetch effect. A counter rather than calling the
  // fetch directly, so retry and first load stay one code path.
  const [retryToken, setRetryToken] = useState(0);

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
    // Chicago-pinned, not the device's calendar day. `class_updates_teacher_insert`
    // (`20260729093000:154`) bounds `meeting_date` by Chicago's today; a teacher whose device
    // clock is a day ahead — travelling east of Central, most plainly in Asia — would otherwise
    // be offered a date the database then rejects with a raw `42501` (PR #50 review round 6).
    // The whole point of that pin is that "today" means one date everywhere in this feature.
    const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    setMeetingsState("loading");
    fetchRecentClassMeetings(supabase, scopeId, todayIso)
      .then((dates) => {
        if (cancelled) return;
        setMeetings(dates);
        setMeetingDate(dates[0] ?? "");
        setMeetingsState(dates.length === 0 ? "none" : "ready");
      })
      .catch(() => {
        // `error`, never `none`: we failed to ask, which is not the server saying the class has
        // never met. See logic/meetingsPanel.ts for why the distinction is load-bearing.
        if (!cancelled) setMeetingsState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [scopeId, retryToken]);

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

  // Which head to render is decided in logic/meetingsPanel.ts rather than inline, because this
  // repo has no React renderer in test and the round-6 defect was exactly a branch that looked
  // right in JSX: `loading` fell through into the picker with an empty rail, and a failed fetch
  // rendered the "class has never met" copy.
  const panel = meetingsPanel(meetingsState);

  return (
    <View style={styles.screen}>
      {panel.kind === "notice" ? (
        <View style={styles.noticeBlock}>
          <Text style={styles.notice}>{panel.message}</Text>
          {panel.canRetry ? (
            <Button variant="secondary" onClick={() => setRetryToken((n) => n + 1)}>
              Try again
            </Button>
          ) : null}
        </View>
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
  noticeBlock: {
    gap: theme.space["3"],
    alignItems: "flex-start" as const,
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
