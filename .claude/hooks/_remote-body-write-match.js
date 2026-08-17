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
const OVERWRITING_SUBCOMMANDS = [["issue", "edit"], ["pr", "edit"], ["release", "edit"], ["gist", "edit"]];
const OVERWRITING_METHODS = new Set(["PATCH", "PUT"]);
const FILE_FLAGS = new Set(["--body-file", "-F", "--input"]);

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

// Heredoc bodies are stdin DATA, not commands — the shell never executes them. Left in place they
// produce false positives on exactly the text most likely to describe this hook: a commit message
// explaining the round trip it guards. (This fired on its own commit message the first time it ran.)
// Strips `<<EOF ... EOF` and `<<'EOF' ... EOF`, including the `<<-` indented form.
function stripHeredocs(cmd) {
  if (!cmd.includes("<<")) return cmd;
  const lines = cmd.split("\n");
  const out = [];
  let terminator = null;
  for (const line of lines) {
    if (terminator !== null) {
      if (line.trim() === terminator) terminator = null; // closing delimiter; body discarded
      continue;
    }
    // A single line may open several heredocs; the last one opened closes last, but for our purpose
    // (discarding body text) tracking the first is sufficient and never under-strips.
    const m = line.match(/<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/);
    out.push(line);
    if (m) terminator = m[1] || m[2] || m[3];
  }
  return out.join("\n");
}

// Returns the list of local files whose contents would overwrite existing remote content.
// Empty array = this command is not an overwrite (or supplies its body on stdin, which we can't inspect).
function remoteBodyWrites(cmd) {
  const files = [];
  for (const tokens of resolveInvocations(stripHeredocs(cmd))) {
    if (tokens[0].split("/").pop() !== "gh") continue;
    const words = nonFlagTokens(tokens);

    const isEdit = OVERWRITING_SUBCOMMANDS.some(sub => containsAdjacentSubsequence(words, sub));
    // `gh api` only overwrites on PATCH/PUT; a POST creates a subresource (e.g. a comment).
    const isApiOverwrite =
      containsAdjacentSubsequence(words, ["api"]) && OVERWRITING_METHODS.has(methodOf(tokens));
    if (!isEdit && !isApiOverwrite) continue;

    for (const f of flagValues(tokens, FILE_FLAGS)) {
      if (f && f !== "-") files.push(f); // "-" is stdin: nothing on disk to inspect
    }
  }
  return files;
}

// Signatures of a failed fetch sitting where content should be.
const ERROR_SIGNATURES = [
  /^gh:\s/m,
  /No server is currently available/i,
  /"documentation_url"\s*:/,
  /API rate limit exceeded/i,
  /\bBad credentials\b/i,
  /^\s*\{\s*"message"\s*:/,
  /\bHTTP (4\d{2}|5\d{2})\b/,
];

// A real body can legitimately QUOTE an API error (this repo has issues that do exactly that), so a
// signature alone is not enough. Only treat it as a failed fetch when the file is also small enough
// that the error is plausibly the whole content — a genuine write-up carries much more around it.
const MAX_ERROR_BODY_BYTES = 1000;

function looksLikeApiError(text) {
  if (!text || !text.trim()) return true; // empty is never a legitimate replacement body
  if (text.length > MAX_ERROR_BODY_BYTES) return false;
  return ERROR_SIGNATURES.some(re => re.test(text));
}

module.exports = { remoteBodyWrites, looksLikeApiError, stripHeredocs, MAX_ERROR_BODY_BYTES };

if (require.main === module) {
  process.stdout.write(JSON.stringify(remoteBodyWrites(process.argv.slice(2).join(" "))));
}
