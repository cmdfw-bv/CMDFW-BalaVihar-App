// scripts/gen-theme.mjs
// ADR-0010/0011 — Sankalp token bridge.
// Reads design/sankalp/design-tokens.json (od-design-tokens/v1) and emits a typed,
// static lib/theme.ts for react-native-unistyles 3.
//
// What it does:
//   1. Resolves {dot.path} token references to their concrete value.
//   2. Pre-resolves any color-mix(...) expressions to a static hex (RN-native
//      cannot compute color-mix at runtime).
//   3. Emits the Unistyles `lightTheme` + `breakpoints` in the exact shape the
//      app already types against (typeof lightTheme), plus the od-design-tokens/v1
//      alias keys (bg / accent / brand / status / role) for backward compatibility.
//
// Idempotent: `npm run gen:theme` is safe to re-run. Do not hand-tune lib/theme.ts —
// edit design/sankalp/design-tokens.json and regenerate.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKENS = "design/sankalp/design-tokens.json";
const OUT = "lib/theme.ts";

if (!existsSync(TOKENS)) {
  console.log("• " + TOKENS + " not present yet — keeping the placeholder lib/theme.ts (ADR-0010).");
  process.exit(0);
}

const raw = JSON.parse(readFileSync(resolve(TOKENS), "utf8"));

/* ── reference + color-mix resolution ─────────────────────────────── */

function getPath(root, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), root);
}

// Resolve "{color.accent}" style references (recursively) against the root doc.
function resolveRefs(root, value, seen = new Set()) {
  if (typeof value !== "string") return value;
  const m = value.match(/^\{([^}]+)\}$/);
  if (!m) return value;
  const path = m[1];
  if (seen.has(path)) throw new Error("Circular token reference: " + path);
  seen.add(path);
  const target = getPath(root, path);
  if (target === undefined) throw new Error("Unresolved token reference: {" + path + "}");
  return resolveRefs(root, target, seen);
}

// Minimal sRGB color-mix(in srgb, #hex a%, #hex b%) resolver -> static #hex.
function hexToRgb(h) {
  const s = h.replace("#", "");
  const n = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbToHex(rgb) {
  return "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
function resolveColorMix(value) {
  if (typeof value !== "string" || !value.toLowerCase().includes("color-mix(")) return value;
  const inner = value.slice(value.indexOf("(") + 1, value.lastIndexOf(")"));
  const parts = inner.split(",").map((s) => s.trim());
  // parts[0] is the color space (e.g. "in srgb"); the rest are "color pct%"
  const stops = parts.slice(1).map((p) => {
    const [c, pct] = p.split(/\s+/);
    return { c, pct: pct ? parseFloat(pct) / 100 : null };
  });
  if (stops.length !== 2) return value; // only 2-stop mixes supported
  let [a, b] = stops;
  if (a.pct == null && b.pct == null) { a.pct = 0.5; b.pct = 0.5; }
  else if (a.pct == null) a.pct = 1 - b.pct;
  else if (b.pct == null) b.pct = 1 - a.pct;
  const total = a.pct + b.pct || 1;
  const ra = hexToRgb(a.c), rb = hexToRgb(b.c);
  return rgbToHex([0, 1, 2].map((i) => (ra[i] * a.pct + rb[i] * b.pct) / total));
}

function deepResolve(root, node) {
  if (node == null) return node;
  if (typeof node === "string") return resolveColorMix(resolveRefs(root, node));
  if (Array.isArray(node)) return node.map((v) => deepResolve(root, v));
  if (typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("_") || k === "$schema") continue;
      out[k] = deepResolve(root, v);
    }
    return out;
  }
  return node;
}

const t = deepResolve(raw, raw);
const c = t.color;

/* ── shape the theme (matches lib/unistyles.ts typeof lightTheme) ──── */

const lightTheme = {
  fonts: t.font,
  colors: {
    // od-design-tokens/v1 stable aliases (kept for backward compatibility)
    bg: c.bg,
    accent: c.accent, // terracotta — the single action color
    brand: c.brand,   // gold — identity accent (NOT an action color)
    status: { present: c.status.present, absent: c.status.absent, excused: c.status.excused, info: c.status.info },
    role: { student: c.role.student, parent: c.role.parent, teacher: c.role.teacher, coordinator: c.role.coordinator, admin: c.role.admin },

    // brand ramp (full)
    surface: c.surface,
    surfaceAlt: c.surfaceAlt,
    bgCream: c.bgCream,
    ink: c.ink, ink2: c.ink2, ink3: c.ink3, ink4: c.ink4,
    line: c.line, line2: c.line2,
    primary: c.accent, primaryPressed: c.accentPressed, primarySoft: c.accentSoft,
    indigo: c.indigo, indigo2: c.indigo2,
    gold: c.gold, gold2: c.gold2, goldLight: c.goldLight,
    onAction: c.onAction, onDark: c.onDark,

    // functional status ramp (full, incl. soft/line variants)
    statusRamp: c.status,
    // six role hues (data-coding only)
    roles: c.role,

    // app layer
    canvas: c.app.canvas,
    appSurface: c.app.surface,
    appSurface2: c.app.surface2,
    overlay: c.app.overlay,
    scope: c.app.scope,
    chatOut: c.app.chatOut, chatOutInk: c.app.chatOutInk,
    chatIn: c.app.chatIn, chatInInk: c.app.chatInInk, chatInLine: c.app.chatInLine, chatUnread: c.app.chatUnread,
    private: c.app.private, privateSoft: c.app.privateSoft, privateLine: c.app.privateLine,
  },
  space: t.space,
  radius: t.radius,
  type: { body: t.type.body, display: t.type.display, scale: t.type.scale, leading: t.type.leading, tracking: t.type.tracking },
  motion: { fast: t.motion.fast, base: t.motion.base, ease: t.motion.ease },
  chrome: t.chrome,
};

const breakpoints = t.breakpoints;

/* ── emit ──────────────────────────────────────────────────────────── */

const header =
  "// GENERATED by scripts/gen-theme.mjs from design/sankalp/design-tokens.json (od-design-tokens/v1).\n" +
  "// Real Sankalp values (ADR-0010/0011). color-mix() pre-resolved to static hex for RN-native.\n" +
  "// Do NOT hand-tune — edit design/sankalp/design-tokens.json and run `npm run gen:theme`.\n";

const body =
  "export const lightTheme = " + JSON.stringify(lightTheme, null, 2) + " as const;\n\n" +
  "export const breakpoints = " + JSON.stringify(breakpoints, null, 2) + " as const;\n" +
  "export type AppTheme = typeof lightTheme;\n";

writeFileSync(resolve(OUT), header + "\n" + body);
console.log("✓ design-tokens.json found — regenerated " + OUT + " with real Sankalp values.");
