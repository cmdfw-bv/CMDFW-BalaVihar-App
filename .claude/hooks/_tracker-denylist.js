// .claude/hooks/_tracker-denylist.js
// Single source of truth for the residency/tracker denylist (ADR-0025). Consumed by:
//  - .claude/hooks/residency-guard.js (local, advisory, fail-open PreToolUse check)
//  - scripts/check-trackers.js (CI, required, fail-closed residency-scan job)
const TRACKER_DOMAINS = [
  "google-analytics.com", "googletagmanager.com", "connect.facebook.net", "facebook.com/tr",
  "mixpanel.com", "cdn.segment.com", "cdn.segment.io", "api.amplitude.com",
  "static.hotjar.com", "fullstory.com",
];

const TRACKER_PACKAGE_NAMES =
  "react-ga4?|mixpanel-browser|amplitude-js|@amplitude\\/[\\w-]+|@segment\\/[\\w-]+|analytics-node|@fullstory\\/[\\w-]+|@hotjar\\/[\\w-]+";

// Matches a bare, parsed dependency name (e.g. from package.json's parsed JSON, or a
// lockfile package-path's trailing segment) — no surrounding quotes.
const TRACKER_PACKAGE_NAME_RE = new RegExp("^(" + TRACKER_PACKAGE_NAMES + ")$", "i");

// Matches the same names occurring quoted in raw file text (e.g. scanning package.json's
// literal source rather than its parsed form).
const TRACKER_PACKAGE_RE = new RegExp('"(' + TRACKER_PACKAGE_NAMES + ')"', "i");

function stripComments(text) {
  return text.replace(/(?<!:)\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function domainUsageRegex() {
  const dom = TRACKER_DOMAINS.map((s) => s.replace(/[.]/g, "\\.")).join("|");
  // Require the domain inside a quote or right after a URL scheme — i.e. actually used, not named.
  return new RegExp("(?:https?://|['\"`])(?:www\\.)?(" + dom + ")", "i");
}

module.exports = { TRACKER_DOMAINS, TRACKER_PACKAGE_RE, TRACKER_PACKAGE_NAME_RE, stripComments, domainUsageRegex };
