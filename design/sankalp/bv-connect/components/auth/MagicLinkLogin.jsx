import React from "react";
import { Logo } from "../../../components/brand/Logo.jsx";

/**
 * MagicLinkLogin — passwordless sign-in. One email field → "send magic
 * link", then a confirmation state. No minor self-registration: accounts
 * are provisioned, so there is no sign-up path here by design.
 */
export function MagicLinkLogin({ logoSrc = "assets/chinmaya-om.png", appName = "Bala Vihar App", sent = false, email: emailProp = "", onSend, style, ...rest }) {
  const [email, setEmail] = React.useState(emailProp);
  const submit = (e) => { e.preventDefault(); if (email.trim() && onSend) onSend(email); };

  return (
    <div style={{ width: "100%", maxWidth: 360, margin: "0 auto", textAlign: "center", fontFamily: "var(--sans)", ...style }} {...rest}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
        <Logo src={logoSrc} size={44} title={appName} tagline="CMDFW · Dallas–Fort Worth" />
      </div>

      {!sent ? (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ textAlign: "left" }}>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 26, color: "var(--ink)", margin: "0 0 6px", letterSpacing: ".005em" }}>Sign in</h1>
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.5, margin: 0 }}>Enter the email your coordinator has on file. We'll send a secure sign-in link — no password needed.</p>
          </div>
          <input
            type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", background: "var(--app-surface)", border: "1px solid var(--line-2)", borderRadius: "var(--app-rad-control)", padding: "14px 16px", fontFamily: "var(--sans)", fontSize: 15.5, color: "var(--ink)", outline: "none", minHeight: 48 }}
          />
          <button type="submit" style={{ width: "100%", minHeight: 48, border: 0, cursor: "pointer", borderRadius: "var(--app-rad-pill)", background: "var(--primary)", color: "#fff", fontFamily: "var(--sans)", fontSize: 15, fontWeight: 600 }}>
            Send magic link
          </button>
          <p style={{ fontSize: 12, color: "var(--ink-4)", lineHeight: 1.5, margin: "2px 0 0" }}>
            Accounts are set up by your center. There's no public sign-up — students never self-register.
          </p>
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--success-soft)", color: "var(--success)", display: "grid", placeItems: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
          </span>
          <div>
            <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 24, color: "var(--ink)", margin: "0 0 6px" }}>Check your email</h1>
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.5, margin: 0 }}>
              We sent a sign-in link to <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{email || "your inbox"}</strong>. It expires in 15 minutes.
            </p>
          </div>
          <button onClick={() => onSend && onSend(email)} style={{ border: 0, background: "transparent", color: "var(--primary-2)", fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Resend link
          </button>
        </div>
      )}
    </div>
  );
}
