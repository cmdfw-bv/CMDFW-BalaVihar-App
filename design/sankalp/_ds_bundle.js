/* @ds-bundle: {"format":3,"namespace":"ChinmayaMissionDesignSystem_52eae1","components":[{"name":"CsvImport","sourcePath":"bv-connect/components/admin/CsvImport.jsx"},{"name":"UserRoleRow","sourcePath":"bv-connect/components/admin/UserRoleRow.jsx"},{"name":"MagicLinkLogin","sourcePath":"bv-connect/components/auth/MagicLinkLogin.jsx"},{"name":"ChatBubble","sourcePath":"bv-connect/components/chat/ChatBubble.jsx"},{"name":"ConversationRow","sourcePath":"bv-connect/components/chat/ConversationRow.jsx"},{"name":"MessageComposer","sourcePath":"bv-connect/components/chat/MessageComposer.jsx"},{"name":"Comment","sourcePath":"bv-connect/components/comments/Comment.jsx"},{"name":"CommentComposer","sourcePath":"bv-connect/components/comments/CommentComposer.jsx"},{"name":"CommentThread","sourcePath":"bv-connect/components/comments/CommentThread.jsx"},{"name":"CenterRollupRow","sourcePath":"bv-connect/components/dashboard/CenterRollupRow.jsx"},{"name":"ComplianceBar","sourcePath":"bv-connect/components/dashboard/ComplianceBar.jsx"},{"name":"FeedCard","sourcePath":"bv-connect/components/feed/FeedCard.jsx"},{"name":"PersonaSwitcher","sourcePath":"bv-connect/components/navigation/PersonaSwitcher.jsx"},{"name":"NotificationItem","sourcePath":"bv-connect/components/notifications/NotificationItem.jsx"},{"name":"PushPermissionPrompt","sourcePath":"bv-connect/components/notifications/PushPermissionPrompt.jsx"},{"name":"AuditEntry","sourcePath":"bv-connect/components/privacy/AuditEntry.jsx"},{"name":"ConsentCapture","sourcePath":"bv-connect/components/privacy/ConsentCapture.jsx"},{"name":"EventDateBlock","sourcePath":"components/brand/EventDateBlock.jsx"},{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Field","sourcePath":"components/core/Field.jsx"},{"name":"RoleBadge","sourcePath":"components/core/RoleBadge.jsx"},{"name":"SegmentedTabs","sourcePath":"components/core/SegmentedTabs.jsx"},{"name":"StatTile","sourcePath":"components/core/StatTile.jsx"},{"name":"StatusChip","sourcePath":"components/core/StatusChip.jsx"},{"name":"Stepper","sourcePath":"components/core/Stepper.jsx"}],"sourceHashes":{"bv-connect/components/admin/CsvImport.jsx":"a15ea77932b8","bv-connect/components/admin/UserRoleRow.jsx":"701962d5a8fb","bv-connect/components/auth/MagicLinkLogin.jsx":"946d739c8cd4","bv-connect/components/chat/ChatBubble.jsx":"bee42951b82a","bv-connect/components/chat/ConversationRow.jsx":"44e4d2bda797","bv-connect/components/chat/MessageComposer.jsx":"cbea5b6fb324","bv-connect/components/comments/Comment.jsx":"58c10eba1c7d","bv-connect/components/comments/CommentComposer.jsx":"0104b3834281","bv-connect/components/comments/CommentThread.jsx":"bfed6e087665","bv-connect/components/dashboard/CenterRollupRow.jsx":"19cfa5ecae1d","bv-connect/components/dashboard/ComplianceBar.jsx":"60a220be6aaf","bv-connect/components/feed/FeedCard.jsx":"8ee33e57bc72","bv-connect/components/navigation/PersonaSwitcher.jsx":"2ac2b531a447","bv-connect/components/notifications/NotificationItem.jsx":"cb8d4efc04dd","bv-connect/components/notifications/PushPermissionPrompt.jsx":"b515163ae42d","bv-connect/components/privacy/AuditEntry.jsx":"5125e054d7a1","bv-connect/components/privacy/ConsentCapture.jsx":"c8e1ecca20bd","bv-connect/screens/desktop/dash.jsx":"67c43ebb69b8","bv-connect/screens/phone/app.jsx":"9e140bfb1682","components/brand/EventDateBlock.jsx":"97042fb81c08","components/brand/Logo.jsx":"aa8877b37c5c","components/core/Button.jsx":"0d5bf3f460a8","components/core/Card.jsx":"116e2cea5958","components/core/Field.jsx":"b93d94cb9fb3","components/core/RoleBadge.jsx":"9d36a824daac","components/core/SegmentedTabs.jsx":"5e90695f1181","components/core/StatTile.jsx":"327db96013a0","components/core/StatusChip.jsx":"ce01c46ac48a","components/core/Stepper.jsx":"2531d9e57c7c","ui_kits/events-site/EventsApp.jsx":"d663a5dbb10a","ui_kits/events-site/data.jsx":"50ab05e6b8be","ui_kits/events-site/icons.jsx":"e28f18e16e00"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ChinmayaMissionDesignSystem_52eae1 = window.ChinmayaMissionDesignSystem_52eae1 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// bv-connect/components/admin/CsvImport.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * CsvImport — enrollment import control. A dropzone before a file is
 * chosen; a parsed summary (rows ready / flagged) after. The POC baseline
 * is CSV; this is the seam where an API sync would later plug in.
 */
function CsvImport({
  fileName,
  total,
  ready,
  flagged = 0,
  onChoose,
  onConfirm,
  style,
  ...rest
}) {
  const parsed = fileName != null;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontFamily: "var(--sans)",
      ...style
    }
  }, rest), !parsed ? /*#__PURE__*/React.createElement("button", {
    onClick: onChoose,
    style: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      padding: "30px 20px",
      cursor: "pointer",
      background: "var(--app-surface-2)",
      border: "1.5px dashed var(--line-2)",
      borderRadius: "var(--app-rad-card)",
      color: "var(--ink-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 46,
      height: 46,
      borderRadius: "50%",
      background: "var(--app-surface)",
      border: "1px solid var(--line)",
      display: "grid",
      placeItems: "center",
      color: "var(--primary)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 8l-5-5-5 5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3v12"
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, "Upload enrollment CSV"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--ink-3)",
      textAlign: "center",
      lineHeight: 1.5
    }
  }, "One row per student \xB7 columns: name, family ID, class, parent email.")) : /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--app-surface)",
      border: "1px solid var(--line)",
      borderRadius: "var(--app-rad-card)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "13px 15px",
      borderBottom: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      borderRadius: "var(--app-rad-control)",
      background: "var(--success-soft)",
      color: "var(--success)",
      display: "grid",
      placeItems: "center",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 2v6h6"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      fontWeight: 600,
      color: "var(--ink)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, fileName), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--ink-4)"
    }
  }, total, " rows parsed")), /*#__PURE__*/React.createElement("button", {
    onClick: onChoose,
    style: {
      border: "1px solid var(--line-2)",
      background: "transparent",
      borderRadius: "var(--app-rad-pill)",
      padding: "6px 12px",
      fontSize: 12,
      fontWeight: 600,
      color: "var(--ink-2)",
      cursor: "pointer"
    }
  }, "Replace")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: "13px 15px",
      textAlign: "center",
      borderRight: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 22,
      fontWeight: 500,
      color: "var(--success)",
      fontVariantNumeric: "tabular-nums"
    }
  }, ready), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: ".1em",
      textTransform: "uppercase",
      color: "var(--ink-4)",
      marginTop: 2
    }
  }, "Ready")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: "13px 15px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 22,
      fontWeight: 500,
      color: flagged ? "var(--danger)" : "var(--ink-4)",
      fontVariantNumeric: "tabular-nums"
    }
  }, flagged), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: ".1em",
      textTransform: "uppercase",
      color: "var(--ink-4)",
      marginTop: 2
    }
  }, "Flagged"))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12,
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onConfirm,
    style: {
      width: "100%",
      minHeight: 46,
      border: 0,
      borderRadius: "var(--app-rad-pill)",
      background: "var(--primary)",
      color: "#fff",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "Import ", ready, " students"))));
}
Object.assign(__ds_scope, { CsvImport });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/admin/CsvImport.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/chat/ChatBubble.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * ChatBubble — one message in a class group chat or a student DM.
 * Outgoing (own) bubbles fill terracotta and align right; incoming align
 * left with the sender name above (group chats). A read tick is optional.
 */
function ChatBubble({
  own = false,
  author,
  time = "",
  read,
  showName = !own,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: own ? "flex-end" : "flex-start",
      gap: 3,
      ...style
    }
  }, rest), showName && author && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 11,
      fontWeight: 600,
      color: "var(--ink-3)",
      padding: "0 4px",
      whiteSpace: "nowrap"
    }
  }, author), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "78%",
      background: own ? "var(--chat-out)" : "var(--chat-in)",
      color: own ? "var(--chat-out-ink)" : "var(--chat-in-ink)",
      border: own ? "0" : "1px solid var(--chat-in-line)",
      borderRadius: "var(--app-rad-bubble)",
      borderBottomRightRadius: own ? 5 : "var(--app-rad-bubble)",
      borderBottomLeftRadius: own ? "var(--app-rad-bubble)" : 5,
      padding: "9px 13px",
      fontFamily: "var(--sans)",
      fontSize: 14.5,
      lineHeight: 1.45,
      boxShadow: own ? "none" : "var(--app-shadow-row)"
    }
  }, children), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontFamily: "var(--sans)",
      fontSize: 10.5,
      color: "var(--ink-4)",
      padding: "0 4px"
    }
  }, time, own && read != null && /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: read ? "var(--info)" : "var(--ink-4)",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 13l4 4L13 7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11 13l4 4L23 7"
  }))));
}
Object.assign(__ds_scope, { ChatBubble });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/chat/ChatBubble.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/chat/ConversationRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ROLE_HUE = {
  student: "var(--role-student)",
  parent: "var(--role-parent)",
  teacher: "var(--role-teacher)",
  coordinator: "var(--role-coordinator)",
  bv: "var(--role-bv)",
  admin: "var(--role-admin)"
};

/**
 * ConversationRow — a row in the messages list: a class group chat or a
 * 1:1 student DM. Shows avatar (or group glyph), name, last message,
 * time, and an unread count. `kind="group"` renders a class-chat glyph.
 */
function ConversationRow({
  name,
  preview,
  time = "",
  unread = 0,
  kind = "dm",
  role = "student",
  scope,
  active = false,
  onClick,
  style,
  ...rest
}) {
  const hue = ROLE_HUE[role] || "var(--ink-3)";
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      width: "100%",
      textAlign: "left",
      padding: "11px 12px",
      border: 0,
      cursor: "pointer",
      background: active ? "var(--app-surface-2)" : "transparent",
      borderRadius: "var(--app-rad-control)",
      fontFamily: "var(--sans)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 44,
      flexShrink: 0,
      borderRadius: "50%",
      background: kind === "group" ? "var(--indigo)" : hue,
      color: "#fff",
      display: "grid",
      placeItems: "center"
    }
  }, kind === "group" ? /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--gold-light)",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M23 21v-2a4 4 0 0 0-3-3.87"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 3.13a4 4 0 0 1 0 7.75"
  })) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: 17
    }
  }, (name || "?").trim().charAt(0))), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: "var(--ink)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, name), scope && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 10,
      color: "var(--ink-4)",
      flexShrink: 0
    }
  }, scope), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontSize: 11,
      color: "var(--ink-4)",
      flexShrink: 0
    }
  }, time)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 13,
      color: unread ? "var(--ink-2)" : "var(--ink-3)",
      fontWeight: unread ? 600 : 400,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, preview), unread > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      minWidth: 20,
      height: 20,
      padding: "0 6px",
      borderRadius: "var(--app-rad-pill)",
      background: "var(--chat-unread)",
      color: "#fff",
      fontSize: 11,
      fontWeight: 700,
      display: "grid",
      placeItems: "center",
      fontVariantNumeric: "tabular-nums"
    }
  }, unread))));
}
Object.assign(__ds_scope, { ConversationRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/chat/ConversationRow.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/chat/MessageComposer.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * MessageComposer — the chat input bar: text field + send button. Optional
 * attach affordance. Submits on Enter (Shift+Enter for newline).
 */
function MessageComposer({
  placeholder = "Message…",
  onSend,
  allowAttach = false,
  style,
  ...rest
}) {
  const [value, setValue] = React.useState("");
  const send = () => {
    if (value.trim() && onSend) onSend(value);
    setValue("");
  };
  const onKey = e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };
  const icon = (size, d) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, d);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "flex-end",
      gap: 8,
      padding: 10,
      background: "var(--app-surface)",
      borderTop: "1px solid var(--line)",
      ...style
    }
  }, rest), allowAttach && /*#__PURE__*/React.createElement("button", {
    "aria-label": "Attach",
    style: {
      width: 40,
      height: 40,
      flexShrink: 0,
      borderRadius: "50%",
      border: "1px solid var(--line-2)",
      background: "var(--app-surface)",
      color: "var(--ink-3)",
      display: "grid",
      placeItems: "center",
      cursor: "pointer"
    }
  }, icon(18, /*#__PURE__*/React.createElement("path", {
    d: "M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      alignItems: "flex-end",
      background: "var(--app-surface-2)",
      border: "1px solid var(--line)",
      borderRadius: "var(--app-rad-bubble)"
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    rows: 1,
    value: value,
    placeholder: placeholder,
    onChange: e => setValue(e.target.value),
    onKeyDown: onKey,
    style: {
      flex: 1,
      border: 0,
      background: "transparent",
      resize: "none",
      outline: "none",
      fontFamily: "var(--sans)",
      fontSize: 15,
      color: "var(--ink)",
      padding: "11px 14px",
      minHeight: 22,
      lineHeight: 1.4,
      maxHeight: 120
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: send,
    "aria-label": "Send",
    style: {
      width: 44,
      height: 44,
      flexShrink: 0,
      borderRadius: "50%",
      border: 0,
      cursor: "pointer",
      background: value.trim() ? "var(--primary)" : "var(--line-2)",
      color: "#fff",
      display: "grid",
      placeItems: "center",
      transition: "background .15s"
    }
  }, icon(18, /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M22 2 11 13"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 2 15 22l-4-9-9-4 20-7z"
  })))));
}
Object.assign(__ds_scope, { MessageComposer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/chat/MessageComposer.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/comments/Comment.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ROLE_HUE = {
  student: "var(--role-student)",
  parent: "var(--role-parent)",
  teacher: "var(--role-teacher)",
  coordinator: "var(--role-coordinator)",
  bv: "var(--role-bv)",
  admin: "var(--role-admin)"
};

/**
 * Comment — a single comment in a thread. Public by default; a `private`
 * comment (teacher ↔ one parent) is tinted and carries a lock so the
 * visibility is never ambiguous.
 */
function Comment({
  author = {
    name: "",
    role: "parent"
  },
  time = "",
  body,
  isPrivate = false,
  style,
  ...rest
}) {
  const hue = ROLE_HUE[author.role] || "var(--ink-3)";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      gap: 11,
      padding: isPrivate ? "11px 12px" : "11px 2px",
      borderRadius: isPrivate ? "var(--app-rad-control)" : 0,
      background: isPrivate ? "var(--private-soft)" : "transparent",
      border: isPrivate ? "1px solid var(--private-line)" : "0",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      borderRadius: "50%",
      flexShrink: 0,
      background: hue,
      color: "#fff",
      display: "grid",
      placeItems: "center",
      fontFamily: "var(--serif)",
      fontSize: 13,
      fontWeight: 400
    }
  }, (author.name || "?").trim().charAt(0)), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 2,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 13.5,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, author.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 11,
      color: "var(--ink-4)",
      textTransform: "capitalize"
    }
  }, author.role), isPrivate && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      color: "var(--private)",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: ".08em",
      textTransform: "uppercase"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "4",
    y: "11",
    width: "16",
    height: "9",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 11V7a4 4 0 0 1 8 0v4"
  })), "Private"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--sans)",
      fontSize: 11,
      color: "var(--ink-4)",
      whiteSpace: "nowrap"
    }
  }, time)), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 13.5,
      lineHeight: 1.5,
      color: "var(--ink-2)",
      margin: 0
    }
  }, body)));
}
Object.assign(__ds_scope, { Comment });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/comments/Comment.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/comments/CommentComposer.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * CommentComposer — input row for posting a comment, with a public/private
 * visibility toggle. The toggle makes the audience explicit before sending.
 */
function CommentComposer({
  canPrivate = true,
  placeholder = "Add a comment…",
  onSend,
  style,
  ...rest
}) {
  const [value, setValue] = React.useState("");
  const [priv, setPriv] = React.useState(false);
  const send = () => {
    if (value.trim() && onSend) onSend({
      body: value,
      isPrivate: priv
    });
    setValue("");
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      paddingTop: 10,
      borderTop: "1px solid var(--line)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      gap: 8,
      background: priv ? "var(--private-soft)" : "var(--app-surface-2)",
      border: `1px solid ${priv ? "var(--private-line)" : "var(--line)"}`,
      borderRadius: "var(--app-rad-control)",
      padding: 6,
      transition: "background .15s, border-color .15s"
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    rows: 1,
    value: value,
    placeholder: placeholder,
    onChange: e => setValue(e.target.value),
    style: {
      flex: 1,
      border: 0,
      background: "transparent",
      resize: "none",
      outline: "none",
      fontFamily: "var(--sans)",
      fontSize: 14,
      color: "var(--ink)",
      padding: "7px 8px",
      minHeight: 20,
      lineHeight: 1.4
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: send,
    "aria-label": "Send",
    style: {
      width: 36,
      height: 36,
      flexShrink: 0,
      borderRadius: "50%",
      border: 0,
      cursor: "pointer",
      background: value.trim() ? "var(--primary)" : "var(--line-2)",
      color: "#fff",
      display: "grid",
      placeItems: "center",
      transition: "background .15s"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M22 2 11 13"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 2 15 22l-4-9-9-4 20-7z"
  })))), canPrivate && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      alignSelf: "flex-start",
      background: "var(--app-surface)",
      border: "1px solid var(--line)",
      borderRadius: "var(--app-rad-pill)",
      padding: 3,
      gap: 2
    }
  }, [{
    id: false,
    label: "Public"
  }, {
    id: true,
    label: "Private"
  }].map(o => {
    const on = priv === o.id;
    return /*#__PURE__*/React.createElement("button", {
      key: String(o.id),
      onClick: () => setPriv(o.id),
      style: {
        border: 0,
        cursor: "pointer",
        borderRadius: "var(--app-rad-pill)",
        padding: "5px 12px",
        fontFamily: "var(--sans)",
        fontSize: 11.5,
        fontWeight: 600,
        background: on ? o.id ? "var(--private)" : "var(--ink)" : "transparent",
        color: on ? "#fff" : "var(--ink-3)",
        transition: "background .15s, color .15s"
      }
    }, o.label);
  })));
}
Object.assign(__ds_scope, { CommentComposer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/comments/CommentComposer.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/comments/CommentThread.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * CommentThread — a list of Comments under a feed item, with a count
 * header and an optional composer rendered as children at the bottom.
 */
function CommentThread({
  count,
  comments = [],
  children,
  style,
  ...rest
}) {
  const n = count ?? comments.length;
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 0 8px",
      borderBottom: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--ink-3)",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
  })), /*#__PURE__*/React.createElement("strong", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 13,
      fontWeight: 600,
      color: "var(--ink-2)"
    }
  }, n, " ", n === 1 ? "comment" : "comments")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      padding: "8px 0"
    }
  }, comments.map((c, i) => /*#__PURE__*/React.createElement(__ds_scope.Comment, _extends({
    key: i
  }, c)))), children);
}
Object.assign(__ds_scope, { CommentThread });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/comments/CommentThread.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/dashboard/CenterRollupRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * CenterRollupRow — one center in the org-level (BV Coordinator) rollup:
 * center name, a headline attendance %, marked/enrolled, and a mini bar.
 * Use `placeholder` for centers with no data yet — honest "—" over invented
 * figures (the POC's single-center rollup is intentionally degenerate).
 */
function CenterRollupRow({
  name,
  region,
  attendance,
  marked,
  enrolled,
  placeholder = false,
  onClick,
  style,
  ...rest
}) {
  const pct = placeholder ? 0 : Math.max(0, Math.min(100, attendance || 0));
  const c = pct >= 85 ? "var(--success)" : pct >= 70 ? "var(--warning)" : "var(--danger)";
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      width: "100%",
      textAlign: "left",
      padding: "14px 16px",
      border: 0,
      borderBottom: "1px solid var(--line)",
      background: "transparent",
      cursor: onClick ? "pointer" : "default",
      fontFamily: "var(--sans)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, name), region && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-4)",
      marginTop: 1
    }
  }, region), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      borderRadius: 999,
      background: "var(--surface-alt)",
      overflow: "hidden",
      marginTop: 9,
      maxWidth: 220
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      borderRadius: 999,
      width: `${pct}%`,
      background: placeholder ? "var(--line-2)" : c
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right",
      flexShrink: 0
    }
  }, placeholder ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 18,
      color: "var(--ink-4)"
    }
  }, "\u2014") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 19,
      fontWeight: 500,
      color: c,
      fontVariantNumeric: "tabular-nums"
    }
  }, attendance, "%"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 11,
      color: "var(--ink-4)",
      marginTop: 1
    }
  }, marked, "/", enrolled))));
}
Object.assign(__ds_scope, { CenterRollupRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/dashboard/CenterRollupRow.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/dashboard/ComplianceBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function tone(value, explicit) {
  if (explicit) return explicit;
  if (value >= 85) return "success";
  if (value >= 70) return "warning";
  return "danger";
}
const COLORS = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)"
};

/**
 * ComplianceBar — a labelled progress bar for a single metric (attendance,
 * update compliance, approvals). Tone auto-derives from the value unless
 * set explicitly; the percentage is mono-tabular so rows align.
 */
function ComplianceBar({
  label,
  value = 0,
  suffix = "%",
  display,
  note,
  status,
  style,
  ...rest
}) {
  const c = COLORS[tone(value, status)];
  const pct = Math.max(0, Math.min(100, value));
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontFamily: "var(--sans)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      fontWeight: 400,
      fontSize: 17,
      letterSpacing: ".005em",
      color: "var(--ink)",
      whiteSpace: "nowrap"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 14,
      fontWeight: 500,
      color: c,
      fontVariantNumeric: "tabular-nums"
    }
  }, display != null ? display : `${value}${suffix}`)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: 999,
      background: "var(--surface-alt)",
      overflow: "hidden",
      margin: "12px 0 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      borderRadius: 999,
      width: `${pct}%`,
      background: c,
      transition: "width .4s var(--ease-standard)"
    }
  })), note && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: "var(--ink-3)",
      margin: "11px 0 0"
    }
  }, note));
}
Object.assign(__ds_scope, { ComplianceBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/dashboard/ComplianceBar.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/navigation/PersonaSwitcher.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ROLE_HUE = {
  student: "var(--role-student)",
  parent: "var(--role-parent)",
  teacher: "var(--role-teacher)",
  coordinator: "var(--role-coordinator)",
  bv: "var(--role-bv)",
  admin: "var(--role-admin)"
};

/**
 * PersonaSwitcher — the multi-persona active-role control. A compact pill
 * shows the current role; tapping opens a sheet to switch. Switching
 * re-scopes the whole app (own children → class → session → org), so the
 * sheet states that explicitly. One account, many scoped roles.
 */
function PersonaSwitcher({
  roles = [],
  activeId,
  onChange,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const active = roles.find(r => r.id === activeId) || roles[0] || {
    name: "—"
  };
  const hue = ROLE_HUE[active.role] || "var(--ink-3)";
  const pick = r => {
    setOpen(false);
    if (onChange) onChange(r.id);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", _extends({
    onClick: () => setOpen(true),
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      padding: "6px 10px 6px 11px",
      borderRadius: "var(--app-rad-pill)",
      background: "var(--app-surface)",
      border: "1px solid var(--line-2)",
      cursor: "pointer",
      fontFamily: "var(--sans)",
      fontSize: 12.5,
      fontWeight: 600,
      color: "var(--ink-2)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: "50%",
      background: hue
    }
  }), active.name, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--ink-4)",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 9l6 6 6-6"
  }))), open && /*#__PURE__*/React.createElement("div", {
    onClick: () => setOpen(false),
    style: {
      position: "fixed",
      inset: 0,
      zIndex: "var(--z-sheet)",
      background: "var(--app-overlay)",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: "100%",
      maxWidth: "var(--app-maxw)",
      background: "var(--app-canvas)",
      borderRadius: "20px 20px 0 0",
      padding: "10px 14px 22px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 4,
      borderRadius: 999,
      background: "var(--line-2)",
      margin: "4px auto 14px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 10.5,
      letterSpacing: ".14em",
      textTransform: "uppercase",
      color: "var(--ink-4)",
      margin: "0 0 12px"
    }
  }, "Switch active role \u2014 re-scopes your data"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, roles.map(r => {
    const on = r.id === active.id;
    return /*#__PURE__*/React.createElement("button", {
      key: r.id,
      onClick: () => pick(r),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        padding: 14,
        borderRadius: "var(--app-rad-control)",
        background: "var(--app-surface)",
        border: `1px solid ${on ? "var(--primary)" : "var(--line)"}`,
        boxShadow: on ? "0 0 0 3px rgba(184,83,26,.12)" : "none",
        fontFamily: "var(--sans)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 11,
        height: 11,
        borderRadius: "50%",
        background: ROLE_HUE[r.role] || "var(--ink-3)",
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        fontSize: 14,
        fontWeight: 600,
        color: "var(--ink)"
      }
    }, r.name), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        fontFamily: "var(--mono)",
        fontSize: 11.5,
        color: "var(--ink-3)",
        marginTop: 1
      }
    }, r.scope)), on && /*#__PURE__*/React.createElement("svg", {
      width: "17",
      height: "17",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "var(--primary)",
      strokeWidth: "2.2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M5 12l4 4L19 6"
    })));
  })))));
}
Object.assign(__ds_scope, { PersonaSwitcher });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/navigation/PersonaSwitcher.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/notifications/NotificationItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TYPES = {
  update: {
    bg: "var(--scope-class)",
    d: /*#__PURE__*/React.createElement("path", {
      d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
    })
  },
  announce: {
    bg: "var(--info)",
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M3 11l18-5v12L3 14v-3z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M11.6 16.8a3 3 0 1 1-5.8-1.6"
    }))
  },
  absence: {
    bg: "var(--danger)",
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 9v4M12 17h.01"
    }))
  },
  approval: {
    bg: "var(--success)",
    d: /*#__PURE__*/React.createElement("path", {
      d: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
    })
  },
  chat: {
    bg: "var(--role-bv)",
    d: /*#__PURE__*/React.createElement("path", {
      d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
    })
  }
};

/**
 * NotificationItem — one row in the notifications center. A type icon, a
 * title + body, a timestamp, and an unread dot. Maps push/email events to
 * a consistent visual language across personas.
 */
function NotificationItem({
  type = "update",
  title,
  body,
  time = "",
  unread = false,
  onClick,
  style,
  ...rest
}) {
  const t = TYPES[type] || TYPES.update;
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    style: {
      display: "flex",
      gap: 12,
      width: "100%",
      textAlign: "left",
      cursor: "pointer",
      padding: "13px 14px",
      border: 0,
      background: unread ? "var(--app-surface)" : "transparent",
      borderBottom: "1px solid var(--line)",
      fontFamily: "var(--sans)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 36,
      flexShrink: 0,
      borderRadius: "50%",
      background: t.bg,
      color: "#fff",
      display: "grid",
      placeItems: "center"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, t.d)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontSize: 11,
      color: "var(--ink-4)",
      flexShrink: 0,
      whiteSpace: "nowrap"
    }
  }, time)), body && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 13,
      color: "var(--ink-3)",
      lineHeight: 1.45,
      marginTop: 2
    }
  }, body)), unread && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: "50%",
      background: "var(--primary)",
      flexShrink: 0,
      marginTop: 6
    }
  }));
}
Object.assign(__ds_scope, { NotificationItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/notifications/NotificationItem.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/notifications/PushPermissionPrompt.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * PushPermissionPrompt — the in-app card that asks to enable Web Push
 * (VAPID) for the installed PWA. Honest about what's sent and offers a
 * clear "not now". Used once, near first meaningful action.
 */
function PushPermissionPrompt({
  title = "Stay in the loop",
  body = "Turn on notifications to hear about new class updates, announcements, and absences — even when the app is closed.",
  onEnable,
  onDismiss,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      gap: 14,
      alignItems: "flex-start",
      background: "var(--app-surface)",
      border: "1px solid var(--line)",
      borderRadius: "var(--app-rad-card)",
      boxShadow: "var(--app-shadow-card)",
      padding: 16,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 42,
      flexShrink: 0,
      borderRadius: "var(--app-rad-control)",
      background: "var(--primary-soft)",
      color: "var(--primary-2)",
      display: "grid",
      placeItems: "center"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 21a2 2 0 0 0 4 0"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      display: "block",
      fontFamily: "var(--serif)",
      fontWeight: 400,
      fontSize: 18,
      color: "var(--ink)",
      marginBottom: 4
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 13.5,
      lineHeight: 1.5,
      color: "var(--ink-3)",
      margin: "0 0 12px"
    }
  }, body), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onEnable,
    style: {
      border: 0,
      cursor: "pointer",
      borderRadius: "var(--app-rad-pill)",
      padding: "9px 16px",
      background: "var(--primary)",
      color: "#fff",
      fontFamily: "var(--sans)",
      fontSize: 13,
      fontWeight: 600
    }
  }, "Enable notifications"), /*#__PURE__*/React.createElement("button", {
    onClick: onDismiss,
    style: {
      border: "1px solid var(--line-2)",
      cursor: "pointer",
      borderRadius: "var(--app-rad-pill)",
      padding: "9px 16px",
      background: "transparent",
      color: "var(--ink-2)",
      fontFamily: "var(--sans)",
      fontSize: 13,
      fontWeight: 600
    }
  }, "Not now"))));
}
Object.assign(__ds_scope, { PushPermissionPrompt });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/notifications/PushPermissionPrompt.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/privacy/AuditEntry.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ACTIONS = {
  view: {
    label: "viewed",
    color: "var(--info)"
  },
  edit: {
    label: "edited",
    color: "var(--warning)"
  },
  export: {
    label: "exported",
    color: "var(--primary-2)"
  },
  approve: {
    label: "approved",
    color: "var(--success)"
  },
  delete: {
    label: "deleted",
    color: "var(--danger)"
  }
};

/**
 * AuditEntry — one line in the minors'-access audit log. Mono, dense, and
 * scannable: timestamp · actor (role:scope) · action · target. Required
 * by the compliance rule that access to minors' records is logged.
 */
function AuditEntry({
  time,
  actor,
  action = "view",
  target,
  style,
  ...rest
}) {
  const a = ACTIONS[action] || ACTIONS.view;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "9px 12px",
      borderBottom: "1px solid var(--line)",
      fontFamily: "var(--mono)",
      fontSize: 11.5,
      color: "var(--ink-3)",
      lineHeight: 1.4,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ink-4)",
      flexShrink: 0,
      fontVariantNumeric: "tabular-nums"
    }
  }, time), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ink-2)",
      flexShrink: 0
    }
  }, actor), /*#__PURE__*/React.createElement("span", {
    style: {
      color: a.color,
      fontWeight: 600,
      flexShrink: 0
    }
  }, a.label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ink)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, target));
}
Object.assign(__ds_scope, { AuditEntry });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/privacy/AuditEntry.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/privacy/ConsentCapture.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * ConsentCapture — timestamped parental + media consent. Each item is an
 * explicit opt-in checkbox; the captured timestamp is shown once checked,
 * because consent must be auditable for a minors' platform.
 */
function ConsentCapture({
  items = [],
  values = {},
  timestamps = {},
  onToggle,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      fontFamily: "var(--sans)",
      ...style
    }
  }, rest), items.map(it => {
    const on = !!values[it.id];
    return /*#__PURE__*/React.createElement("label", {
      key: it.id,
      style: {
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        cursor: "pointer",
        padding: 14,
        borderRadius: "var(--app-rad-control)",
        background: on ? "var(--success-soft)" : "var(--app-surface)",
        border: `1px solid ${on ? "var(--success-line)" : "var(--line)"}`,
        transition: "background .15s, border-color .15s"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 22,
        height: 22,
        flexShrink: 0,
        marginTop: 1,
        borderRadius: 6,
        border: `1.5px solid ${on ? "var(--success)" : "var(--line-2)"}`,
        background: on ? "var(--success)" : "transparent",
        display: "grid",
        placeItems: "center",
        transition: "all .15s"
      }
    }, on && /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "2.4",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M5 12l4 4L19 6"
    }))), /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: on,
      onChange: () => onToggle && onToggle(it.id),
      style: {
        position: "absolute",
        opacity: 0,
        width: 0,
        height: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        fontSize: 14,
        fontWeight: 600,
        color: "var(--ink)"
      }
    }, it.label, it.required && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--primary)"
      }
    }, " *")), it.help && /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        fontSize: 12.5,
        color: "var(--ink-3)",
        lineHeight: 1.5,
        marginTop: 3
      }
    }, it.help), on && timestamps[it.id] && /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--mono)",
        fontSize: 11,
        color: "var(--success)",
        marginTop: 6
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "12",
      height: "12",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 7v5l3 2"
    })), "Recorded ", timestamps[it.id])));
  }));
}
Object.assign(__ds_scope, { ConsentCapture });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/privacy/ConsentCapture.jsx", error: String((e && e.message) || e) }); }

// bv-connect/screens/desktop/dash.jsx
try { (() => {
/* global React, ReactDOM */
const DS = window.ChinmayaMissionDesignSystem_52eae1;
const {
  StatTile,
  ComplianceBar,
  CenterRollupRow,
  UserRoleRow,
  AuditEntry,
  PersonaSwitcher,
  Button
} = DS;
const {
  useState
} = React;
const OM = "../../../assets/chinmaya-om.png";
const ROLES = [{
  id: "bv",
  name: "BV Coordinator",
  role: "bv",
  scope: "Org rollup"
}, {
  id: "coordinator",
  name: "Coordinator",
  role: "coordinator",
  scope: "Session · Brampton"
}, {
  id: "admin",
  name: "Admin",
  role: "admin",
  scope: "Org"
}];
const ic = d => /*#__PURE__*/React.createElement("svg", {
  width: "18",
  height: "18",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, d);
const NAV = [{
  id: "overview",
  label: "Overview",
  icon: ic(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "3",
    width: "7",
    height: "9",
    rx: "1.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "3",
    width: "7",
    height: "5",
    rx: "1.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "12",
    width: "7",
    height: "9",
    rx: "1.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "16",
    width: "7",
    height: "5",
    rx: "1.5"
  })))
}, {
  id: "attendance",
  label: "Attendance",
  icon: ic(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 11l3 3L22 4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
  })))
}, {
  id: "people",
  label: "People & roles",
  icon: ic(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M23 21v-2a4 4 0 0 0-3-3.87"
  })))
}, {
  id: "audit",
  label: "Audit log",
  icon: ic(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 2v6h6M9 13h6M9 17h4"
  })))
}];
function Dash() {
  const [role, setRole] = useState("bv");
  const [nav, setNav] = useState("overview");
  const org = role === "bv";
  return /*#__PURE__*/React.createElement("div", {
    className: "shell"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "side__logo"
  }, /*#__PURE__*/React.createElement("img", {
    src: OM,
    alt: ""
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, "Bala Vihar App"), /*#__PURE__*/React.createElement("small", null, "CMDFW"))), /*#__PURE__*/React.createElement("nav", {
    className: "nav"
  }, NAV.map(n => /*#__PURE__*/React.createElement("a", {
    key: n.id,
    className: nav === n.id ? "on" : "",
    onClick: () => setNav(n.id)
  }, n.icon, n.label))), /*#__PURE__*/React.createElement("div", {
    className: "side__foot"
  }, /*#__PURE__*/React.createElement(PersonaSwitcher, {
    activeId: role,
    onChange: setRole,
    roles: ROLES,
    style: {
      width: "100%",
      justifyContent: "flex-start"
    }
  }))), /*#__PURE__*/React.createElement("main", {
    className: "main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "top"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, org ? "Org rollup" : "Session", " \xB7 Sunday 14 Jun"), /*#__PURE__*/React.createElement("h1", null, org ? "Compliance overview" : "Junior session"), /*#__PURE__*/React.createElement("p", null, org ? "Cross-center rollup — honest placeholders where a center isn't in the pilot." : "Brampton · 6 classes · live attendance & update tracking.")), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md"
  }, "Export report")), /*#__PURE__*/React.createElement("div", {
    className: "statrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "statcell"
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Attendance today",
    value: "94.2%",
    accent: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "statcell"
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Marked / enrolled",
    value: "47/50"
  })), /*#__PURE__*/React.createElement("div", {
    className: "statcell"
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Updates posted",
    value: "5/6"
  })), /*#__PURE__*/React.createElement("div", {
    className: "statcell"
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Absence alerts",
    value: "2"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "colstack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card__h"
  }, /*#__PURE__*/React.createElement("h2", null, "Compliance"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "This week")), /*#__PURE__*/React.createElement("div", {
    className: "card__pad"
  }, /*#__PURE__*/React.createElement(ComplianceBar, {
    label: "Attendance today",
    value: 94,
    display: "47/50",
    status: "success",
    note: "Junior A + 5 classes \xB7 marked by 9:15am."
  }), /*#__PURE__*/React.createElement(ComplianceBar, {
    label: "Update compliance",
    value: 83,
    note: "5 of 6 classes posted a weekly update."
  }), /*#__PURE__*/React.createElement(ComplianceBar, {
    label: "Consent on file",
    value: 68,
    status: "warning",
    note: "34 of 50 families have submitted parental consent."
  }))), /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card__h"
  }, /*#__PURE__*/React.createElement("h2", null, "Per-center rollup"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, org ? "4 centers" : "1 session")), /*#__PURE__*/React.createElement(CenterRollupRow, {
    name: "Brampton",
    region: "Session \xB7 JR + SR \xB7 50 enrolled",
    attendance: 94,
    marked: 47,
    enrolled: 50,
    onClick: () => {}
  }), org && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(CenterRollupRow, {
    name: "Mississauga",
    region: "Not in pilot yet",
    placeholder: true
  }), /*#__PURE__*/React.createElement(CenterRollupRow, {
    name: "Scarborough",
    region: "Not in pilot yet",
    placeholder: true
  }), /*#__PURE__*/React.createElement(CenterRollupRow, {
    name: "Markham",
    region: "Not in pilot yet",
    placeholder: true
  })))), /*#__PURE__*/React.createElement("div", {
    className: "colstack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card__h"
  }, /*#__PURE__*/React.createElement("h2", null, "Pending approvals"), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "2")), /*#__PURE__*/React.createElement(UserRoleRow, {
    name: "New parent",
    email: "priya.new@example.com",
    status: "pending",
    roles: ["parent"],
    onApprove: () => {},
    onReject: () => {}
  }), /*#__PURE__*/React.createElement(UserRoleRow, {
    name: "Assistant teacher",
    email: "asst@example.com",
    scope: "JR\xB7A",
    status: "pending",
    roles: [{
      role: "teacher",
      scope: "JR·A"
    }],
    onApprove: () => {},
    onReject: () => {}
  }), /*#__PURE__*/React.createElement(UserRoleRow, {
    name: "Priya N.",
    email: "priya@example.com",
    scope: "JR\xB7A",
    roles: [{
      role: "teacher",
      scope: "JR·A"
    }, {
      role: "parent"
    }],
    onManage: () => {}
  })), /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auditwrap"
  }, /*#__PURE__*/React.createElement("h4", null, "Audit log \xB7 minor access"), /*#__PURE__*/React.createElement(AuditEntry, {
    time: "09:05",
    actor: "admin",
    action: "export",
    target: "JR\xB7A roster (CSV)"
  }), /*#__PURE__*/React.createElement(AuditEntry, {
    time: "09:02",
    actor: "teacher:JR\xB7A",
    action: "view",
    target: "student #3 record"
  }), /*#__PURE__*/React.createElement(AuditEntry, {
    time: "09:00",
    actor: "coordinator",
    action: "view",
    target: "session rollup"
  }), /*#__PURE__*/React.createElement(AuditEntry, {
    time: "08:51",
    actor: "bv",
    action: "view",
    target: "org compliance"
  }), /*#__PURE__*/React.createElement(AuditEntry, {
    time: "08:40",
    actor: "admin",
    action: "edit",
    target: "parent consent #18"
  })))))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(Dash, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/screens/desktop/dash.jsx", error: String((e && e.message) || e) }); }

// bv-connect/screens/phone/app.jsx
try { (() => {
/* global React, ReactDOM */
const DS = window.ChinmayaMissionDesignSystem_52eae1;
const {
  MagicLinkLogin,
  PushPermissionPrompt,
  FeedCard,
  CommentThread,
  CommentComposer,
  ConversationRow,
  ChatBubble,
  MessageComposer,
  NotificationItem,
  PersonaSwitcher,
  ComplianceBar,
  RoleBadge,
  StatusChip,
  Button
} = DS;
const {
  useState
} = React;
const OM = "../../../assets/chinmaya-om.png";
const ROLES = [{
  id: "teacher",
  name: "Teacher",
  role: "teacher",
  scope: "JR·A · Brampton"
}, {
  id: "parent",
  name: "Parent",
  role: "parent",
  scope: "2 children"
}, {
  id: "coordinator",
  name: "Coordinator",
  role: "coordinator",
  scope: "Session · Brampton"
}, {
  id: "bv",
  name: "BV Coordinator",
  role: "bv",
  scope: "Org rollup"
}];
const ic = (d, s = 22) => /*#__PURE__*/React.createElement("svg", {
  width: s,
  height: s,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, d);
const ICON = {
  feed: ic(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 11a9 9 0 0 1 9 9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 4a16 16 0 0 1 16 16"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "19",
    r: "1.6",
    fill: "currentColor",
    stroke: "none"
  }))),
  msg: ic(/*#__PURE__*/React.createElement("path", {
    d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
  })),
  reg: ic(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 11l3 3L22 4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
  }))),
  bell: ic(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 21a2 2 0 0 0 4 0"
  })), 18),
  back: ic(/*#__PURE__*/React.createElement("path", {
    d: "M15 18l-6-6 6-6"
  }), 18),
  check: ic(/*#__PURE__*/React.createElement("path", {
    d: "M5 12l4 4L19 6"
  }), 16),
  x: ic(/*#__PURE__*/React.createElement("path", {
    d: "M6 6l12 12M18 6 6 18"
  }), 16)
};
const STUDENTS = [{
  id: 1,
  n: "Aarav M.",
  c: "var(--role-student)"
}, {
  id: 2,
  n: "Diya K.",
  c: "var(--role-parent)"
}, {
  id: 3,
  n: "Kabir S.",
  c: "var(--role-teacher)"
}, {
  id: 4,
  n: "Meera P.",
  c: "var(--role-coordinator)"
}, {
  id: 5,
  n: "Rohan T.",
  c: "var(--role-bv)"
}];
function App() {
  const [authed, setAuthed] = useState(false);
  const [sent, setSent] = useState(false);
  const [role, setRole] = useState("teacher");
  const [tab, setTab] = useState("feed");
  const [detail, setDetail] = useState(false);
  const [chat, setChat] = useState(false);
  const [toast, setToast] = useState("");
  const ping = m => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };
  if (!authed) {
    return /*#__PURE__*/React.createElement("div", {
      className: "phone"
    }, /*#__PURE__*/React.createElement("div", {
      className: "login"
    }, /*#__PURE__*/React.createElement(MagicLinkLogin, {
      logoSrc: OM,
      sent: sent,
      email: "teacher@cmdfw.org",
      onSend: () => {
        if (sent) {
          setAuthed(true);
        } else {
          setSent(true);
        }
      }
    })));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "phone"
  }, /*#__PURE__*/React.createElement("header", {
    className: "hdr"
  }, /*#__PURE__*/React.createElement("img", {
    className: "hdr__om",
    src: OM,
    alt: ""
  }), /*#__PURE__*/React.createElement("div", {
    className: "hdr__title"
  }, /*#__PURE__*/React.createElement("b", null, "Bala Vihar App"), /*#__PURE__*/React.createElement("small", null, ROLES.find(r => r.id === role).name, " \xB7 Brampton")), /*#__PURE__*/React.createElement(PersonaSwitcher, {
    activeId: role,
    onChange: r => {
      setRole(r);
      ping("Switched role — re-scoped");
    },
    roles: ROLES
  })), chat ? /*#__PURE__*/React.createElement(ChatView, {
    onBack: () => setChat(false),
    onSend: () => ping("Sent")
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: tab === "msg" ? "body body--flush" : "body"
  }, tab === "feed" && /*#__PURE__*/React.createElement(FeedTab, {
    role: role,
    onOpen: () => setDetail(true)
  }), tab === "msg" && /*#__PURE__*/React.createElement(MessagesTab, {
    onOpen: () => setChat(true)
  }), tab === "reg" && /*#__PURE__*/React.createElement(RegisterTab, {
    onSubmit: () => ping("Attendance submitted")
  }), tab === "bell" && /*#__PURE__*/React.createElement(AlertsTab, null)), /*#__PURE__*/React.createElement("nav", {
    className: "tabbar"
  }, /*#__PURE__*/React.createElement(TabBtn, {
    id: "feed",
    cur: tab,
    set: setTab,
    icon: ICON.feed,
    label: "Feed"
  }), /*#__PURE__*/React.createElement(TabBtn, {
    id: "msg",
    cur: tab,
    set: setTab,
    icon: ICON.msg,
    label: "Messages",
    badge: 4
  }), /*#__PURE__*/React.createElement(TabBtn, {
    id: "reg",
    cur: tab,
    set: setTab,
    icon: ICON.reg,
    label: "Register"
  }), /*#__PURE__*/React.createElement(TabBtn, {
    id: "bell",
    cur: tab,
    set: setTab,
    icon: ICON.bell,
    label: "Alerts",
    badge: 2
  }))), detail && /*#__PURE__*/React.createElement(FeedDetail, {
    onClose: () => setDetail(false),
    onComment: () => ping("Comment posted")
  }), toast && /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, ICON.check, " ", toast));
}
function TabBtn({
  id,
  cur,
  set,
  icon,
  label,
  badge
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: `tab ${cur === id ? "is-on" : ""}`,
    onClick: () => set(id)
  }, icon, label, badge ? /*#__PURE__*/React.createElement("span", {
    className: "badge"
  }, badge) : null);
}
function FeedTab({
  role,
  onOpen
}) {
  const [push, setPush] = useState(true);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Sunday \xB7 14 Jun"), /*#__PURE__*/React.createElement("h1", {
    className: "scrTitle"
  }, "Home feed"), /*#__PURE__*/React.createElement("div", {
    className: "stack"
  }, push && /*#__PURE__*/React.createElement(PushPermissionPrompt, {
    onEnable: () => setPush(false),
    onDismiss: () => setPush(false)
  }), /*#__PURE__*/React.createElement(FeedCard, {
    kind: "announcement",
    scope: "org",
    pinned: true,
    tag: "Announcement",
    author: {
      role: "bv",
      name: "BV Coordinator"
    },
    title: "Hanuman Chalisa Havan \u2014 14 Jun",
    body: "Registration is open for the Sunday havan. Families, please RSVP so we can honour seating and fire-code limits.",
    time: "2h ago",
    reach: "240 families",
    comments: 4,
    onOpen: onOpen
  }), /*#__PURE__*/React.createElement(FeedCard, {
    kind: "update",
    scope: "class",
    tag: "Homework",
    author: {
      role: "teacher",
      scope: "JR·A"
    },
    title: "This week in Junior A",
    body: "We learned the meaning of the first two verses of the Chalisa.",
    homework: "Help your child revise chant #1 at home.",
    time: "Yesterday",
    comments: 4,
    onOpen: onOpen
  }), /*#__PURE__*/React.createElement(FeedCard, {
    kind: "update",
    scope: "center",
    author: {
      role: "coordinator",
      name: "Coordinator"
    },
    title: "Teacher sync moved to 6pm",
    body: "Note the time change for this week's session sync.",
    time: "2 days ago",
    reach: "12 teachers",
    onOpen: onOpen
  })));
}
function FeedDetail({
  onClose,
  onComment
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "sheet",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet__panel",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet__grab"
  }), /*#__PURE__*/React.createElement("div", {
    className: "sheet__body"
  }, /*#__PURE__*/React.createElement(FeedCard, {
    kind: "update",
    scope: "class",
    tag: "Homework",
    author: {
      role: "teacher",
      scope: "JR·A"
    },
    title: "This week in Junior A",
    body: "We learned the meaning of the first two verses of the Chalisa. Aarav led the closing prayer beautifully.",
    homework: "Help your child revise chant #1 at home.",
    time: "Yesterday"
  }), /*#__PURE__*/React.createElement(CommentThread, {
    comments: [{
      author: {
        name: "Priya N.",
        role: "parent"
      },
      time: "1h",
      body: "Thank you for the lovely update!"
    }, {
      author: {
        name: "Aarav M.",
        role: "student"
      },
      time: "52m",
      body: "I practised chant #1 today."
    }, {
      author: {
        name: "Mrs. Rao",
        role: "teacher"
      },
      time: "40m",
      isPrivate: true,
      body: "Aarav did wonderfully — wanted you to know privately."
    }]
  }, /*#__PURE__*/React.createElement(CommentComposer, {
    onSend: () => {
      onComment();
    }
  })))));
}
function MessagesTab({
  onOpen
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "panel",
    style: {
      margin: 14,
      padding: 6
    }
  }, /*#__PURE__*/React.createElement(ConversationRow, {
    kind: "group",
    name: "Junior A \u2014 Class chat",
    scope: "JR\xB7A",
    preview: "Mrs. Rao: See you all Sunday!",
    time: "9:43",
    unread: 3,
    onClick: onOpen
  }), /*#__PURE__*/React.createElement(ConversationRow, {
    kind: "dm",
    role: "student",
    name: "Diya K.",
    preview: "did you finish chant 1?",
    time: "8:10",
    unread: 1,
    onClick: onOpen
  }), /*#__PURE__*/React.createElement(ConversationRow, {
    kind: "dm",
    role: "teacher",
    name: "Mrs. Rao",
    preview: "Great work today \uD83D\uDE4F",
    time: "Yest",
    onClick: onOpen
  }));
}
function ChatView({
  onBack,
  onSend
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "chat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "chat__head"
  }, /*#__PURE__*/React.createElement("button", {
    className: "chat__back",
    onClick: onBack
  }, ICON.back), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: "50%",
      background: "var(--indigo)",
      display: "grid",
      placeItems: "center"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--gold-light)",
    strokeWidth: "1.8"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 15
    }
  }, "Junior A \u2014 Class chat"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--ink-3)"
    }
  }, "Teacher + 18 students"))), /*#__PURE__*/React.createElement("div", {
    className: "chat__scroll"
  }, /*#__PURE__*/React.createElement(ChatBubble, {
    author: "Mrs. Rao",
    time: "9:40"
  }, "Reminder: havan is this Sunday \uD83D\uDE4F"), /*#__PURE__*/React.createElement(ChatBubble, {
    author: "Aarav M.",
    time: "9:41"
  }, "Is havan at 9 or 9:30?"), /*#__PURE__*/React.createElement(ChatBubble, {
    own: true,
    time: "9:43",
    read: true
  }, "9:00 sharp \u2014 please arrive by 8:45."), /*#__PURE__*/React.createElement(ChatBubble, {
    author: "Diya K.",
    time: "9:44"
  }, "Got it, thank you!")), /*#__PURE__*/React.createElement(MessageComposer, {
    placeholder: "Message Junior A\u2026",
    onSend: onSend
  }));
}
function RegisterTab({
  onSubmit
}) {
  const [marks, setMarks] = useState({
    1: "present",
    5: "present"
  });
  const [done, setDone] = useState(false);
  const set = (id, v) => setMarks(m => ({
    ...m,
    [id]: m[id] === v ? undefined : v
  }));
  const present = Object.values(marks).filter(v => v === "present").length;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Sunday \xB7 14 Jun \xB7 Junior A"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("h1", {
    className: "scrTitle",
    style: {
      margin: "3px 0 0"
    }
  }, "Register"), /*#__PURE__*/React.createElement(RoleBadge, {
    role: "teacher",
    scope: "JR\xB7A"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: "var(--ink-3)",
      margin: "6px 0 14px"
    }
  }, Object.values(marks).filter(Boolean).length, " of ", STUDENTS.length, " marked."), /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, STUDENTS.map(s => /*#__PURE__*/React.createElement("div", {
    className: "student",
    key: s.id
  }, /*#__PURE__*/React.createElement("span", {
    className: "av",
    style: {
      background: s.c
    }
  }, s.n[0]), /*#__PURE__*/React.createElement("b", null, s.n), /*#__PURE__*/React.createElement("div", {
    className: "mk"
  }, /*#__PURE__*/React.createElement("button", {
    className: `mkb p ${marks[s.id] === "present" ? "on" : ""}`,
    onClick: () => set(s.id, "present")
  }, ICON.check), /*#__PURE__*/React.createElement("button", {
    className: `mkb a ${marks[s.id] === "absent" ? "on" : ""}`,
    onClick: () => set(s.id, "absent")
  }, ICON.x))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, !done ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    size: "lg",
    onClick: () => {
      setDone(true);
      onSubmit();
    }
  }, "Submit attendance") : /*#__PURE__*/React.createElement("div", {
    className: "panel",
    style: {
      padding: 16
    }
  }, /*#__PURE__*/React.createElement(ComplianceBar, {
    label: "Attendance today",
    value: Math.round(present / STUDENTS.length * 100),
    display: `${present}/${STUDENTS.length}`,
    status: "success",
    note: "Submitted \xB7 synced to your session dashboard."
  }))));
}
function AlertsTab() {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Notifications"), /*#__PURE__*/React.createElement("h1", {
    className: "scrTitle"
  }, "Alerts"), /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement(NotificationItem, {
    type: "update",
    unread: true,
    title: "New update in Junior A",
    body: "Mrs. Rao posted this week's lesson and homework.",
    time: "2h"
  }), /*#__PURE__*/React.createElement(NotificationItem, {
    type: "announce",
    unread: true,
    title: "Hanuman Chalisa Havan",
    body: "Registration is now open \u2014 RSVP by Friday.",
    time: "5h"
  }), /*#__PURE__*/React.createElement(NotificationItem, {
    type: "absence",
    title: "Absence reported",
    body: "Kabir S. marked absent \u2014 reason attached.",
    time: "Yest"
  }), /*#__PURE__*/React.createElement(NotificationItem, {
    type: "approval",
    title: "New parent approved",
    body: "Priya N. was added to your session.",
    time: "Yest"
  }), /*#__PURE__*/React.createElement(NotificationItem, {
    type: "chat",
    title: "Diya K. messaged you",
    body: "did you finish chant 1?",
    time: "2d"
  })));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/screens/phone/app.jsx", error: String((e && e.message) || e) }); }

// components/brand/EventDateBlock.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * EventDateBlock — the editorial date used in event rows and cards:
 * a big terracotta serif day over an uppercase month and year.
 */
function EventDateBlock({
  day,
  month,
  year,
  size = "lg",
  style,
  ...rest
}) {
  const dayFs = size === "sm" ? 36 : size === "md" ? 44 : 56;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      fontFamily: "var(--serif)",
      lineHeight: 1,
      color: "var(--ink)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: dayFs,
      fontWeight: 500,
      letterSpacing: "-.02em",
      color: "var(--primary)"
    }
  }, day), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: ".22em",
      textTransform: "uppercase",
      color: "var(--ink-3)",
      marginTop: 8
    }
  }, month), year && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 11,
      letterSpacing: ".14em",
      color: "var(--ink-4)",
      marginTop: 3
    }
  }, year));
}
Object.assign(__ds_scope, { EventDateBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/EventDateBlock.jsx", error: String((e && e.message) || e) }); }

// components/brand/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Logo — the Chinmaya Mission OM mark, optionally with the wordmark.
 * The OM is the saffron mark from assets/chinmaya-om.png. Pass a `src`
 * if the asset lives at a different relative path in your artifact.
 */
function Logo({
  src = "assets/chinmaya-om.png",
  size = 40,
  wordmark = true,
  title = "Chinmaya Mission DFW",
  tagline = "Events & Satsangs",
  onDark = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 12,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "Chinmaya Mission OM",
    style: {
      width: size,
      height: "auto",
      objectFit: "contain",
      flexShrink: 0,
      display: "block"
    }
  }), wordmark && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      flexDirection: "column",
      lineHeight: 1.1
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontFamily: "var(--serif)",
      fontSize: Math.round(size * 0.52),
      fontWeight: 600,
      letterSpacing: ".01em",
      color: onDark ? "var(--on-dark)" : "var(--ink)"
    }
  }, title), tagline && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 11,
      letterSpacing: ".14em",
      textTransform: "uppercase",
      color: onDark ? "rgba(251,243,223,.7)" : "var(--ink-3)",
      marginTop: 2
    }
  }, tagline)));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/auth/MagicLinkLogin.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * MagicLinkLogin — passwordless sign-in. One email field → "send magic
 * link", then a confirmation state. No minor self-registration: accounts
 * are provisioned, so there is no sign-up path here by design.
 */
function MagicLinkLogin({
  logoSrc = "assets/chinmaya-om.png",
  appName = "Bala Vihar App",
  sent = false,
  email: emailProp = "",
  onSend,
  style,
  ...rest
}) {
  const [email, setEmail] = React.useState(emailProp);
  const submit = e => {
    e.preventDefault();
    if (email.trim() && onSend) onSend(email);
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      width: "100%",
      maxWidth: 360,
      margin: "0 auto",
      textAlign: "center",
      fontFamily: "var(--sans)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Logo, {
    src: logoSrc,
    size: 44,
    title: appName,
    tagline: "CMDFW \xB7 Dallas\u2013Fort Worth"
  })), !sent ? /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--serif)",
      fontWeight: 400,
      fontSize: 26,
      color: "var(--ink)",
      margin: "0 0 6px",
      letterSpacing: ".005em"
    }
  }, "Sign in"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: "var(--ink-3)",
      lineHeight: 1.5,
      margin: 0
    }
  }, "Enter the email your coordinator has on file. We'll send a secure sign-in link \u2014 no password needed.")), /*#__PURE__*/React.createElement("input", {
    type: "email",
    required: true,
    placeholder: "you@example.com",
    value: email,
    onChange: e => setEmail(e.target.value),
    style: {
      width: "100%",
      boxSizing: "border-box",
      background: "var(--app-surface)",
      border: "1px solid var(--line-2)",
      borderRadius: "var(--app-rad-control)",
      padding: "14px 16px",
      fontFamily: "var(--sans)",
      fontSize: 15.5,
      color: "var(--ink)",
      outline: "none",
      minHeight: 48
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      width: "100%",
      minHeight: 48,
      border: 0,
      cursor: "pointer",
      borderRadius: "var(--app-rad-pill)",
      background: "var(--primary)",
      color: "#fff",
      fontFamily: "var(--sans)",
      fontSize: 15,
      fontWeight: 600
    }
  }, "Send magic link"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: "var(--ink-4)",
      lineHeight: 1.5,
      margin: "2px 0 0"
    }
  }, "Accounts are set up by your center. There's no public sign-up \u2014 students never self-register.")) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 56,
      height: 56,
      borderRadius: "50%",
      background: "var(--success-soft)",
      color: "var(--success)",
      display: "grid",
      placeItems: "center"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "28",
    height: "28",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "5",
    width: "18",
    height: "14",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m3 7 9 6 9-6"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--serif)",
      fontWeight: 400,
      fontSize: 24,
      color: "var(--ink)",
      margin: "0 0 6px"
    }
  }, "Check your email"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: "var(--ink-3)",
      lineHeight: 1.5,
      margin: 0
    }
  }, "We sent a sign-in link to ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--ink)",
      fontWeight: 600
    }
  }, email || "your inbox"), ". It expires in 15 minutes.")), /*#__PURE__*/React.createElement("button", {
    onClick: () => onSend && onSend(email),
    style: {
      border: 0,
      background: "transparent",
      color: "var(--primary-2)",
      fontFamily: "var(--sans)",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "Resend link")));
}
Object.assign(__ds_scope, { MagicLinkLogin });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/auth/MagicLinkLogin.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the Chinmaya Mission action control.
 * Capsule geometry, Inter 600. One PRIMARY (terracotta) action per view;
 * everything else is secondary / ghost / outline / gold / danger.
 */
function Button({
  variant = "primary",
  size = "md",
  type = "button",
  href,
  icon,
  iconRight,
  disabled = false,
  fullWidth = false,
  onClick,
  children,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      padding: "9px 16px",
      fontSize: 13
    },
    md: {
      padding: "11px 18px",
      fontSize: 14
    },
    lg: {
      padding: "14px 24px",
      fontSize: 15
    },
    xl: {
      padding: "16px 30px",
      fontSize: 16
    }
  };
  const variants = {
    primary: {
      background: "var(--primary)",
      color: "#fff",
      borderColor: "transparent"
    },
    secondary: {
      background: "var(--surface)",
      color: "var(--ink)",
      borderColor: "var(--line-2)"
    },
    ghost: {
      background: "transparent",
      color: "var(--ink)",
      borderColor: "var(--line-2)"
    },
    outline: {
      background: "transparent",
      color: "var(--on-dark)",
      borderColor: "rgba(255,255,255,.4)"
    },
    gold: {
      background: "var(--gold)",
      color: "#1c1410",
      borderColor: "transparent"
    },
    danger: {
      background: "var(--danger)",
      color: "#fff",
      borderColor: "transparent"
    },
    dark: {
      background: "var(--ink)",
      color: "var(--on-dark)",
      borderColor: "transparent"
    }
  };
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "var(--sans)",
    fontWeight: 600,
    letterSpacing: ".01em",
    lineHeight: 1,
    borderRadius: "var(--rad-pill)",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background .15s var(--ease-standard), border-color .15s, transform .15s, box-shadow .15s",
    textDecoration: "none",
    minHeight: "var(--hit-min)",
    width: fullWidth ? "100%" : undefined,
    opacity: disabled ? 0.5 : 1,
    ...sizes[size],
    ...variants[variant],
    ...style
  };
  const content = /*#__PURE__*/React.createElement(React.Fragment, null, icon, children, iconRight);
  if (href && !disabled) {
    return /*#__PURE__*/React.createElement("a", _extends({
      href: href,
      style: base,
      onClick: onClick
    }, rest), content);
  }
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    style: base,
    disabled: disabled,
    onClick: onClick
  }, rest), content);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — the warm-paper surface container.
 * Surface fill, hairline border, 18px radius, soft warm shadow.
 * `interactive` adds the lift-on-hover used by event cards.
 * `tone="cream"` uses the raised cream well; `tone="indigo"` is the
 * dark poster surface (text flips to cream).
 */
function Card({
  tone = "surface",
  interactive = false,
  as = "div",
  padding = 24,
  style,
  children,
  ...rest
}) {
  const tones = {
    surface: {
      background: "var(--surface)",
      color: "var(--ink)",
      border: "1px solid var(--line)"
    },
    cream: {
      background: "var(--bg-cream)",
      color: "var(--ink)",
      border: "1px solid var(--line)"
    },
    indigo: {
      background: "var(--indigo)",
      color: "var(--on-dark)",
      border: "1px solid var(--indigo-2)"
    }
  };
  const Tag = as;
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement(Tag, _extends({
    onMouseEnter: interactive ? () => setHover(true) : undefined,
    onMouseLeave: interactive ? () => setHover(false) : undefined,
    style: {
      borderRadius: "var(--rad-lg)",
      boxShadow: "var(--shadow-sm)",
      padding,
      transition: "transform .2s var(--ease-standard), box-shadow .2s, border-color .2s",
      ...tones[tone],
      ...(interactive && hover ? {
        transform: "translateY(-3px)",
        boxShadow: "var(--shadow-lg)",
        borderColor: "var(--primary)"
      } : null),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Field — label + input with reserved validation slot.
 * Validation is a state, not a tooltip: the error message renders inline
 * in --danger and the slot is always reserved so layout never jumps.
 * Renders an <input>, or a <textarea>/<select> via `as`.
 */
function Field({
  label,
  hint,
  required = false,
  error,
  as = "input",
  id,
  uppercase = true,
  style,
  inputStyle,
  children,
  ...rest
}) {
  const reactId = React.useId();
  const fieldId = id || reactId;
  const invalid = Boolean(error);
  const Tag = as;
  const controlStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface)",
    border: `1px solid ${invalid ? "var(--danger)" : "var(--line-2)"}`,
    borderRadius: "var(--rad)",
    padding: as === "textarea" ? "12px 16px" : "13px 16px",
    fontFamily: "var(--sans)",
    fontSize: 15.5,
    color: "var(--ink)",
    outline: "none",
    minHeight: as === "textarea" ? 96 : "var(--hit-min)",
    resize: as === "textarea" ? "vertical" : undefined,
    transition: "border-color .15s, box-shadow .15s",
    ...inputStyle
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    style: {
      fontFamily: "var(--sans)",
      fontSize: uppercase ? 11 : 13,
      fontWeight: 600,
      letterSpacing: uppercase ? ".2em" : ".01em",
      textTransform: uppercase ? "uppercase" : "none",
      color: "var(--ink-2)",
      display: "inline-flex",
      alignItems: "center",
      gap: 6
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--primary)"
    }
  }, "*")), /*#__PURE__*/React.createElement(Tag, _extends({
    id: fieldId,
    "aria-invalid": invalid || undefined,
    style: controlStyle,
    onFocus: e => {
      if (!invalid) {
        e.target.style.borderColor = "var(--primary)";
        e.target.style.boxShadow = "var(--focus-ring)";
      }
    },
    onBlur: e => {
      e.target.style.borderColor = invalid ? "var(--danger)" : "var(--line-2)";
      e.target.style.boxShadow = "none";
    }
  }, rest), children), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 12.5,
      lineHeight: 1.4,
      minHeight: 16,
      color: invalid ? "var(--danger)" : "var(--ink-3)"
    }
  }, error || hint || ""));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Field.jsx", error: String((e && e.message) || e) }); }

// components/core/RoleBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ROLES = {
  student: {
    label: "Student",
    color: "var(--role-student)"
  },
  parent: {
    label: "Parent",
    color: "var(--role-parent)"
  },
  teacher: {
    label: "Teacher",
    color: "var(--role-teacher)"
  },
  coordinator: {
    label: "Coordinator",
    color: "var(--role-coordinator)"
  },
  bv: {
    label: "BV Coordinator",
    color: "var(--role-bv)"
  },
  admin: {
    label: "Admin",
    color: "var(--role-admin)"
  }
};

/**
 * RoleBadge — capsule that codes a persona by its role hue, optionally
 * with a mono scope label (e.g. the class/center it's scoped to).
 * Role hues are data-coding only — never page or action colors.
 */
function RoleBadge({
  role = "student",
  label,
  scope,
  style,
  ...rest
}) {
  const r = ROLES[role] || ROLES.student;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      padding: "5px 11px",
      borderRadius: "var(--rad-pill)",
      fontFamily: "var(--sans)",
      fontSize: 12,
      fontWeight: 600,
      color: "var(--ink-2)",
      background: "var(--surface)",
      border: "1px solid var(--line)",
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: "50%",
      background: r.color,
      flexShrink: 0
    }
  }), label || r.label, scope && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)",
      fontSize: 10.5,
      letterSpacing: ".04em",
      color: "var(--ink-4)",
      paddingLeft: 6,
      marginLeft: 2,
      borderLeft: "1px solid var(--line)"
    }
  }, scope));
}
Object.assign(__ds_scope, { RoleBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/RoleBadge.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/admin/UserRoleRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * UserRoleRow — admin row for a person: avatar, name, scope, their role
 * badges (multi-persona supported), and approve/reject actions for pending
 * accounts. Pending rows surface the approval affordance inline.
 */
function UserRoleRow({
  name,
  email,
  scope,
  roles = [],
  status = "active",
  onApprove,
  onReject,
  onManage,
  style,
  ...rest
}) {
  const pending = status === "pending";
  const initial = (name || "?").trim().charAt(0);
  const iconBtn = (bg, fg, bd) => ({
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: `1px solid ${bd}`,
    background: bg,
    color: fg,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    flexShrink: 0
  });
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 14px",
      borderBottom: "1px solid var(--line)",
      fontFamily: "var(--sans)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      flexShrink: 0,
      borderRadius: "50%",
      background: "var(--indigo)",
      color: "#fff",
      display: "grid",
      placeItems: "center",
      fontFamily: "var(--serif)",
      fontSize: 16
    }
  }, initial), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: "var(--ink)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, name), pending && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: ".12em",
      textTransform: "uppercase",
      color: "var(--warning)",
      background: "var(--warning-soft)",
      border: "1px solid var(--warning-line)",
      borderRadius: "var(--app-rad-pill)",
      padding: "2px 7px"
    }
  }, "Pending")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--ink-4)",
      marginTop: 1,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, email, email && scope ? " · " : "", scope && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--mono)"
    }
  }, scope)), roles.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      flexWrap: "wrap",
      marginTop: 7
    }
  }, roles.map(r => /*#__PURE__*/React.createElement(__ds_scope.RoleBadge, {
    key: typeof r === "string" ? r : r.role,
    role: typeof r === "string" ? r : r.role,
    scope: typeof r === "string" ? undefined : r.scope
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexShrink: 0
    }
  }, pending ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    onClick: onReject,
    "aria-label": "Reject",
    style: iconBtn("var(--danger-soft)", "var(--danger)", "var(--danger-line)")
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 6l12 12M18 6 6 18"
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: onApprove,
    "aria-label": "Approve",
    style: iconBtn("var(--success-soft)", "var(--success)", "var(--success-line)")
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12l4 4L19 6"
  })))) : /*#__PURE__*/React.createElement("button", {
    onClick: onManage,
    "aria-label": "Manage",
    style: iconBtn("var(--app-surface)", "var(--ink-3)", "var(--line-2)")
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1.6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "12",
    r: "1.6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "12",
    r: "1.6"
  })))));
}
Object.assign(__ds_scope, { UserRoleRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/admin/UserRoleRow.jsx", error: String((e && e.message) || e) }); }

// bv-connect/components/feed/FeedCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SCOPES = {
  org: {
    label: "Org-wide",
    color: "var(--scope-org)"
  },
  center: {
    label: "Center",
    color: "var(--scope-center)"
  },
  class: {
    label: "Class",
    color: "var(--scope-class)"
  }
};
const Dot = ({
  c
}) => /*#__PURE__*/React.createElement("span", {
  style: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: c,
    flexShrink: 0
  }
});
const Icon = ({
  d,
  size = 14
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, d);

/**
 * FeedCard — one item in the home feed: an announcement or a class update.
 * Header carries the author's RoleBadge + a scope pill (org / center / class)
 * and an optional pin. Footer shows time + reach + comment count.
 */
function FeedCard({
  author = {
    name: "",
    role: "teacher",
    scope: ""
  },
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
  return /*#__PURE__*/React.createElement("article", _extends({
    onClick: onOpen,
    style: {
      background: "var(--app-surface)",
      border: "1px solid var(--line)",
      borderRadius: "var(--app-rad-card)",
      boxShadow: "var(--app-shadow-row)",
      padding: 16,
      cursor: onOpen ? "pointer" : "default",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 11,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.RoleBadge, {
    role: author.role,
    label: author.name || undefined,
    scope: author.scope || undefined
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 9px",
      borderRadius: "var(--app-rad-pill)",
      background: "var(--app-surface-2)",
      border: "1px solid var(--line)",
      fontFamily: "var(--sans)",
      fontSize: 11,
      fontWeight: 600,
      color: "var(--ink-2)"
    }
  }, /*#__PURE__*/React.createElement(Dot, {
    c: sc.color
  }), sc.label), tag && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "3px 9px",
      borderRadius: "var(--app-rad-pill)",
      background: isAnnouncement ? "var(--primary-soft)" : "var(--success-soft)",
      color: isAnnouncement ? "var(--primary-2)" : "var(--success)",
      fontFamily: "var(--sans)",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: ".1em",
      textTransform: "uppercase"
    }
  }, tag), pinned && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      color: "var(--gold-2)",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: ".12em",
      textTransform: "uppercase"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 13,
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M12 17v5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5 9V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4l-3 3v2H8v-2L5 9z"
    }))
  }), " Pinned")), title && /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: isAnnouncement ? "var(--serif)" : "var(--sans)",
      fontWeight: isAnnouncement ? 400 : 600,
      fontSize: isAnnouncement ? 20 : 16.5,
      lineHeight: 1.2,
      letterSpacing: isAnnouncement ? ".005em" : "0",
      color: "var(--ink)",
      margin: "0 0 5px"
    }
  }, title), body && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 14,
      lineHeight: 1.55,
      color: "var(--ink-2)",
      margin: 0
    }
  }, body), homework && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      padding: "9px 12px",
      borderRadius: "var(--app-rad-control)",
      background: "var(--success-soft)",
      border: "1px solid var(--success-line)",
      color: "var(--success)",
      fontFamily: "var(--sans)",
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 15,
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
    }))
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontWeight: 600
    }
  }, "Homework:"), " ", homework)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      marginTop: 13,
      fontFamily: "var(--sans)",
      fontSize: 12,
      color: "var(--ink-3)"
    }
  }, time && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 13,
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 7v5l3 2"
    }))
  }), time), reach != null && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 13,
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "9",
      cy: "7",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M22 21v-2a4 4 0 0 0-3-3.87"
    }))
  }), reach), comments != null && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      whiteSpace: "nowrap",
      marginLeft: "auto",
      color: "var(--primary-2)",
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 13,
    d: /*#__PURE__*/React.createElement("path", {
      d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
    })
  }), comments)));
}
Object.assign(__ds_scope, { FeedCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "bv-connect/components/feed/FeedCard.jsx", error: String((e && e.message) || e) }); }

// components/core/SegmentedTabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * SegmentedTabs — pill tab group (Upcoming / Past / All, verify-by, etc).
 * The active tab fills with ink; others are quiet. Optional count badges.
 */
function SegmentedTabs({
  tabs = [],
  value,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: "inline-flex",
      gap: 4,
      padding: 4,
      background: "var(--surface)",
      border: "1px solid var(--line)",
      borderRadius: "var(--rad-pill)",
      ...style
    }
  }, rest), tabs.map(t => {
    const id = typeof t === "string" ? t : t.id;
    const label = typeof t === "string" ? t : t.label;
    const count = typeof t === "string" ? undefined : t.count;
    const on = id === value;
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      role: "tab",
      "aria-selected": on,
      onClick: () => onChange(id),
      style: {
        border: 0,
        background: on ? "var(--ink)" : "transparent",
        color: on ? "var(--on-dark)" : "var(--ink-3)",
        padding: "10px 18px",
        fontFamily: "var(--sans)",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: ".04em",
        cursor: "pointer",
        borderRadius: "var(--rad-pill)",
        transition: "background .15s, color .15s",
        whiteSpace: "nowrap"
      }
    }, label, count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        fontSize: 11,
        opacity: 0.65,
        fontVariantNumeric: "tabular-nums"
      }
    }, count));
  }));
}
Object.assign(__ds_scope, { SegmentedTabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SegmentedTabs.jsx", error: String((e && e.message) || e) }); }

// components/core/StatTile.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatTile — a single figure with an uppercase label.
 * The value is mono tabular by default (so compared figures align in a
 * row); set `display` to render it in the large serif for hero stats.
 */
function StatTile({
  label,
  value,
  display = false,
  accent = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--sans)",
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: ".14em",
      textTransform: "uppercase",
      color: "var(--ink-4)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: display ? {
      fontFamily: "var(--serif)",
      fontWeight: 500,
      fontSize: 44,
      lineHeight: 1,
      letterSpacing: "-.02em",
      color: accent ? "var(--primary)" : "var(--ink)"
    } : {
      fontFamily: "var(--mono)",
      fontSize: 28,
      fontWeight: 500,
      lineHeight: 1,
      letterSpacing: "-.01em",
      fontVariantNumeric: "tabular-nums",
      color: accent ? "var(--primary)" : "var(--ink)"
    }
  }, value));
}
Object.assign(__ds_scope, { StatTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatTile.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatusChip — small capsule status marker.
 * Marketing/registration statuses: open / soon / past / featured.
 * App/attendance statuses: present / absent / excused / info / neutral.
 * A leading dot appears on "live" states (open, present).
 */
function StatusChip({
  status = "neutral",
  children,
  dot,
  style,
  ...rest
}) {
  const map = {
    open: {
      bg: "var(--success-soft)",
      fg: "var(--success)",
      bd: "var(--success-line)",
      dot: "var(--success-2)"
    },
    present: {
      bg: "var(--success-soft)",
      fg: "var(--success)",
      bd: "var(--success-line)",
      dot: "var(--success-2)"
    },
    soon: {
      bg: "var(--primary-soft)",
      fg: "var(--primary-2)",
      bd: "#e8c597",
      dot: "var(--primary)"
    },
    excused: {
      bg: "var(--warning-soft)",
      fg: "var(--warning)",
      bd: "var(--warning-line)",
      dot: "var(--warning)"
    },
    absent: {
      bg: "var(--danger-soft)",
      fg: "var(--danger)",
      bd: "var(--danger-line)",
      dot: "var(--danger)"
    },
    info: {
      bg: "var(--info-soft)",
      fg: "var(--info)",
      bd: "var(--info-line)",
      dot: "var(--info)"
    },
    past: {
      bg: "#efe8db",
      fg: "var(--ink-3)",
      bd: "var(--line-2)",
      dot: "var(--ink-4)"
    },
    featured: {
      bg: "var(--gold)",
      fg: "#fbf3df",
      bd: "var(--gold-2)",
      dot: "#fbf3df"
    },
    neutral: {
      bg: "var(--surface)",
      fg: "var(--ink-3)",
      bd: "var(--line)",
      dot: "var(--ink-4)"
    }
  };
  const c = map[status] || map.neutral;
  const showDot = dot ?? (status === "open" || status === "present");
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      fontFamily: "var(--sans)",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: ".16em",
      textTransform: "uppercase",
      borderRadius: "var(--rad-pill)",
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.bd}`,
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), showDot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: c.dot,
      boxShadow: `0 0 0 3px color-mix(in srgb, ${c.dot} 22%, transparent)`
    }
  }), children);
}
Object.assign(__ds_scope, { StatusChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusChip.jsx", error: String((e && e.message) || e) }); }

// components/core/Stepper.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Stepper — labelled +/- number control (attendee counts, quantities).
 * Round capsule buttons with ≥40px hit targets; the value is set in the
 * display serif so it reads like a figure.
 */
function Stepper({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 20,
  style,
  ...rest
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const btn = disabled => ({
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid var(--line-2)",
    background: "var(--surface)",
    color: "var(--ink-2)",
    fontSize: 20,
    lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "grid",
    placeItems: "center",
    opacity: disabled ? 0.35 : 1,
    transition: "border-color .15s, color .15s"
  });
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      padding: "18px 0",
      ...style
    }
  }, rest), label && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontFamily: "var(--serif)",
      fontWeight: 500,
      fontSize: 19,
      color: "var(--ink)",
      letterSpacing: "-.005em"
    }
  }, label), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--ink-3)"
    }
  }, hint)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: btn(value <= min),
    disabled: value <= min,
    onClick: dec,
    "aria-label": "Decrease"
  }, "\u2212"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--serif)",
      fontWeight: 500,
      fontSize: 26,
      color: "var(--ink)",
      minWidth: 36,
      textAlign: "center",
      letterSpacing: "-.01em",
      fontVariantNumeric: "tabular-nums"
    }
  }, value), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: btn(value >= max),
    disabled: value >= max,
    onClick: inc,
    "aria-label": "Increase"
  }, "+")));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Stepper.jsx", error: String((e && e.message) || e) }); }

// ui_kits/events-site/EventsApp.jsx
try { (() => {
/* global React, ReactDOM, I, EVENTS */
const DS = window.ChinmayaMissionDesignSystem_52eae1;
const {
  Button,
  StatusChip,
  Logo,
  EventDateBlock,
  StatTile,
  SegmentedTabs
} = DS;
const {
  useState
} = React;
const OM = "../../assets/chinmaya-om.png";
const GURUDEV = "../../assets/gurudev.jpg";
function App() {
  const [tab, setTab] = useState("upcoming");
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState("");
  const featured = EVENTS.find(e => e.featured) || EVENTS[0];
  const upcoming = EVENTS.filter(e => e.status !== "past");
  const past = EVENTS.filter(e => e.status === "past");
  const visible = tab === "upcoming" ? upcoming : tab === "past" ? past : EVENTS;
  const ping = m => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "shell"
  }, /*#__PURE__*/React.createElement(Nav, {
    onRegister: () => setDrawer(true)
  }), /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(Hero, {
    featured: featured,
    onRegister: () => setDrawer(true)
  }), /*#__PURE__*/React.createElement(EventsList, {
    events: visible,
    tab: tab,
    setTab: setTab,
    counts: {
      upcoming: upcoming.length,
      past: past.length,
      all: EVENTS.length
    },
    onRegister: () => setDrawer(true)
  }), /*#__PURE__*/React.createElement(Welcome, null), /*#__PURE__*/React.createElement(Notify, {
    onDone: () => ping("Subscribed — we'll be in touch")
  })), /*#__PURE__*/React.createElement(Footer, null), /*#__PURE__*/React.createElement(Drawer, {
    isOn: drawer,
    onClose: () => setDrawer(false),
    onPick: () => {
      setDrawer(false);
      ping("Opening registration…");
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: `toast ${toast ? "is-on" : ""}`
  }, /*#__PURE__*/React.createElement(I.Check, null), " ", toast));
}
function Nav({
  onRegister
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: "nav"
  }, /*#__PURE__*/React.createElement("div", {
    className: "nav__in"
  }, /*#__PURE__*/React.createElement(Logo, {
    src: OM,
    size: 34
  }), /*#__PURE__*/React.createElement("div", {
    className: "nav__links"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#events"
  }, "Upcoming"), /*#__PURE__*/React.createElement("a", {
    href: "#about"
  }, "About"), /*#__PURE__*/React.createElement("a", {
    href: "#notify"
  }, "Notify me")), /*#__PURE__*/React.createElement("button", {
    className: "nav__menu",
    "aria-label": "Menu",
    style: iconBtn
  }, /*#__PURE__*/React.createElement(I.Menu, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto"
    },
    className: "nav__cta-wrap"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconRight: /*#__PURE__*/React.createElement(I.Arrow, {
      size: 14
    }),
    onClick: onRegister
  }, "Register"))));
}
function Hero({
  featured,
  onRegister
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap hero__in"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "hero__greet"
  }, "Hari Om \xB7 Welcome"), /*#__PURE__*/React.createElement("h1", {
    className: "hero__title"
  }, "Sacred gatherings, ", /*#__PURE__*/React.createElement("em", null, "satsangs & havans"), "."), /*#__PURE__*/React.createElement("p", {
    className: "hero__lede"
  }, "Register for the season's upcoming events at Chinmaya Mission. Every gathering is prepared with care \u2014 from seating and prasad to the sacred protocols that hold the room."), /*#__PURE__*/React.createElement("div", {
    className: "hero__stats"
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "This season",
    value: "3 events",
    display: true
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Open now",
    value: "2 open",
    display: true,
    accent: true
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Next gathering",
    value: "Jun 14",
    display: true
  }))), /*#__PURE__*/React.createElement(FeaturedCard, {
    event: featured,
    onRegister: onRegister
  })));
}
function Poster({
  poster
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `poster poster--${poster || "default"}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "poster__om"
  }, /*#__PURE__*/React.createElement("img", {
    src: OM,
    alt: ""
  })));
}
function FeaturedCard({
  event,
  onRegister
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "feat"
  }, /*#__PURE__*/React.createElement(Poster, {
    poster: event.poster
  }), /*#__PURE__*/React.createElement("div", {
    className: "feat__scrim"
  }), /*#__PURE__*/React.createElement("div", {
    className: "feat__top"
  }, /*#__PURE__*/React.createElement(StatusChip, {
    status: "featured"
  }, "Featured event"), /*#__PURE__*/React.createElement("span", {
    className: "feat__counter"
  }, event.spotsLeft, " spots \xB7 ", event.capacity, " cap")), /*#__PURE__*/React.createElement("div", {
    className: "feat__bottom"
  }, /*#__PURE__*/React.createElement("span", {
    className: "feat__kicker"
  }, event.weekday, " \xB7 ", event.day, " ", event.month, " ", event.year), /*#__PURE__*/React.createElement("h2", {
    className: "feat__name"
  }, event.name, " ", /*#__PURE__*/React.createElement("em", null, event.italic)), /*#__PURE__*/React.createElement("p", {
    className: "feat__when"
  }, event.time), /*#__PURE__*/React.createElement("div", {
    className: "feat__actions"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "gold",
    size: "lg",
    iconRight: /*#__PURE__*/React.createElement(I.Arrow, {
      size: 15
    }),
    onClick: onRegister
  }, "Register now"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "lg",
    onClick: onRegister
  }, "Event details"))));
}
function EventsList({
  events,
  tab,
  setTab,
  counts,
  onRegister
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "elist",
    id: "events"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "elist__head"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "elist__title"
  }, "All ", /*#__PURE__*/React.createElement("em", null, "events")), /*#__PURE__*/React.createElement(SegmentedTabs, {
    value: tab,
    onChange: setTab,
    tabs: [{
      id: "upcoming",
      label: "Upcoming",
      count: counts.upcoming
    }, {
      id: "past",
      label: "Past",
      count: counts.past
    }, {
      id: "all",
      label: "All",
      count: counts.all
    }]
  })), events.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "56px 0",
      textAlign: "center",
      color: "var(--ink-3)",
      fontFamily: "var(--serif)",
      fontStyle: "italic",
      fontSize: 22
    }
  }, "Nothing to show here yet.") : events.map(ev => /*#__PURE__*/React.createElement(EventRow, {
    key: ev.id,
    event: ev,
    onRegister: onRegister
  }))));
}
function EventRow({
  event,
  onRegister
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `erow ${event.status === "past" ? "is-past" : ""}`
  }, /*#__PURE__*/React.createElement(EventDateBlock, {
    day: event.day,
    month: event.month,
    year: event.year
  }), /*#__PURE__*/React.createElement("div", {
    className: "erow__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "erow__chips"
  }, /*#__PURE__*/React.createElement(StatusChip, {
    status: event.status === "open" ? "open" : event.status === "past" ? "past" : "soon"
  }, event.statusLabel), event.featured && /*#__PURE__*/React.createElement(StatusChip, {
    status: "featured"
  }, "Featured")), /*#__PURE__*/React.createElement("h3", {
    className: "erow__name"
  }, event.name, " ", /*#__PURE__*/React.createElement("em", null, event.italic)), /*#__PURE__*/React.createElement("p", {
    className: "erow__sub"
  }, event.sub)), /*#__PURE__*/React.createElement("div", {
    className: "erow__meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "erow__meta-line"
  }, /*#__PURE__*/React.createElement(I.Clock, {
    size: 15
  }), " ", event.weekday, ", ", event.time), /*#__PURE__*/React.createElement("div", {
    className: "erow__meta-line"
  }, /*#__PURE__*/React.createElement(I.Pin, {
    size: 15
  }), " ", event.location)), /*#__PURE__*/React.createElement("div", {
    className: "erow__actions"
  }, event.status === "open" && /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconRight: /*#__PURE__*/React.createElement(I.Arrow, {
      size: 14
    }),
    onClick: onRegister
  }, "Register"), event.status === "past" && /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: onRegister
  }, "View recap")));
}
function Welcome() {
  return /*#__PURE__*/React.createElement("section", {
    className: "welcome",
    id: "about"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap welcome__in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "welcome__portrait"
  }, /*#__PURE__*/React.createElement("img", {
    src: GURUDEV,
    alt: "Pujya Gurudev Swami Chinmayananda"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "welcome__greet"
  }, /*#__PURE__*/React.createElement("img", {
    src: OM,
    alt: ""
  }), " Hari Om!"), /*#__PURE__*/React.createElement("h2", {
    className: "welcome__title"
  }, "A note from the ", /*#__PURE__*/React.createElement("em", null, "Events Team")), /*#__PURE__*/React.createElement("div", {
    className: "welcome__body"
  }, /*#__PURE__*/React.createElement("p", null, "We are grateful that you are joining us for our special events, satsangs, and sacred gatherings. As our Chinmaya Mission family continues to grow, we strive to welcome every participant with love, respect, and the spirit of dedicated service."), /*#__PURE__*/React.createElement("p", null, "Advance registration helps us prepare each gathering with the care it deserves \u2014 seating, prasad and capacity \u2014 and lets us plan responsibly for all devotees in line with safety guidelines.")), /*#__PURE__*/React.createElement("div", {
    className: "welcome__sign"
  }, /*#__PURE__*/React.createElement("img", {
    src: OM,
    alt: ""
  }), /*#__PURE__*/React.createElement("div", null, "With Prem and Om,", /*#__PURE__*/React.createElement("strong", null, "The Events Team"))))));
}
function Notify({
  onDone
}) {
  const [email, setEmail] = useState("");
  const submit = e => {
    e.preventDefault();
    if (email.trim()) {
      onDone();
      setEmail("");
    }
  };
  return /*#__PURE__*/React.createElement("section", {
    className: "notify",
    id: "notify"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap notify__in"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: ".2em",
      textTransform: "uppercase",
      color: "var(--gold-light)"
    }
  }, "Stay in the loop"), /*#__PURE__*/React.createElement("h2", {
    className: "notify__title"
  }, "Be the first to know when new ", /*#__PURE__*/React.createElement("em", null, "satsangs"), " open."), /*#__PURE__*/React.createElement("p", {
    className: "notify__lede"
  }, "Two or three notes a season \u2014 never a flood. Festival dates, registration windows, and occasional invitations.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("form", {
    className: "notify__form",
    onSubmit: submit
  }, /*#__PURE__*/React.createElement("input", {
    type: "email",
    placeholder: "you@example.com",
    value: email,
    onChange: e => setEmail(e.target.value),
    "aria-label": "Email"
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "gold",
    type: "submit",
    iconRight: /*#__PURE__*/React.createElement(I.Arrow, {
      size: 14
    })
  }, "Notify me")), /*#__PURE__*/React.createElement("p", {
    className: "notify__small"
  }, "By subscribing you agree to receive occasional emails. Unsubscribe any time."))));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "footer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap footer__in"
  }, /*#__PURE__*/React.createElement(Logo, {
    src: OM,
    size: 52,
    tagline: "Events & Satsangs \xB7 est. 1982"
  }), /*#__PURE__*/React.createElement("div", {
    className: "footer__contact"
  }, /*#__PURE__*/React.createElement("a", {
    href: "mailto:events@chinmaya.org"
  }, /*#__PURE__*/React.createElement(I.Mail, null), " events@chinmaya.org"), /*#__PURE__*/React.createElement("a", {
    href: "tel:+10000000000"
  }, /*#__PURE__*/React.createElement(I.Phone, null), " (000) 000-0000")), /*#__PURE__*/React.createElement("p", {
    className: "footer__bless"
  }, /*#__PURE__*/React.createElement("img", {
    src: OM,
    alt: ""
  }), " May all beings be happy.")));
}
function Drawer({
  isOn,
  onClose,
  onPick
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `drawer ${isOn ? "is-on" : ""}`,
    onClick: onClose
  }, /*#__PURE__*/React.createElement("aside", {
    className: "drawer__panel",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("header", {
    className: "drawer__head"
  }, /*#__PURE__*/React.createElement(Logo, {
    src: OM,
    size: 32,
    wordmark: false
  }), /*#__PURE__*/React.createElement("h2", null, "Register for an ", /*#__PURE__*/React.createElement("em", null, "event")), /*#__PURE__*/React.createElement("button", {
    className: "drawer__close",
    onClick: onClose,
    "aria-label": "Close"
  }, /*#__PURE__*/React.createElement(I.X, null))), /*#__PURE__*/React.createElement("div", {
    className: "drawer__body"
  }, /*#__PURE__*/React.createElement("p", {
    className: "drawer__intro"
  }, "Hari Om! Pick an event to continue with details and registration."), EVENTS.map(ev => /*#__PURE__*/React.createElement("button", {
    key: ev.id,
    className: "regcard",
    disabled: ev.status === "past",
    onClick: onPick
  }, /*#__PURE__*/React.createElement("span", {
    className: "regcard__date"
  }, /*#__PURE__*/React.createElement("strong", null, ev.day), /*#__PURE__*/React.createElement("span", null, ev.month)), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "regcard__name"
  }, ev.name, " ", /*#__PURE__*/React.createElement("em", null, ev.italic)), /*#__PURE__*/React.createElement("span", {
    className: "regcard__meta"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(I.Clock, {
    size: 12
  }), " ", ev.weekday), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(I.Pin, {
    size: 12
  }), " ", ev.location.split("·")[0].trim()))), ev.status === "open" ? /*#__PURE__*/React.createElement(I.Arrow, {
    size: 18
  }) : /*#__PURE__*/React.createElement("span", {
    className: "regcard__closed"
  }, "Closed"))))));
}
const iconBtn = {
  width: 40,
  height: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  border: "1px solid var(--line-2)",
  background: "var(--surface)",
  color: "var(--ink-2)",
  cursor: "pointer"
};
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/events-site/EventsApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/events-site/data.jsx
try { (() => {
// Event data for the Events-site UI kit (recreation fixture).
const EVENTS = [{
  id: "hanuman-chalisa-2026",
  name: "Hanuman Chalisa Havan",
  italic: "2026",
  sub: "108 Chalisa recitations · sacred fire offering",
  sanskrit: "हनुमान चालीसा हवन",
  day: "14",
  month: "Jun",
  year: "2026",
  weekday: "Sunday",
  time: "9:00 AM – 1:00 PM",
  location: "Chinmaya Mission · Main Hall",
  poster: "hanuman",
  status: "open",
  statusLabel: "Registration open",
  spotsLeft: 84,
  capacity: 220,
  featured: true,
  blurb: "An immersive morning of collective recitation, sacred havan, and prasad. Limited capacity in alignment with fire-code and seating limits."
}, {
  id: "fathers-day-2026",
  name: "Father's Day",
  italic: "Satsang",
  sub: "A morning honouring our fathers",
  sanskrit: "पितृ दिवस",
  day: "21",
  month: "Jun",
  year: "2026",
  weekday: "Sunday",
  time: "10:00 AM – 12:30 PM",
  location: "Chinmaya Mission · Main Hall",
  poster: "father",
  status: "open",
  statusLabel: "Registration open",
  spotsLeft: 142,
  capacity: 180,
  featured: false,
  blurb: "A devotional gathering to honour and bless the fathers who anchor our families. Bhajans, talk and lunch."
}, {
  id: "mothers-day-2026",
  name: "Mother's Day",
  italic: "Satsang",
  sub: "Honouring all the mothers in our community",
  sanskrit: "मातृ दिवस",
  day: "10",
  month: "May",
  year: "2026",
  weekday: "Sunday",
  time: "10:00 AM – 12:30 PM",
  location: "Chinmaya Mission · Main Hall",
  poster: "mother",
  status: "past",
  statusLabel: "Completed",
  spotsLeft: 0,
  capacity: 180,
  featured: false,
  blurb: "Thank you to the 174 devotees who joined. Photos and recording available on request."
}];
window.EVENTS = EVENTS;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/events-site/data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/events-site/icons.jsx
try { (() => {
// Shared inline icon set — consistent 1.8 stroke, currentColor.
const I = {
  Cal: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 16,
    height: p.size || 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "5",
    width: "18",
    height: "16",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 3v4M16 3v4M3 10h18"
  })),
  Clock: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 16,
    height: p.size || 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7v5l3 2"
  })),
  Pin: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 16,
    height: p.size || 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "9",
    r: "2.5"
  })),
  Arrow: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 16,
    height: p.size || 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14M13 5l7 7-7 7"
  })),
  Check: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 16,
    height: p.size || 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12l4 4L19 6"
  })),
  X: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 18,
    height: p.size || 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 6l12 12M18 6L6 18"
  })),
  Mail: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 16,
    height: p.size || 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "5",
    width: "18",
    height: "14",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 7l9 7 9-7"
  })),
  Phone: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 16,
    height: p.size || 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"
  })),
  Menu: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 20,
    height: p.size || 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 7h16M4 12h16M4 17h16"
  })),
  Bell: p => /*#__PURE__*/React.createElement("svg", {
    width: p.size || 16,
    height: p.size || 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 21a2 2 0 0 0 4 0"
  }))
};
window.I = I;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/events-site/icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.CsvImport = __ds_scope.CsvImport;

__ds_ns.UserRoleRow = __ds_scope.UserRoleRow;

__ds_ns.MagicLinkLogin = __ds_scope.MagicLinkLogin;

__ds_ns.ChatBubble = __ds_scope.ChatBubble;

__ds_ns.ConversationRow = __ds_scope.ConversationRow;

__ds_ns.MessageComposer = __ds_scope.MessageComposer;

__ds_ns.Comment = __ds_scope.Comment;

__ds_ns.CommentComposer = __ds_scope.CommentComposer;

__ds_ns.CommentThread = __ds_scope.CommentThread;

__ds_ns.CenterRollupRow = __ds_scope.CenterRollupRow;

__ds_ns.ComplianceBar = __ds_scope.ComplianceBar;

__ds_ns.FeedCard = __ds_scope.FeedCard;

__ds_ns.PersonaSwitcher = __ds_scope.PersonaSwitcher;

__ds_ns.NotificationItem = __ds_scope.NotificationItem;

__ds_ns.PushPermissionPrompt = __ds_scope.PushPermissionPrompt;

__ds_ns.AuditEntry = __ds_scope.AuditEntry;

__ds_ns.ConsentCapture = __ds_scope.ConsentCapture;

__ds_ns.EventDateBlock = __ds_scope.EventDateBlock;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.RoleBadge = __ds_scope.RoleBadge;

__ds_ns.SegmentedTabs = __ds_scope.SegmentedTabs;

__ds_ns.StatTile = __ds_scope.StatTile;

__ds_ns.StatusChip = __ds_scope.StatusChip;

__ds_ns.Stepper = __ds_scope.Stepper;

})();
