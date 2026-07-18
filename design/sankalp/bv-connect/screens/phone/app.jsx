/* global React, ReactDOM */
const DS = window.ChinmayaMissionDesignSystem_52eae1;
const {
  MagicLinkLogin, PushPermissionPrompt, FeedCard, CommentThread, CommentComposer,
  ConversationRow, ChatBubble, MessageComposer, NotificationItem, PersonaSwitcher,
  ComplianceBar, RoleBadge, StatusChip, Button,
} = DS;
const { useState } = React;
const OM = "../../../assets/chinmaya-om.png";

const ROLES = [
  { id: "teacher", name: "Teacher", role: "teacher", scope: "JR·A · Brampton" },
  { id: "parent", name: "Parent", role: "parent", scope: "2 children" },
  { id: "coordinator", name: "Coordinator", role: "coordinator", scope: "Session · Brampton" },
  { id: "bv", name: "BV Coordinator", role: "bv", scope: "Org rollup" },
];

const ic = (d, s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const ICON = {
  feed: ic(<><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none"/></>),
  msg: ic(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>),
  reg: ic(<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>),
  bell: ic(<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/></>, 18),
  back: ic(<path d="M15 18l-6-6 6-6"/>, 18),
  check: ic(<path d="M5 12l4 4L19 6"/>, 16),
  x: ic(<path d="M6 6l12 12M18 6 6 18"/>, 16),
};

const STUDENTS = [
  { id: 1, n: "Aarav M.", c: "var(--role-student)" },
  { id: 2, n: "Diya K.", c: "var(--role-parent)" },
  { id: 3, n: "Kabir S.", c: "var(--role-teacher)" },
  { id: 4, n: "Meera P.", c: "var(--role-coordinator)" },
  { id: 5, n: "Rohan T.", c: "var(--role-bv)" },
];

function App() {
  const [authed, setAuthed] = useState(false);
  const [sent, setSent] = useState(false);
  const [role, setRole] = useState("teacher");
  const [tab, setTab] = useState("feed");
  const [detail, setDetail] = useState(false);
  const [chat, setChat] = useState(false);
  const [toast, setToast] = useState("");
  const ping = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  if (!authed) {
    return (
      <div className="phone">
        <div className="login">
          <MagicLinkLogin logoSrc={OM} sent={sent} email="teacher@cmdfw.org"
            onSend={() => { if (sent) { setAuthed(true); } else { setSent(true); } }} />
        </div>
      </div>
    );
  }

  return (
    <div className="phone">
      <header className="hdr">
        <img className="hdr__om" src={OM} alt="" />
        <div className="hdr__title"><b>Bala Vihar App</b><small>{ROLES.find(r => r.id === role).name} · Brampton</small></div>
        <PersonaSwitcher activeId={role} onChange={(r) => { setRole(r); ping("Switched role — re-scoped"); }} roles={ROLES} />
      </header>

      {chat ? (
        <ChatView onBack={() => setChat(false)} onSend={() => ping("Sent")} />
      ) : (
        <>
          <div className={tab === "msg" ? "body body--flush" : "body"}>
            {tab === "feed" && <FeedTab role={role} onOpen={() => setDetail(true)} />}
            {tab === "msg" && <MessagesTab onOpen={() => setChat(true)} />}
            {tab === "reg" && <RegisterTab onSubmit={() => ping("Attendance submitted")} />}
            {tab === "bell" && <AlertsTab />}
          </div>
          <nav className="tabbar">
            <TabBtn id="feed" cur={tab} set={setTab} icon={ICON.feed} label="Feed" />
            <TabBtn id="msg" cur={tab} set={setTab} icon={ICON.msg} label="Messages" badge={4} />
            <TabBtn id="reg" cur={tab} set={setTab} icon={ICON.reg} label="Register" />
            <TabBtn id="bell" cur={tab} set={setTab} icon={ICON.bell} label="Alerts" badge={2} />
          </nav>
        </>
      )}

      {detail && <FeedDetail onClose={() => setDetail(false)} onComment={() => ping("Comment posted")} />}
      {toast && <div className="toast">{ICON.check} {toast}</div>}
    </div>
  );
}

function TabBtn({ id, cur, set, icon, label, badge }) {
  return (
    <button className={`tab ${cur === id ? "is-on" : ""}`} onClick={() => set(id)}>
      {icon}{label}{badge ? <span className="badge">{badge}</span> : null}
    </button>
  );
}

function FeedTab({ role, onOpen }) {
  const [push, setPush] = useState(true);
  return (
    <>
      <span className="eyebrow">Sunday · 14 Jun</span>
      <h1 className="scrTitle">Home feed</h1>
      <div className="stack">
        {push && <PushPermissionPrompt onEnable={() => setPush(false)} onDismiss={() => setPush(false)} />}
        <FeedCard kind="announcement" scope="org" pinned tag="Announcement"
          author={{ role: "bv", name: "BV Coordinator" }}
          title="Hanuman Chalisa Havan — 14 Jun"
          body="Registration is open for the Sunday havan. Families, please RSVP so we can honour seating and fire-code limits."
          time="2h ago" reach="240 families" comments={4} onOpen={onOpen} />
        <FeedCard kind="update" scope="class" tag="Homework"
          author={{ role: "teacher", scope: "JR·A" }}
          title="This week in Junior A"
          body="We learned the meaning of the first two verses of the Chalisa."
          homework="Help your child revise chant #1 at home."
          time="Yesterday" comments={4} onOpen={onOpen} />
        <FeedCard kind="update" scope="center"
          author={{ role: "coordinator", name: "Coordinator" }}
          title="Teacher sync moved to 6pm" body="Note the time change for this week's session sync."
          time="2 days ago" reach="12 teachers" onOpen={onOpen} />
      </div>
    </>
  );
}

function FeedDetail({ onClose, onComment }) {
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grab" />
        <div className="sheet__body">
          <FeedCard kind="update" scope="class" tag="Homework"
            author={{ role: "teacher", scope: "JR·A" }}
            title="This week in Junior A"
            body="We learned the meaning of the first two verses of the Chalisa. Aarav led the closing prayer beautifully."
            homework="Help your child revise chant #1 at home." time="Yesterday" />
          <CommentThread comments={[
            { author: { name: "Priya N.", role: "parent" }, time: "1h", body: "Thank you for the lovely update!" },
            { author: { name: "Aarav M.", role: "student" }, time: "52m", body: "I practised chant #1 today." },
            { author: { name: "Mrs. Rao", role: "teacher" }, time: "40m", isPrivate: true, body: "Aarav did wonderfully — wanted you to know privately." },
          ]}>
            <CommentComposer onSend={() => { onComment(); }} />
          </CommentThread>
        </div>
      </div>
    </div>
  );
}

function MessagesTab({ onOpen }) {
  return (
    <div className="panel" style={{ margin: 14, padding: 6 }}>
      <ConversationRow kind="group" name="Junior A — Class chat" scope="JR·A" preview="Mrs. Rao: See you all Sunday!" time="9:43" unread={3} onClick={onOpen} />
      <ConversationRow kind="dm" role="student" name="Diya K." preview="did you finish chant 1?" time="8:10" unread={1} onClick={onOpen} />
      <ConversationRow kind="dm" role="teacher" name="Mrs. Rao" preview="Great work today 🙏" time="Yest" onClick={onOpen} />
    </div>
  );
}

function ChatView({ onBack, onSend }) {
  return (
    <div className="chat">
      <div className="chat__head">
        <button className="chat__back" onClick={onBack}>{ICON.back}</button>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--indigo)", display: "grid", placeItems: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold-light)" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
        <div style={{ flex: 1 }}><b style={{ fontSize: 15 }}>Junior A — Class chat</b><div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Teacher + 18 students</div></div>
      </div>
      <div className="chat__scroll">
        <ChatBubble author="Mrs. Rao" time="9:40">Reminder: havan is this Sunday 🙏</ChatBubble>
        <ChatBubble author="Aarav M." time="9:41">Is havan at 9 or 9:30?</ChatBubble>
        <ChatBubble own time="9:43" read>9:00 sharp — please arrive by 8:45.</ChatBubble>
        <ChatBubble author="Diya K." time="9:44">Got it, thank you!</ChatBubble>
      </div>
      <MessageComposer placeholder="Message Junior A…" onSend={onSend} />
    </div>
  );
}

function RegisterTab({ onSubmit }) {
  const [marks, setMarks] = useState({ 1: "present", 5: "present" });
  const [done, setDone] = useState(false);
  const set = (id, v) => setMarks((m) => ({ ...m, [id]: m[id] === v ? undefined : v }));
  const present = Object.values(marks).filter((v) => v === "present").length;

  return (
    <>
      <span className="eyebrow">Sunday · 14 Jun · Junior A</span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h1 className="scrTitle" style={{ margin: "3px 0 0" }}>Register</h1>
        <RoleBadge role="teacher" scope="JR·A" />
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "6px 0 14px" }}>{Object.values(marks).filter(Boolean).length} of {STUDENTS.length} marked.</p>
      <div className="panel">
        {STUDENTS.map((s) => (
          <div className="student" key={s.id}>
            <span className="av" style={{ background: s.c }}>{s.n[0]}</span>
            <b>{s.n}</b>
            <div className="mk">
              <button className={`mkb p ${marks[s.id] === "present" ? "on" : ""}`} onClick={() => set(s.id, "present")}>{ICON.check}</button>
              <button className={`mkb a ${marks[s.id] === "absent" ? "on" : ""}`} onClick={() => set(s.id, "absent")}>{ICON.x}</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        {!done
          ? <Button variant="primary" fullWidth size="lg" onClick={() => { setDone(true); onSubmit(); }}>Submit attendance</Button>
          : <div className="panel" style={{ padding: 16 }}><ComplianceBar label="Attendance today" value={Math.round(present / STUDENTS.length * 100)} display={`${present}/${STUDENTS.length}`} status="success" note="Submitted · synced to your session dashboard." /></div>}
      </div>
    </>
  );
}

function AlertsTab() {
  return (
    <>
      <span className="eyebrow">Notifications</span>
      <h1 className="scrTitle">Alerts</h1>
      <div className="panel">
        <NotificationItem type="update" unread title="New update in Junior A" body="Mrs. Rao posted this week's lesson and homework." time="2h" />
        <NotificationItem type="announce" unread title="Hanuman Chalisa Havan" body="Registration is now open — RSVP by Friday." time="5h" />
        <NotificationItem type="absence" title="Absence reported" body="Kabir S. marked absent — reason attached." time="Yest" />
        <NotificationItem type="approval" title="New parent approved" body="Priya N. was added to your session." time="Yest" />
        <NotificationItem type="chat" title="Diya K. messaged you" body="did you finish chant 1?" time="2d" />
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
