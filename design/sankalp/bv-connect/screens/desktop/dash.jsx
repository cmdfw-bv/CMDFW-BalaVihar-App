/* global React, ReactDOM */
const DS = window.ChinmayaMissionDesignSystem_52eae1;
const { StatTile, ComplianceBar, CenterRollupRow, UserRoleRow, AuditEntry, PersonaSwitcher, Button } = DS;
const { useState } = React;
const OM = "../../../assets/chinmaya-om.png";

const ROLES = [
  { id: "bv", name: "BV Coordinator", role: "bv", scope: "Org rollup" },
  { id: "coordinator", name: "Coordinator", role: "coordinator", scope: "Session · Brampton" },
  { id: "admin", name: "Admin", role: "admin", scope: "Org" },
];

const ic = (d) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const NAV = [
  { id: "overview", label: "Overview", icon: ic(<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>) },
  { id: "attendance", label: "Attendance", icon: ic(<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>) },
  { id: "people", label: "People & roles", icon: ic(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></>) },
  { id: "audit", label: "Audit log", icon: ic(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></>) },
];

function Dash() {
  const [role, setRole] = useState("bv");
  const [nav, setNav] = useState("overview");
  const org = role === "bv";

  return (
    <div className="shell">
      <aside className="side">
        <div className="side__logo">
          <img src={OM} alt="" />
          <div><b>Bala Vihar App</b><small>CMDFW</small></div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.id} className={nav === n.id ? "on" : ""} onClick={() => setNav(n.id)}>{n.icon}{n.label}</a>
          ))}
        </nav>
        <div className="side__foot">
          <PersonaSwitcher activeId={role} onChange={setRole} roles={ROLES} style={{ width: "100%", justifyContent: "flex-start" }} />
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <span className="eyebrow">{org ? "Org rollup" : "Session"} · Sunday 14 Jun</span>
            <h1>{org ? "Compliance overview" : "Junior session"}</h1>
            <p>{org ? "Cross-center rollup — honest placeholders where a center isn't in the pilot." : "Brampton · 6 classes · live attendance & update tracking."}</p>
          </div>
          <Button variant="secondary" size="md">Export report</Button>
        </div>

        <div className="statrow">
          <div className="statcell"><StatTile label="Attendance today" value="94.2%" accent /></div>
          <div className="statcell"><StatTile label="Marked / enrolled" value="47/50" /></div>
          <div className="statcell"><StatTile label="Updates posted" value="5/6" /></div>
          <div className="statcell"><StatTile label="Absence alerts" value="2" /></div>
        </div>

        <div className="grid">
          <div className="colstack">
            <div className="card">
              <div className="card__h"><h2>Compliance</h2><span className="meta">This week</span></div>
              <div className="card__pad">
                <ComplianceBar label="Attendance today" value={94} display="47/50" status="success" note="Junior A + 5 classes · marked by 9:15am." />
                <ComplianceBar label="Update compliance" value={83} note="5 of 6 classes posted a weekly update." />
                <ComplianceBar label="Consent on file" value={68} status="warning" note="34 of 50 families have submitted parental consent." />
              </div>
            </div>
            <div className="card">
              <div className="card__h"><h2>Per-center rollup</h2><span className="meta">{org ? "4 centers" : "1 session"}</span></div>
              <CenterRollupRow name="Brampton" region="Session · JR + SR · 50 enrolled" attendance={94} marked={47} enrolled={50} onClick={() => {}} />
              {org && <>
                <CenterRollupRow name="Mississauga" region="Not in pilot yet" placeholder />
                <CenterRollupRow name="Scarborough" region="Not in pilot yet" placeholder />
                <CenterRollupRow name="Markham" region="Not in pilot yet" placeholder />
              </>}
            </div>
          </div>

          <div className="colstack">
            <div className="card">
              <div className="card__h"><h2>Pending approvals</h2><span className="meta">2</span></div>
              <UserRoleRow name="New parent" email="priya.new@example.com" status="pending" roles={["parent"]} onApprove={() => {}} onReject={() => {}} />
              <UserRoleRow name="Assistant teacher" email="asst@example.com" scope="JR·A" status="pending" roles={[{ role: "teacher", scope: "JR·A" }]} onApprove={() => {}} onReject={() => {}} />
              <UserRoleRow name="Priya N." email="priya@example.com" scope="JR·A" roles={[{ role: "teacher", scope: "JR·A" }, { role: "parent" }]} onManage={() => {}} />
            </div>
            <div className="card">
              <div className="auditwrap">
                <h4>Audit log · minor access</h4>
                <AuditEntry time="09:05" actor="admin" action="export" target="JR·A roster (CSV)" />
                <AuditEntry time="09:02" actor="teacher:JR·A" action="view" target="student #3 record" />
                <AuditEntry time="09:00" actor="coordinator" action="view" target="session rollup" />
                <AuditEntry time="08:51" actor="bv" action="view" target="org compliance" />
                <AuditEntry time="08:40" actor="admin" action="edit" target="parent consent #18" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Dash />);
