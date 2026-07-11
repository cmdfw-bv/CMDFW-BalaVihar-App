// scripts/_tracker-checks.js
// Pure helpers for the residency-scan CI job (scripts/check-trackers.js) — reuses the
// SAME denylist .claude/hooks/residency-guard.js already defines (ADR-0025: single source
// of truth, no drift between the local hook and CI).
const { TRACKER_PACKAGE_NAME_RE, stripComments, domainUsageRegex } = require("../.claude/hooks/_tracker-denylist.js");

function findTrackerPackageNames(names) {
  return names.filter((n) => TRACKER_PACKAGE_NAME_RE.test(n));
}

function findTrackerHostnames(sourceText) {
  const stripped = stripComments(sourceText);
  const match = stripped.match(domainUsageRegex());
  return match ? match[1] : null;
}

module.exports = { findTrackerPackageNames, findTrackerHostnames };
