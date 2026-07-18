/* global React, ReactDOM, BI */
const DS = window.ChinmayaMissionDesignSystem_52eae1;
const { RoleBadge, StatusChip, Button, StatTile } = DS;
const { useState } = React;

const ROLES = [
  { id: "teacher", name: "Teacher", color: "var(--role-teacher)", scope: "JR·A · Brampton" },
  { id: "coordinator", name: "Coordinator", color: "var(--role-coordinator)", scope: "Session · Brampton" },
  { id: "bv", name: "BV Coordinator", color: "var(--role-bv)", scope: "Org rollup" },
  { id: "parent", name: "Parent", color: "var(--role-parent)", scope: "2 children" },
];

const STUDENTS = [
  { id: 1, name: "Aarav M.", cls: "JR·A", term: "96.4%" },
  { id: 2, name: "Diya K.", cls: "JR·A", term: "92.1%" },
  { id: 3, name: "Kabir S.", cls: "JR·A", term: "78.2%" },
  { id: 4, name: "Meera P.", cls: "JR·A", term: "88.7%" },
  { id: 5, name: "Rohan T.", cls: "JR·A", term: "99.0%" },
];

function App() {
  const [role, setRole] = useState(ROLES[0]);
  const [tab, setTab] = useState("attendance");
  const [sheet, setSheet] = useState(false);

  return (
    <div className="app">
      <div className="bar">
        <img className="bar__om" src="../../assets/chinmaya-om.png" alt="Chinmaya Mission DFW" />
        <div className="bar__title">Bala Vihar App<small>{tabName(tab)}</small></div>
        <button className="rolesw" onClick={() => setSheet(true)}>
          <span className="d" style={{ background: role.color }} />{role.name}<BI.Chevron size={14} />
        </button>
      </div>

      <div className="body">
        {tab === "attendance" && <Attendance role={role} />}
        {tab === "feed" && <Feed role={role} />}
        {tab === "dashboard" && <Dashboard role={role} />}
        {tab === "admin" && <Admin role={role} />}
      </div>

      <nav className="tabbar">
        <Tab id="attendance" cur={tab} set={setTab} icon={<BI.Register />} label="Register" />
        <Tab id="feed" cur={tab} set={setTab} icon={<BI.Feed />} label="Feed" />
        <Tab id="dashboard" cur={tab} set={setTab} icon={<BI.Dash />} label="Dashboard" />
        <Tab id="admin" cur={tab} set={setTab} icon={<BI.Admin />} label="Admin" />
      </nav>

      <RoleSheet isOn={sheet} role={role} onPick={(r) => { setRole(r); setSheet(false); }} onClose={() => setSheet(false)} />
    </div>
  );
}

function tabName(t) {
  return { attendance: "Attendance register", feed: "Live feed", dashboard: "Compliance", admin: "User & role admin" }[t];
}

function Tab({ id, cur, set, icon, label }) {
  return (
    <button className={`tab ${cur === id ? "is-on" : ""}`} onClick={() => set(id)}>{icon}{label}</button>
  );
}

/* ---------- ATTENDANCE ---------- */
function Attendance({ role }) {
  const [marks, setMarks] = useState({ 1: "present", 5: "present" });
  const denied = role.id === "parent";
  const setMark = (id, v) => setMarks((m) => ({ ...m, [id]: m[id] === v ? undefined : v }));
  const markedCount = Object.values(marks).filter(Boolean).length;

  if (denied) {
    return (
      <>
        <span className="screen-eyebrow">Sunday · 14 Jun</span>
        <h1 className="screen-title">Attendance</h1>
        <div className="state">
          <div className="state__lbl">Permission denied</div>
          <p>This isn't in your scope. Your current role — <strong>Parent</strong> — can view your own children's attendance, but the class register belongs to the Teacher. The roster was never sent to this device.</p>
          <div style={{ marginTop: 6 }}><Button variant="secondary" size="sm" onClick={() => {}}>Switch active role</Button></div>
        </div>
      </>
    );
  }

  return (
    <>
      <span className="screen-eyebrow">Sunday · 14 Jun · {role.scope.split("·")[0].trim()}</span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
        <h1 className="screen-title" style={{ margin: 0 }}>Register</h1>
        <RoleBadge role={role.id} scope="JR·A" />
      </div>
      <p className="screen-sub" style={{ marginTop: 6 }}>{markedCount} of {STUDENTS.length} marked · tap present or absent for each student.</p>

      <div className="c roster">
        {STUDENTS.map((s, i) => (
          <div className="student" key={s.id}>
            <div className="avatar" style={{ background: avatarColor(i) }}>{s.name[0]}</div>
            <div className="student__main">
              <div className="student__name">{s.name}</div>
              <div className="student__meta">{s.cls} · term {s.term}</div>
            </div>
            <div className="mark">
              <button className={`markbtn present ${marks[s.id] === "present" ? "is-on" : ""}`} onClick={() => setMark(s.id, "present")} aria-label="Present"><BI.Check size={16} /></button>
              <button className={`markbtn absent ${marks[s.id] === "absent" ? "is-on" : ""}`} onClick={() => setMark(s.id, "absent")} aria-label="Absent"><BI.X size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <Button variant="primary" fullWidth size="lg">Submit attendance</Button>
      </div>

      <h3 style={statesHeading}>The five required states</h3>
      <div className="state"><div className="state__lbl">Loading</div><div className="sk" style={{ width: "62%" }} /><div className="sk" style={{ width: "44%" }} /><div className="sk" style={{ width: "76%" }} /></div>
      <div className="state"><div className="state__lbl">Empty</div><p>No attendance recorded yet. Once you submit the register, results appear here.</p></div>
      <div className="state"><div className="state__lbl">Error — data preserved</div><p>Couldn't sync the register — the connection dropped. Your marks are saved on this device.</p><div style={{ marginTop: 6 }}><Button variant="secondary" size="sm">Retry</Button></div></div>
    </>
  );
}

/* ---------- FEED ---------- */
function Feed({ role }) {
  return (
    <>
      <span className="screen-eyebrow">Live feed</span>
      <h1 className="screen-title">Announcements</h1>
      <p className="screen-sub">Org-wide and class updates scoped to your role.</p>

      <div className="c" style={{ marginBottom: 12 }}>
        <div className="ann">
          <div className="ann__top">
            <RoleBadge role="bv" />
            <StatusChip status="info">Org-wide</StatusChip>
            <span className="ann__pin">★ Pinned</span>
          </div>
          <h3 className="ann__title">Hanuman Chalisa Havan — 14 Jun</h3>
          <p className="ann__body">Registration is open for the Sunday havan. Families, please RSVP so we can honour seating and fire-code limits.</p>
          <div className="ann__foot"><span><BI.Clock /> 2h ago</span><span>reach · 240 families</span></div>
        </div>
      </div>

      <div className="c">
        <div className="ann">
          <div className="ann__top">
            <RoleBadge role="teacher" scope="JR·A" />
            <StatusChip status="present">Homework</StatusChip>
          </div>
          <h3 className="ann__title">This week in Junior A</h3>
          <p className="ann__body">We learned the meaning of the first two verses of the Chalisa. Please help your child revise chant #1 at home.</p>
          <div className="ann__foot"><span><BI.Clock /> Yesterday</span><span><BI.Comment /> 4 comments · private</span></div>
        </div>
        <div className="ann">
          <div className="ann__top">
            <RoleBadge role="coordinator" />
            <StatusChip status="soon">Reminder</StatusChip>
          </div>
          <h3 className="ann__title">Teacher sync moved to 6pm</h3>
          <p className="ann__body">Note the time change for this week's session sync. Agenda in the shared sheet.</p>
          <div className="ann__foot"><span><BI.Clock /> 2 days ago</span></div>
        </div>
      </div>
    </>
  );
}

/* ---------- DASHBOARD ---------- */
function Dashboard({ role }) {
  const org = role.id === "bv";
  return (
    <>
      <span className="screen-eyebrow">{org ? "Org rollup" : "Session"} · 14 Jun</span>
      <h1 className="screen-title">{org ? "Compliance" : "My class"}</h1>
      <p className="screen-sub">{org ? "Single-center rollup for the pilot — honest placeholders where data is absent." : "Junior A attendance & update tracking."}</p>

      <div className="statgrid">
        <div className="statcard"><StatTile label="Attendance today" value="94.2%" accent /></div>
        <div className="statcard"><StatTile label="Marked / enrolled" value="47/50" /></div>
        <div className="statcard"><StatTile label="Updates posted" value="5/6" /></div>
        <div className="statcard"><StatTile label="Absence alerts" value="2" /></div>
      </div>

      <div className="c c--pad" style={{ marginBottom: 12 }}>
        <div className="metric__head">
          <span className="metric__label">Update compliance</span>
          <span className="metric__pct">83%</span>
        </div>
        <div className="bar-track"><div className="bar-fill" style={{ width: "83%" }} /></div>
        <p className="metric__note">5 of 6 classes posted a weekly update.</p>
      </div>

      {org && (
        <div className="c c--pad">
          <strong style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 19 }}>Other centers</strong>
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "8px 0 0" }}>
            <span style={{ fontFamily: "var(--mono)", color: "var(--ink-4)" }}>—</span> No other centers in the pilot yet. Rollup is honest about absent data rather than inventing figures.
          </p>
        </div>
      )}
    </>
  );
}

/* ---------- ADMIN ---------- */
function Admin() {
  const people = [
    { name: "Priya N.", roles: ["teacher", "parent"], scope: "JR·A · 1 child" },
    { name: "Anil R.", roles: ["coordinator"], scope: "Session" },
    { name: "Sunita V.", roles: ["bv"], scope: "Org" },
  ];
  return (
    <>
      <span className="screen-eyebrow">Admin</span>
      <h1 className="screen-title">Users &amp; roles</h1>
      <p className="screen-sub">Assign role + scope. Access to minors' records is written to the audit log.</p>

      <div className="c">
        {people.map((p, i) => (
          <div className="student" key={i}>
            <div className="avatar" style={{ background: avatarColor(i + 2) }}>{p.name[0]}</div>
            <div className="student__main">
              <div className="student__name">{p.name}</div>
              <div className="student__meta">{p.scope}</div>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
              {p.roles.map((r) => <RoleBadge key={r} role={r} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="state" style={{ marginTop: 14 }}>
        <div className="state__lbl">Audit log · minor access</div>
        <p style={{ fontFamily: "var(--mono)", fontSize: 11.5, lineHeight: 1.7, color: "var(--ink-3)" }}>
          2026-06-14 09:02 · teacher:JR·A opened student #3<br />
          2026-06-14 09:00 · coordinator viewed session rollup
        </p>
      </div>
    </>
  );
}

function RoleSheet({ isOn, role, onPick, onClose }) {
  return (
    <div className={`sheet ${isOn ? "is-on" : ""}`} onClick={onClose}>
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grab" />
        <p className="sheet__lbl">Switch active role — re-scopes your data</p>
        {ROLES.map((r) => (
          <button key={r.id} className={`roleopt ${r.id === role.id ? "is-on" : ""}`} onClick={() => onPick(r)}>
            <span className="d" style={{ background: r.color }} />
            <span style={{ flex: 1 }}><strong>{r.name}</strong><span>{r.scope}</span></span>
            {r.id === role.id && <BI.Check size={16} />}
          </button>
        ))}
      </div>
    </div>
  );
}

const avatarColor = (i) => ["var(--role-student)", "var(--role-parent)", "var(--role-teacher)", "var(--role-coordinator)", "var(--role-bv)", "var(--primary)"][i % 6];
const statesHeading = { fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-4)", margin: "26px 0 12px", fontWeight: 500 };

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
