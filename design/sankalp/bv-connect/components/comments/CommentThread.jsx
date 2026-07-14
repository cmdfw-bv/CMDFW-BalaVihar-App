import React from "react";
import { Comment } from "./Comment.jsx";

/**
 * CommentThread — a list of Comments under a feed item, with a count
 * header and an optional composer rendered as children at the bottom.
 */
export function CommentThread({ count, comments = [], children, style, ...rest }) {
  const n = count ?? comments.length;
  return (
    <section style={{ ...style }} {...rest}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 8px", borderBottom: "1px solid var(--line)" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <strong style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>
          {n} {n === 1 ? "comment" : "comments"}
        </strong>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
        {comments.map((c, i) => <Comment key={i} {...c} />)}
      </div>
      {children}
    </section>
  );
}
