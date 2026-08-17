#!/usr/bin/env node
// Shared helper: does a Bash command OVERWRITE existing remote content from a local file, and does
// that file actually hold content rather than a failed fetch?
//
// The read-modify-write round trip (`gh issue view ... > f` -> edit f -> `gh issue edit --body-file f`)
// silently destroys the remote body when the READ fails: the error text lands in f, and the write
// pushes it. Observed 2026-08-17 against issue #9 during a GitHub 503 window — the write only failed
// to land because the API was still down. See _shell-command-match.js for why this is tokenized
// rather than regex-matched.
//
// Deliberately narrow: only operations that REPLACE something that already exists. Creates and
// comments are additive and recoverable, so they are not gated.
const { resolveInvocations, nonFlagTokens, containsAdjacentSubsequence } = require("./_shell-command-match.js");

// `gh <thing> edit` replaces a body wholesale. Creates/comments are additive — excluded on purpose.
//
// Flags are per-subcommand, NOT a single global set: `-F` is the --body-file shorthand on
// `issue`/`pr edit` and the --notes-file shorthand on `release edit`, but on `gh api` it is
// `--field key=value`. Treating it globally read a routine typed parameter (`-F milestone=3`) as a
// filename and blocked an entirely safe PATCH. Found in review of PR #74.
//
// `gist edit` is deliberately absent: it has no read-body-from-file flag (`-f/--filename` selects a
// file *within* the gist, `-a/--add` adds one), so there is nothing of this shape to gate. Listing it
// with no matching flag made the coverage look broader than it was.
const OVERWRITING_SUBCOMMANDS = [
  { words: ["issue", "edit"], fileFlags: new Set(["--body-file", "-F"]) },
  { words: ["pr", "edit"], fileFlags: new Set(["--body-file", "-F"]) },
  { words: ["release", "edit"], fileFlags: new Set(["--notes-file", "-F"]) },
];
const OVERWRITING_METHODS = new Set(["PATCH", "PUT"]);
const API_FILE_FLAGS = new Set(["--input"]);

// Read the value of a flag in either `--flag value` or `--flag=value` form.
function flagValues(tokens, flagNames) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const eq = t.indexOf("=");
    if (eq > 0 && flagNames.has(t.slice(0, eq))) {
      out.push(t.slice(eq + 1));
    } else if (flagNames.has(t) && i + 1 < tokens.length) {
      out.push(tokens[i + 1]);
    }
  }
  return out;
}

function methodOf(tokens) {
  const v = flagValues(tokens, new Set(["-X", "--method"]));
  return v.length ? v[v.length - 1].toUpperCase() : null;
}

// Returns the list of local files whose contents would overwrite existing remote content.
// Empty array = this command is not an overwrite (or supplies its body on stdin, which we can't inspect).
// Heredoc bodies are stripped by resolveInvocations — see stripHeredocs in _shell-command-match.js.
function remoteBodyWrites(cmd) {
  const files = [];
  for (const tokens of resolveInvocations(cmd)) {
    if (tokens[0].split("/").pop() !== "gh") continue;
    const words = nonFlagTokens(tokens);

    const edit = OVERWRITING_SUBCOMMANDS.find(sub => containsAdjacentSubsequence(words, sub.words));
    // `gh api` only overwrites on PATCH/PUT; a POST creates a subresource (e.g. a comment).
    const isApiOverwrite =
      containsAdjacentSubsequence(words, ["api"]) && OVERWRITING_METHODS.has(methodOf(tokens));
    if (!edit && !isApiOverwrite) continue;

    for (const f of flagValues(tokens, edit ? edit.fileFlags : API_FILE_FLAGS)) {
      if (f && f !== "-") files.push(f); // "-" is stdin: nothing on disk to inspect
    }
  }
  return files;
}

// ANCHORED signatures: the error IS the file, so length is irrelevant. `gh` writes its failure as the
// entire output, and an HTML error page is never a legitimate body (GitHub bodies are markdown).
// Length alone used to exonerate these — a 1.2KB proxy error page during the exact 503 window this
// hook exists for sailed through. Found in review of PR #74.
const ANCHORED_ERROR_SIGNATURES = [
  /^\s*gh:\s/,
  /^\s*\{\s*"message"\s*:/,
  /^\s*<!doctype html/i,
  /^\s*<html[\s>]/i,
];

// UNANCHORED signatures: suggestive, but a real body can legitimately QUOTE them, so they only count
// when the file is also small enough that the error is plausibly the whole content.
// Deliberately excludes /\bHTTP \d{3}\b/ and /"documentation_url":/ — both appear in legitimate short
// bodies discussing error handling, and any genuine occurrence of them is already caught anchored
// above (`gh: ... (HTTP 404)`, `{"message":...,"documentation_url":...}`).
const ERROR_SIGNATURES = [
  /No server is currently available/i,
  /API rate limit exceeded/i,
  /\bBad credentials\b/i,
];

const MAX_ERROR_BODY_BYTES = 1000;

function looksLikeApiError(text) {
  if (!text || !text.trim()) return true; // empty is never a legitimate replacement body
  if (ANCHORED_ERROR_SIGNATURES.some(re => re.test(text))) return true;
  if (text.length > MAX_ERROR_BODY_BYTES) return false;
  return ERROR_SIGNATURES.some(re => re.test(text));
}

module.exports = { remoteBodyWrites, looksLikeApiError, MAX_ERROR_BODY_BYTES };

if (require.main === module) {
  process.stdout.write(JSON.stringify(remoteBodyWrites(process.argv.slice(2).join(" "))));
}
