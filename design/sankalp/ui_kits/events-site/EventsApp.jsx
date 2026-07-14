/* global React, ReactDOM, I, EVENTS */
const DS = window.ChinmayaMissionDesignSystem_52eae1;
const { Button, StatusChip, Logo, EventDateBlock, StatTile, SegmentedTabs } = DS;
const { useState } = React;
const OM = "../../assets/chinmaya-om.png";
const GURUDEV = "../../assets/gurudev.jpg";

function App() {
  const [tab, setTab] = useState("upcoming");
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState("");

  const featured = EVENTS.find((e) => e.featured) || EVENTS[0];
  const upcoming = EVENTS.filter((e) => e.status !== "past");
  const past = EVENTS.filter((e) => e.status === "past");
  const visible = tab === "upcoming" ? upcoming : tab === "past" ? past : EVENTS;

  const ping = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  return (
    <div className="shell">
      <Nav onRegister={() => setDrawer(true)} />
      <main>
        <Hero featured={featured} onRegister={() => setDrawer(true)} />
        <EventsList
          events={visible} tab={tab} setTab={setTab}
          counts={{ upcoming: upcoming.length, past: past.length, all: EVENTS.length }}
          onRegister={() => setDrawer(true)}
        />
        <Welcome />
        <Notify onDone={() => ping("Subscribed — we'll be in touch")} />
      </main>
      <Footer />
      <Drawer isOn={drawer} onClose={() => setDrawer(false)} onPick={() => { setDrawer(false); ping("Opening registration…"); }} />
      <div className={`toast ${toast ? "is-on" : ""}`}><I.Check /> {toast}</div>
    </div>
  );
}

function Nav({ onRegister }) {
  return (
    <nav className="nav">
      <div className="nav__in">
        <Logo src={OM} size={34} />
        <div className="nav__links">
          <a href="#events">Upcoming</a>
          <a href="#about">About</a>
          <a href="#notify">Notify me</a>
        </div>
        <button className="nav__menu" aria-label="Menu" style={iconBtn}><I.Menu /></button>
        <div style={{ marginLeft: "auto" }} className="nav__cta-wrap">
          <Button variant="primary" size="sm" iconRight={<I.Arrow size={14} />} onClick={onRegister}>Register</Button>
        </div>
      </div>
    </nav>
  );
}

function Hero({ featured, onRegister }) {
  return (
    <section className="hero">
      <div className="wrap hero__in">
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <p className="hero__greet">Hari Om · Welcome</p>
          <h1 className="hero__title">Sacred gatherings, <em>satsangs &amp; havans</em>.</h1>
          <p className="hero__lede">
            Register for the season's upcoming events at Chinmaya Mission. Every gathering is
            prepared with care — from seating and prasad to the sacred protocols that hold the room.
          </p>
          <div className="hero__stats">
            <StatTile label="This season" value="3 events" display />
            <StatTile label="Open now" value="2 open" display accent />
            <StatTile label="Next gathering" value="Jun 14" display />
          </div>
        </div>
        <FeaturedCard event={featured} onRegister={onRegister} />
      </div>
    </section>
  );
}

function Poster({ poster }) {
  return (
    <div className={`poster poster--${poster || "default"}`}>
      <div className="poster__om"><img src={OM} alt="" /></div>
    </div>
  );
}

function FeaturedCard({ event, onRegister }) {
  return (
    <div className="feat">
      <Poster poster={event.poster} />
      <div className="feat__scrim" />
      <div className="feat__top">
        <StatusChip status="featured">Featured event</StatusChip>
        <span className="feat__counter">{event.spotsLeft} spots · {event.capacity} cap</span>
      </div>
      <div className="feat__bottom">
        <span className="feat__kicker">{event.weekday} · {event.day} {event.month} {event.year}</span>
        <h2 className="feat__name">{event.name} <em>{event.italic}</em></h2>
        <p className="feat__when">{event.time}</p>
        <div className="feat__actions">
          <Button variant="gold" size="lg" iconRight={<I.Arrow size={15} />} onClick={onRegister}>Register now</Button>
          <Button variant="outline" size="lg" onClick={onRegister}>Event details</Button>
        </div>
      </div>
    </div>
  );
}

function EventsList({ events, tab, setTab, counts, onRegister }) {
  return (
    <section className="elist" id="events">
      <div className="wrap">
        <div className="elist__head">
          <h2 className="elist__title">All <em>events</em></h2>
          <SegmentedTabs
            value={tab} onChange={setTab}
            tabs={[
              { id: "upcoming", label: "Upcoming", count: counts.upcoming },
              { id: "past", label: "Past", count: counts.past },
              { id: "all", label: "All", count: counts.all },
            ]}
          />
        </div>
        {events.length === 0 ? (
          <div style={{ padding: "56px 0", textAlign: "center", color: "var(--ink-3)", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 22 }}>
            Nothing to show here yet.
          </div>
        ) : events.map((ev) => <EventRow key={ev.id} event={ev} onRegister={onRegister} />)}
      </div>
    </section>
  );
}

function EventRow({ event, onRegister }) {
  return (
    <div className={`erow ${event.status === "past" ? "is-past" : ""}`}>
      <EventDateBlock day={event.day} month={event.month} year={event.year} />
      <div className="erow__body">
        <div className="erow__chips">
          <StatusChip status={event.status === "open" ? "open" : event.status === "past" ? "past" : "soon"}>
            {event.statusLabel}
          </StatusChip>
          {event.featured && <StatusChip status="featured">Featured</StatusChip>}
        </div>
        <h3 className="erow__name">{event.name} <em>{event.italic}</em></h3>
        <p className="erow__sub">{event.sub}</p>
      </div>
      <div className="erow__meta">
        <div className="erow__meta-line"><I.Clock size={15} /> {event.weekday}, {event.time}</div>
        <div className="erow__meta-line"><I.Pin size={15} /> {event.location}</div>
      </div>
      <div className="erow__actions">
        {event.status === "open" && <Button variant="primary" size="sm" iconRight={<I.Arrow size={14} />} onClick={onRegister}>Register</Button>}
        {event.status === "past" && <Button variant="ghost" size="sm" onClick={onRegister}>View recap</Button>}
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <section className="welcome" id="about">
      <div className="wrap welcome__in">
        <div className="welcome__portrait"><img src={GURUDEV} alt="Pujya Gurudev Swami Chinmayananda" /></div>
        <div>
          <p className="welcome__greet"><img src={OM} alt="" /> Hari Om!</p>
          <h2 className="welcome__title">A note from the <em>Events Team</em></h2>
          <div className="welcome__body">
            <p>
              We are grateful that you are joining us for our special events, satsangs, and sacred
              gatherings. As our Chinmaya Mission family continues to grow, we strive to welcome every
              participant with love, respect, and the spirit of dedicated service.
            </p>
            <p>
              Advance registration helps us prepare each gathering with the care it deserves — seating,
              prasad and capacity — and lets us plan responsibly for all devotees in line with safety
              guidelines.
            </p>
          </div>
          <div className="welcome__sign">
            <img src={OM} alt="" />
            <div>With Prem and Om,<strong>The Events Team</strong></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Notify({ onDone }) {
  const [email, setEmail] = useState("");
  const submit = (e) => { e.preventDefault(); if (email.trim()) { onDone(); setEmail(""); } };
  return (
    <section className="notify" id="notify">
      <div className="wrap notify__in">
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--gold-light)" }}>Stay in the loop</span>
          <h2 className="notify__title">Be the first to know when new <em>satsangs</em> open.</h2>
          <p className="notify__lede">Two or three notes a season — never a flood. Festival dates, registration windows, and occasional invitations.</p>
        </div>
        <div>
          <form className="notify__form" onSubmit={submit}>
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
            <Button variant="gold" type="submit" iconRight={<I.Arrow size={14} />}>Notify me</Button>
          </form>
          <p className="notify__small">By subscribing you agree to receive occasional emails. Unsubscribe any time.</p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer__in">
        <Logo src={OM} size={52} tagline="Events & Satsangs · est. 1982" />
        <div className="footer__contact">
          <a href="mailto:events@chinmaya.org"><I.Mail /> events@chinmaya.org</a>
          <a href="tel:+10000000000"><I.Phone /> (000) 000-0000</a>
        </div>
        <p className="footer__bless"><img src={OM} alt="" /> May all beings be happy.</p>
      </div>
    </footer>
  );
}

function Drawer({ isOn, onClose, onPick }) {
  return (
    <div className={`drawer ${isOn ? "is-on" : ""}`} onClick={onClose}>
      <aside className="drawer__panel" onClick={(e) => e.stopPropagation()}>
        <header className="drawer__head">
          <Logo src={OM} size={32} wordmark={false} />
          <h2>Register for an <em>event</em></h2>
          <button className="drawer__close" onClick={onClose} aria-label="Close"><I.X /></button>
        </header>
        <div className="drawer__body">
          <p className="drawer__intro">Hari Om! Pick an event to continue with details and registration.</p>
          {EVENTS.map((ev) => (
            <button key={ev.id} className="regcard" disabled={ev.status === "past"} onClick={onPick}>
              <span className="regcard__date"><strong>{ev.day}</strong><span>{ev.month}</span></span>
              <span>
                <span className="regcard__name">{ev.name} <em>{ev.italic}</em></span>
                <span className="regcard__meta"><span><I.Clock size={12} /> {ev.weekday}</span><span><I.Pin size={12} /> {ev.location.split("·")[0].trim()}</span></span>
              </span>
              {ev.status === "open" ? <I.Arrow size={18} /> : <span className="regcard__closed">Closed</span>}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

const iconBtn = { width: 40, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer" };

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
