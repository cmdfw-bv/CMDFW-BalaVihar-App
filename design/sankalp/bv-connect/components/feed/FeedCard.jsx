import React from "react";
import { RoleBadge } from "../../../components/core/RoleBadge.jsx";

const SCOPES = {
  org:    { label: "Org-wide", color: "var(--scope-org)" },
  center: { label: "Center",   color: "var(--scope-center)" },
  class:  { label: "Class",    color: "var(--scope-class)" },
};

const Dot = ({ c }) => <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, flexShrink: 0 }} />;
const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

/**
 * FeedCard — one item in the home feed: an announcement or a class update.
 * Header carries the author's RoleBadge + a scope pill (org / center / class)
 * and an optional pin. Footer shows time + reach + comment count.
 */
export function FeedCard({
  author = { name: "", role: "teacher", scope: "" },
  scope = "class",
  kind = "update",
  tag,
  title,
  body,
  homework,
  pinned = false,
  time = "",
  reach,
  comments,
  onOpen,
  style,
  ...rest
}) {
  const sc = SCOPES[scope] || SCOPES.class;
  const isAnnouncement = kind === "announcement";

  return (
    <article
      onClick={onOpen}
      style={{
        background: "var(--app-surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--app-rad-card)",
        boxShadow: "var(--app-shadow-row)",
        padding: 16,
        cursor: onOpen ? "pointer" : "default",
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11, flexWrap: "wrap" }}>
        <RoleBadge role={author.role} label={author.name || undefined} scope={author.scope || undefined} />
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 9px", borderRadius: "var(--app-rad-pill)",
            background: "var(--app-surface-2)", border: "1px solid var(--line)",
            fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600, color: "var(--ink-2)",
          }}
        >
          <Dot c={sc.color} />{sc.label}
        </span>
        {tag && (
          <span
            style={{
              padding: "3px 9px", borderRadius: "var(--app-rad-pill)",
              background: isAnnouncement ? "var(--primary-soft)" : "var(--success-soft)",
              color: isAnnouncement ? "var(--primary-2)" : "var(--success)",
              fontFamily: "var(--sans)", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
            }}
          >
            {tag}
          </span>
        )}
        {pinned && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, color: "var(--gold-2)", fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>
            <Icon size={13} d={<><path d="M12 17v5"/><path d="M5 9V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4l-3 3v2H8v-2L5 9z"/></>} /> Pinned
          </span>
        )}
      </div>

      {title && (
        <h3 style={{
          fontFamily: isAnnouncement ? "var(--serif)" : "var(--sans)",
          fontWeight: isAnnouncement ? 400 : 600,
          fontSize: isAnnouncement ? 20 : 16.5,
          lineHeight: 1.2, letterSpacing: isAnnouncement ? ".005em" : "0",
          color: "var(--ink)", margin: "0 0 5px",
        }}>
          {title}
        </h3>
      )}
      {body && <p style={{ fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>{body}</p>}

      {homework && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginTop: 12,
          padding: "9px 12px", borderRadius: "var(--app-rad-control)",
          background: "var(--success-soft)", border: "1px solid var(--success-line)",
          color: "var(--success)", fontFamily: "var(--sans)", fontSize: 13,
        }}>
          <Icon size={15} d={<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>} />
          <span><strong style={{ fontWeight: 600 }}>Homework:</strong> {homework}</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 13, fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-3)" }}>
        {time && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><Icon size={13} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />{time}</span>}
        {reach != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><Icon size={13} d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></>} />{reach}</span>}
        {comments != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", marginLeft: "auto", color: "var(--primary-2)", fontWeight: 600 }}><Icon size={13} d={<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>} />{comments}</span>}
      </div>
    </article>
  );
}
