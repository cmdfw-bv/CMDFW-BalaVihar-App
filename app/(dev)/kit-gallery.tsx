import "../../lib/unistyles";
import * as React from "react";
import { ScrollView, View, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Svg, { Circle } from "react-native-svg";
import type { ReactNode } from "react";

// core
import Button from "../../components/core/Button";
import { BUTTON_VARIANTS, BUTTON_SIZES, type ButtonVariant, type ButtonSize } from "../../components/core/Button.logic";
import Card from "../../components/core/Card";
import type { CardTone } from "../../components/core/Card.logic";
import Field from "../../components/core/Field";
import StatusChip from "../../components/core/StatusChip";
import { STATUS_CHIP_KEYS } from "../../components/core/StatusChip.logic";
import StatTile from "../../components/core/StatTile";
import SegmentedTabs from "../../components/core/SegmentedTabs";
import type { TabItem } from "../../components/core/SegmentedTabs.logic";
import Stepper from "../../components/core/Stepper";
import RoleBadge from "../../components/core/RoleBadge";
import { ROLE_KEYS } from "../../components/core/RoleBadge.logic";
import ListRow from "../../components/core/ListRow";
import StateView from "../../components/core/StateView";

// brand
import EventDateBlock from "../../components/brand/EventDateBlock";
import type { EventDateSize } from "../../components/brand/EventDateBlock.logic";

// comments
import CommentThread from "../../components/comments/CommentThread";
import Comment, { type CommentProps } from "../../components/comments/Comment";
import CommentComposer from "../../components/comments/CommentComposer";

// privacy
import AuditEntry from "../../components/privacy/AuditEntry";
import type { AuditAction } from "../../components/privacy/AuditEntry.logic";
import ConsentCapture, { type ConsentItem } from "../../components/privacy/ConsentCapture";

// chat
import ConversationRow from "../../components/chat/ConversationRow";
import ChatBubble from "../../components/chat/ChatBubble";
import MessageComposer from "../../components/chat/MessageComposer";

// admin
import CsvImport from "../../components/admin/CsvImport";
import UserRoleRow from "../../components/admin/UserRoleRow";

// navigation
import PersonaSwitcher from "../../components/navigation/PersonaSwitcher";
import type { Persona } from "../../components/navigation/PersonaSwitcher.logic";

// dashboard
import ComplianceBar from "../../components/dashboard/ComplianceBar";
import CenterRollupRow from "../../components/dashboard/CenterRollupRow";

// feed
import FeedCard from "../../components/feed/FeedCard";

// notifications
import NotificationItem from "../../components/notifications/NotificationItem";
import PushPermissionPrompt from "../../components/notifications/PushPermissionPrompt";

// auth
import MagicLinkLogin from "../../components/auth/MagicLinkLogin";

// ---------------------------------------------------------------------------
// Dev-only gallery (issue #18) — every ported component wired up with hand-written
// fixture props for visual verification. No Supabase, no data-fetching: every prop
// value below is a literal. See .superpowers/sdd/stage-13-brief.md for the exact
// per-component fixture-coverage requirements this file satisfies.
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const BUTTON_VARIANT_KEYS = Object.keys(BUTTON_VARIANTS) as ButtonVariant[];
const BUTTON_SIZE_KEYS = Object.keys(BUTTON_SIZES) as ButtonSize[];

function ButtonGallery() {
  return (
    <View style={styles.col}>
      {BUTTON_VARIANT_KEYS.map((variant) => {
        const needsDarkBg = variant === "dark" || variant === "outline";
        return (
          <View key={variant} style={styles.col}>
            <Text style={styles.caption}>{variant}</Text>
            <View style={[styles.row, needsDarkBg ? styles.darkWrap : null]}>
              {BUTTON_SIZE_KEYS.map((size) => (
                <Button key={size} variant={variant} size={size} onClick={() => {}}>
                  {size.toUpperCase()}
                </Button>
              ))}
            </View>
          </View>
        );
      })}
      <View style={styles.col}>
        <Text style={styles.caption}>disabled</Text>
        <Button variant="primary" disabled onClick={() => {}}>
          Disabled
        </Button>
      </View>
      <View style={styles.col}>
        <Text style={styles.caption}>fullWidth</Text>
        <Button variant="primary" fullWidth onClick={() => {}}>
          Full width
        </Button>
      </View>
    </View>
  );
}

const CARD_TONES: CardTone[] = ["surface", "cream", "indigo"];

function CardGallery() {
  return (
    <View style={styles.row}>
      {CARD_TONES.flatMap((tone) =>
        [false, true].map((interactive) => (
          <View key={`${tone}-${interactive}`} style={styles.cardCell}>
            <Card tone={tone} interactive={interactive} padding={16}>
              <Text style={tone === "indigo" ? styles.cardTextOnDark : styles.cardText}>
                {tone} · interactive={String(interactive)}
              </Text>
            </Card>
          </View>
        )),
      )}
    </View>
  );
}

function FieldGallery() {
  const [name, setName] = React.useState("Anjali Rao");
  return (
    <View style={styles.col}>
      <Field label="Name" placeholder="Full name" value={name} onChangeText={setName} />
      <Field label="Notes" as="textarea" placeholder="Add context…" />
      <Field label="Grade" as="select">
        <Text style={styles.selectText}>Grade 5</Text>
      </Field>
      <Field label="Email" placeholder="you@example.com" error="Enter a valid email address" />
      <Field label="Family ID" placeholder="e.g. FAM-0231" required />
    </View>
  );
}

function StatusChipGallery() {
  return (
    <View style={styles.col}>
      <View style={styles.row}>
        {STATUS_CHIP_KEYS.map((status) => (
          <StatusChip key={status} status={status}>
            {status}
          </StatusChip>
        ))}
      </View>
      <View style={styles.row}>
        <StatusChip status="absent" dot>
          absent · dot forced on
        </StatusChip>
        <StatusChip status="absent" dot={false}>
          absent · dot forced off
        </StatusChip>
      </View>
    </View>
  );
}

function StatTileGallery() {
  return (
    <View style={styles.row}>
      <StatTile label="Present" value={128} />
      <StatTile label="Attendance" value="92%" display />
      <StatTile label="Absent" value={6} accent />
      <StatTile label="Streak" value="14 days" display accent />
    </View>
  );
}

function SegmentedTabsGallery() {
  const [a, setA] = React.useState("upcoming");
  const [b, setB] = React.useState("open");
  const items: TabItem[] = [
    { id: "open", label: "Open", count: 5 },
    { id: "closed", label: "Closed", count: 12 },
  ];
  return (
    <View style={styles.col}>
      <SegmentedTabs tabs={["upcoming", "past", "all"]} value={a} onChange={setA} />
      <SegmentedTabs tabs={items} value={b} onChange={setB} />
    </View>
  );
}

function StepperGallery() {
  const [count, setCount] = React.useState(3);
  const [atMin, setAtMin] = React.useState(0);
  const [atMax, setAtMax] = React.useState(5);
  return (
    <View style={styles.col}>
      <Stepper label="Sessions attended" value={count} onChange={setCount} />
      <Stepper label="Absences (min 0)" hint="Clamped at the minimum" value={atMin} onChange={setAtMin} min={0} />
      <Stepper label="Makeup classes (max 5)" hint="Clamped at the maximum" value={atMax} onChange={setAtMax} min={0} max={5} />
    </View>
  );
}

function RoleBadgeGallery() {
  return (
    <View style={styles.row}>
      {ROLE_KEYS.map((role) =>
        role === "teacher" ? <RoleBadge key={role} role={role} scope="JR·A" /> : <RoleBadge key={role} role={role} />,
      )}
    </View>
  );
}

const EVENT_DATE_SIZES: EventDateSize[] = ["sm", "md", "lg"];

function EventDateBlockGallery() {
  return (
    <View style={styles.row}>
      {EVENT_DATE_SIZES.map((size) => (
        <EventDateBlock key={`${size}-year`} day="14" month="Aug" year="2026" size={size} />
      ))}
      {EVENT_DATE_SIZES.map((size) => (
        <EventDateBlock key={`${size}-noyear`} day="03" month="Sep" size={size} />
      ))}
    </View>
  );
}

function ListRowGallery() {
  const { theme } = useUnistyles();
  return (
    <View style={styles.col}>
      <ListRow
        leading={
          <View style={styles.initialCircle}>
            <Text style={styles.initialLabel}>A</Text>
          </View>
        }
        title="Anjali Rao"
        subtitle="Grade 5 · Section A"
      />
      <ListRow
        leading={
          <View style={styles.iconCircle}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth={1.8}>
              <Circle cx={12} cy={12} r={9} />
            </Svg>
          </View>
        }
        title="Attendance reminder"
        subtitle="Sent to 48 families"
      />
      <ListRow
        leading={
          <View style={styles.miniBar}>
            <View style={styles.miniBarFill} />
          </View>
        }
        title="Week 6 progress"
        subtitle="92% complete"
      />
    </View>
  );
}

function StateViewGallery() {
  return (
    <View style={styles.col}>
      <View style={styles.stateBox}>
        <Text style={styles.caption}>loading</Text>
        <StateView state="loading" />
      </View>
      <View style={styles.stateBox}>
        <Text style={styles.caption}>empty</Text>
        <StateView state="empty" emptyText="No records yet." />
      </View>
      <View style={styles.stateBox}>
        <Text style={styles.caption}>error · with retry</Text>
        <StateView state="error" errorText="Couldn't load records." onRetry={() => {}} />
      </View>
      <View style={styles.stateBox}>
        <Text style={styles.caption}>error · no retry</Text>
        <StateView state="error" errorText="Records unavailable right now." />
      </View>
      <View style={styles.stateBox}>
        <Text style={styles.caption}>content</Text>
        <StateView state="content">
          <Text style={styles.plainText}>Loaded content renders here.</Text>
        </StateView>
      </View>
    </View>
  );
}

const SAMPLE_COMMENTS: CommentProps[] = [
  { author: { name: "Meera Nair", role: "teacher" }, time: "2:14 PM", body: "Great progress this week!" },
  { author: { name: "Karthik S.", role: "parent" }, time: "2:20 PM", body: "Thank you for the update." },
  {
    author: { name: "Meera Nair", role: "teacher" },
    time: "2:25 PM",
    body: "Happy to help — see you Saturday.",
    isPrivate: true,
  },
];

function CommentThreadGallery() {
  return (
    <View style={styles.col}>
      <CommentThread count={0} comments={[]} />
      <CommentThread comments={SAMPLE_COMMENTS} />
      <CommentThread count={9} comments={SAMPLE_COMMENTS} />
    </View>
  );
}

function CommentGallery() {
  return (
    <View style={styles.col}>
      <Comment author={{ name: "Meera Nair", role: "teacher" }} time="2:14 PM" body="Great progress this week!" />
      <Comment
        author={{ name: "Karthik S.", role: "parent" }}
        time="2:20 PM"
        body="Could we discuss the field trip permission?"
        isPrivate
      />
    </View>
  );
}

function CommentComposerGallery() {
  return (
    <View style={styles.col}>
      <CommentComposer canPrivate onSend={() => {}} />
      <CommentComposer canPrivate={false} placeholder="Add a public comment…" onSend={() => {}} />
    </View>
  );
}

const AUDIT_ROWS: { time: string; actor: string; action: AuditAction; target: string }[] = [
  { time: "14:32", actor: "coordinator", action: "approve", target: "parent consent — Karthik S." },
  { time: "14:20", actor: "teacher:JR·A", action: "export", target: "Grade 5 attendance CSV" },
  { time: "13:58", actor: "teacher:JR·A", action: "edit", target: "student #3 record" },
  { time: "13:40", actor: "admin", action: "view", target: "family FAM-0231" },
  { time: "13:05", actor: "admin", action: "delete", target: "duplicate enrollment row" },
];

function AuditEntryGallery() {
  return (
    <View style={styles.col}>
      {AUDIT_ROWS.map((r) => (
        <AuditEntry key={r.time} time={r.time} actor={r.actor} action={r.action} target={r.target} />
      ))}
    </View>
  );
}

const CONSENT_ITEMS: ConsentItem[] = [
  {
    id: "media",
    label: "Photo & video consent",
    help: "Allow photos/videos from sessions to be used in center communications.",
    required: true,
  },
  { id: "directory", label: "Family directory listing", help: "Share contact info with other families in the same class." },
  { id: "sms", label: "SMS reminders" },
];

function ConsentCaptureGallery() {
  return (
    <ConsentCapture
      items={CONSENT_ITEMS}
      values={{ media: true, directory: true, sms: false }}
      timestamps={{ media: "Jul 10, 2026 · 9:02 AM", directory: "Jul 10, 2026 · 9:03 AM" }}
      onToggle={() => {}}
    />
  );
}

function ConversationRowGallery() {
  return (
    <View style={styles.col}>
      <ConversationRow
        kind="group"
        name="Grade 5 · Section A"
        preview="Reminder: bring your workbook tomorrow."
        time="9:41 AM"
        unread={3}
        onPress={() => {}}
      />
      <ConversationRow kind="dm" role="student" name="Arjun Mehta" preview="Thank you!" time="Yesterday" unread={0} onPress={() => {}} />
      <ConversationRow
        kind="dm"
        role="parent"
        name="Priya Iyer"
        preview="Can we reschedule?"
        time="8:15 AM"
        unread={4}
        onPress={() => {}}
      />
      <ConversationRow
        kind="dm"
        role="teacher"
        name="Meera Nair"
        preview="Sent the report."
        time="Just now"
        unread={0}
        active
        onPress={() => {}}
      />
    </View>
  );
}

function ChatBubbleGallery() {
  return (
    <View style={styles.chatCol}>
      <ChatBubble own read={false} time="9:02 AM">
        Got it, thank you!
      </ChatBubble>
      <ChatBubble own read time="9:05 AM">
        See you at 6.
      </ChatBubble>
      <ChatBubble own time="9:07 AM">
        One more thing…
      </ChatBubble>
      <ChatBubble author="Priya Iyer" time="9:00 AM">
        Hi! Quick question about homework.
      </ChatBubble>
      <ChatBubble showName={false} time="9:01 AM">
        Also, is the field trip still on?
      </ChatBubble>
    </View>
  );
}

function MessageComposerGallery() {
  return (
    <View style={styles.col}>
      <MessageComposer onSend={() => {}} />
      <MessageComposer allowAttach onSend={() => {}} />
    </View>
  );
}

function CsvImportGallery() {
  return (
    <View style={styles.row}>
      <View style={styles.csvCell}>
        <CsvImport onChoose={() => {}} onConfirm={() => {}} />
      </View>
      <View style={styles.csvCell}>
        <CsvImport fileName="enrollment_fall2026.csv" total={45} ready={42} flagged={3} onChoose={() => {}} onConfirm={() => {}} />
      </View>
    </View>
  );
}

function UserRoleRowGallery() {
  return (
    <View style={styles.col}>
      <UserRoleRow name="Anjali Rao" email="anjali.rao@example.com" scope="Frisco · F3" roles={["teacher"]} status="active" onManage={() => {}} />
      <UserRoleRow
        name="Karthik Subramaniam"
        email="karthik.s@example.com"
        roles={["parent"]}
        status="pending"
        onApprove={() => {}}
        onReject={() => {}}
      />
      <UserRoleRow
        name="Deepa Krishnan"
        email="deepa.k@example.com"
        scope="DFW Region"
        roles={["coordinator", { role: "teacher", scope: "JR·A" }, { role: "admin" }, "bv"]}
        status="active"
        onManage={() => {}}
      />
    </View>
  );
}

const PERSONA_ROLES: Persona[] = [
  { id: "r1", name: "Priya Iyer — Teacher", role: "teacher", scope: "JR·A · Frisco" },
  { id: "r2", name: "Priya Iyer — Parent", role: "parent", scope: "Frisco" },
  { id: "r3", name: "Priya Iyer — BV Coordinator", role: "bv", scope: "DFW Region" },
];

function PersonaSwitcherGallery() {
  // PersonaSwitcher owns its open/closed sheet state internally (no controlled `open` prop) —
  // this wrapper demonstrates the closed pill plus live active-role switching; the open-sheet
  // visual (3 roles including bv) is reached by tapping the pill during manual /test review.
  const [activeId, setActiveId] = React.useState("r1");
  return (
    <View style={styles.col}>
      <Text style={styles.hintText}>Tap the pill to open the sheet — 3 roles shown, including BV.</Text>
      <PersonaSwitcher roles={PERSONA_ROLES} activeId={activeId} onChange={setActiveId} />
    </View>
  );
}

function ComplianceBarGallery() {
  return (
    <View style={styles.col}>
      <ComplianceBar label="Attendance" value={92} />
      <ComplianceBar label="Homework compliance" value={75} />
      <ComplianceBar label="Approvals outstanding" value={40} />
      <ComplianceBar label="Data sync" value={55} status="info" note="Forced status=info override" />
    </View>
  );
}

function CenterRollupRowGallery() {
  return (
    <View style={styles.col}>
      <CenterRollupRow name="Frisco Center" region="North Texas" attendance={92} marked={46} enrolled={50} onPress={() => {}} />
      <CenterRollupRow name="Irving Center" region="North Texas" attendance={61} marked={30} enrolled={49} onPress={() => {}} />
      <CenterRollupRow name="Plano Center" region="North Texas" placeholder onPress={() => {}} />
    </View>
  );
}

function FeedCardGallery() {
  return (
    <View style={styles.col}>
      <FeedCard
        kind="announcement"
        scope="org"
        pinned
        tag="Reminder"
        title="Bala Vihar in-person resumes August 3"
        body="Please plan to arrive by 9:45 AM for check-in."
        time="2 hours ago"
        reach={340}
        comments={12}
        author={{ name: "CMDFW Bala Vihar", role: "coordinator", scope: "DFW" }}
        onOpen={() => {}}
      />
      <FeedCard
        kind="update"
        scope="center"
        tag="Homework"
        title="Week 6 homework posted"
        homework="Bhagavad Gita ch. 2, verses 1–10 — memorize slokas 11–15."
        time="Yesterday"
        reach={48}
        comments={3}
        author={{ name: "Meera Nair", role: "teacher", scope: "Frisco" }}
        onOpen={() => {}}
      />
      <FeedCard
        kind="update"
        scope="class"
        title="Field trip photos uploaded"
        body="Check out the gallery from Saturday's trip!"
        time="3 days ago"
        reach={22}
        comments={5}
        author={{ name: "Anjali Rao", role: "teacher", scope: "JR·A" }}
        onOpen={() => {}}
      />
    </View>
  );
}

function NotificationItemGallery() {
  return (
    <View style={styles.col}>
      <NotificationItem type="update" title="Week 6 homework posted" body="Bhagavad Gita ch.2, verses 1-10" time="1h" onPress={() => {}} />
      <NotificationItem
        type="announce"
        title="In-person resumes August 3"
        body="Arrive by 9:45 AM for check-in"
        time="2h"
        unread
        onPress={() => {}}
      />
      <NotificationItem type="absence" title="Absence recorded" body="Marked absent for Jul 12 session" time="1d" onPress={() => {}} />
      <NotificationItem type="approval" title="Consent approved" body="Photo/video consent for Karthik S." time="2d" onPress={() => {}} />
      <NotificationItem type="chat" title="New message from Meera Nair" body="Sent the report." time="3d" onPress={() => {}} />
    </View>
  );
}

function PushPermissionPromptGallery() {
  return <PushPermissionPrompt onEnable={() => {}} onDismiss={() => {}} />;
}

function MagicLinkLoginGallery() {
  return (
    <View style={styles.col}>
      <MagicLinkLogin onSend={() => {}} />
      <MagicLinkLogin sent email="parent@example.com" onSend={() => {}} />
    </View>
  );
}

export default function KitGallery() {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.pageTitle}>Sankalp Component Kit — Gallery</Text>

      <Section title="Button">
        <ButtonGallery />
      </Section>
      <Section title="Card">
        <CardGallery />
      </Section>
      <Section title="Field">
        <FieldGallery />
      </Section>
      <Section title="StatusChip">
        <StatusChipGallery />
      </Section>
      <Section title="StatTile">
        <StatTileGallery />
      </Section>
      <Section title="SegmentedTabs">
        <SegmentedTabsGallery />
      </Section>
      <Section title="Stepper">
        <StepperGallery />
      </Section>
      <Section title="RoleBadge">
        <RoleBadgeGallery />
      </Section>
      <Section title="EventDateBlock">
        <EventDateBlockGallery />
      </Section>
      <Section title="ListRow">
        <ListRowGallery />
      </Section>
      <Section title="StateView">
        <StateViewGallery />
      </Section>
      <Section title="CommentThread">
        <CommentThreadGallery />
      </Section>
      <Section title="Comment">
        <CommentGallery />
      </Section>
      <Section title="CommentComposer">
        <CommentComposerGallery />
      </Section>
      <Section title="AuditEntry">
        <AuditEntryGallery />
      </Section>
      <Section title="ConsentCapture">
        <ConsentCaptureGallery />
      </Section>
      <Section title="ConversationRow">
        <ConversationRowGallery />
      </Section>
      <Section title="ChatBubble">
        <ChatBubbleGallery />
      </Section>
      <Section title="MessageComposer">
        <MessageComposerGallery />
      </Section>
      <Section title="CsvImport">
        <CsvImportGallery />
      </Section>
      <Section title="UserRoleRow">
        <UserRoleRowGallery />
      </Section>
      <Section title="PersonaSwitcher">
        <PersonaSwitcherGallery />
      </Section>
      <Section title="ComplianceBar">
        <ComplianceBarGallery />
      </Section>
      <Section title="CenterRollupRow">
        <CenterRollupRowGallery />
      </Section>
      <Section title="FeedCard">
        <FeedCardGallery />
      </Section>
      <Section title="NotificationItem">
        <NotificationItemGallery />
      </Section>
      <Section title="PushPermissionPrompt">
        <PushPermissionPromptGallery />
      </Section>
      <Section title="MagicLinkLogin">
        <MagicLinkLoginGallery />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: { padding: theme.space["6"], gap: theme.space["8"] },
  pageTitle: {
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.h2,
    color: theme.colors.ink,
    marginBottom: theme.space["4"],
  },
  section: { gap: theme.space["3"] },
  sectionTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink3,
    textTransform: "uppercase",
    letterSpacing: theme.type.tracking.eyebrow,
  },
  sectionBody: { gap: theme.space["3"] },

  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: theme.space["3"] },
  col: { flexDirection: "column", gap: theme.space["3"] },
  caption: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.eyebrow,
    color: theme.colors.ink3,
    textTransform: "uppercase",
    letterSpacing: theme.type.tracking.eyebrow,
  },
  darkWrap: {
    backgroundColor: theme.colors.ink,
    padding: theme.space["3"],
    borderRadius: theme.radius.control,
  },

  cardCell: { width: 220, maxWidth: "100%" },
  cardText: { fontFamily: theme.fonts.body, fontSize: theme.type.scale.sm, color: theme.colors.ink },
  cardTextOnDark: { fontFamily: theme.fonts.body, fontSize: theme.type.scale.sm, color: theme.colors.onDark },

  selectText: { fontFamily: theme.fonts.body, fontSize: theme.type.scale.body, color: theme.colors.ink },

  initialCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.indigo,
    alignItems: "center",
    justifyContent: "center",
  },
  initialLabel: { fontFamily: theme.fonts.display, fontSize: theme.type.scale.sm, color: theme.colors.onAction },

  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  miniBar: {
    width: 64,
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.line2,
    overflow: "hidden",
  },
  miniBarFill: { width: "70%", height: "100%", borderRadius: theme.radius.pill, backgroundColor: theme.colors.primary },

  stateBox: {
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.control,
    padding: theme.space["3"],
    gap: theme.space["2"],
  },
  plainText: { fontFamily: theme.fonts.body, fontSize: theme.type.scale.sm, color: theme.colors.ink },

  chatCol: { flexDirection: "column", gap: theme.space["3"], width: "100%" },

  csvCell: { flexGrow: 1, minWidth: 280, maxWidth: 360 },

  hintText: { fontFamily: theme.fonts.body, fontSize: theme.type.scale.xs, color: theme.colors.ink3 },
}));
