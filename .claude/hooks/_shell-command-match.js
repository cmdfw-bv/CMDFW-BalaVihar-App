#!/usr/bin/env node
// Shared shell-command tokenizing helpers used by pr-guard.js and migration-guard.js (via
// _gh-pr-create-match.js / _migration-command-match.js).
// A raw whole-string regex (e.g. `/gh\s+pr\s+create/`) both misses real invocations — flags placed
// before the subcommand, like `gh --repo x pr create` (-R/--repo is a documented gh INHERITED FLAG)
// — and false-fires on unrelated commands that merely mention the phrase (a commit message, an echo
// string). These helpers split a command into shell segments (on ; & | \n, respecting quotes),
// unwrap one level of `npx <pkg>` / `bunx <pkg>` and `bash -c "..."` / `sh -c '...'` wrapping, and
// return each resolved invocation's tokens — so callers reason about which token is actually the
// invoked binary and subcommand, not about substrings anywhere in the raw string.
const SHELL_WRAPPERS = new Set(["bash", "sh", "zsh", "dash"]);
const PACKAGE_RUNNERS = new Set(["npx", "bunx"]);

// Heredoc bodies (`<<EOF ... EOF`, `<<'EOF' ... EOF`, and the `<<-` indented form) are stdin DATA —
// the shell never executes them. Left in place they are split on \n like any other text, so a body
// LINE THAT BEGINS WITH a gated command reads as an invocation. Prose mentioning a command mid-
// sentence was already safe (the first token is the prose word, not the binary); a line starting
// with it was not. Found 2026-08-17: remote-body-guard's own commit message contained an indented
// `gh issue view ... && gh issue edit --body-file f` line and the hook blocked its own commit.
// Returns [delimiter, isDashForm] for a line that OPENS a heredoc, else null.
// Must be quote-aware and herestring-aware. A plain regex is not: on `<<<` it fails at offset 0 but
// the engine retries at offset 1, matches the inner `<<`, and takes the herestring word as a
// delimiter that never arrives; and `<<` inside a quoted string matches unconditionally. Either way
// every following line is discarded as "body", which silently DISABLES pr-guard and migration-guard.
// Caught in review of PR #74 — a commit message reading `-m "... strip << heredoc bodies"` was enough.
function heredocOpener(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === "\\") { i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "<" && line[i + 1] === "<") {
      if (line[i + 2] === "<") { i += 2; continue; } // `<<<` is a herestring, not a heredoc
      const m = line.slice(i + 2).match(/^(-?)\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_][A-Za-z0-9_]*))/);
      if (m) return [m[2] || m[3] || m[4], m[1] === "-"];
      i += 1;
    }
  }
  return null;
}

// Heredoc bodies (`<<EOF ... EOF`, `<<'EOF' ... EOF`, and the `<<-` indented form) are stdin DATA —
// the shell never executes them. Left in place they are split on \n like any other text, so a body
// LINE THAT BEGINS WITH a gated command reads as an invocation. Prose mentioning a command
// mid-sentence is usually safe (the first token is the prose word), though `;`/`&`/`|` in the prose
// can still start a fresh segment — a line starting with the command was never safe.
// Found 2026-08-17: remote-body-guard's own commit message contained an indented
// `gh issue view ... && gh issue edit --body-file f` line and the hook blocked its own commit.
function stripHeredocs(cmd) {
  if (!cmd.includes("<<")) return cmd;
  const out = [];
  let terminator = null;
  let dashForm = false;
  for (const line of cmd.split("\n")) {
    if (terminator !== null) {
      // Only `<<-` permits an indented terminator; bash requires column 0 otherwise.
      const closes = dashForm ? line.trim() === terminator : line.replace(/\r$/, "") === terminator;
      if (closes) terminator = null; // closing delimiter; body discarded
      continue;
    }
    const opener = heredocOpener(line);
    out.push(line); // the opening line is a real command (`cat > f <<EOF`) and is kept
    if (opener) { terminator = opener[0]; dashForm = opener[1]; }
  }
  return out.join("\n");
}

function splitSegments(cmd) {
  const segments = [];
  let cur = "";
  let quote = null;
  for (const c of cmd) {
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === ";" || c === "&" || c === "|" || c === "\n") {
      segments.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  segments.push(cur);
  return segments;
}

function tokenize(segment) {
  const tokens = [];
  let cur = "";
  let quote = null;
  for (const c of segment) {
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (/\s/.test(c)) {
      if (cur) { tokens.push(cur); cur = ""; }
      continue;
    }
    if (c === "(" || c === ")") continue; // subshell punctuation
    cur += c;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

// Returns every resolved invocation (as a token array, binary first) found in `cmd` — one per
// shell segment, with `npx`/`bunx` package-runner prefixes stripped and one level of `bash -c` /
// `sh -c` wrapping unwrapped (recursively, so segments inside the wrapped string are included too).
function resolveInvocations(cmd) {
  const results = [];
  for (const segment of splitSegments(stripHeredocs(cmd))) {
    let tokens = tokenize(segment);
    // `VAR=value cmd ...` — the shell applies leading assignments to the environment and runs the
    // command after them. Left in place, tokens[0] is the assignment and every gate on this
    // tokenizer is bypassed (`GH_TOKEN=x gh pr create`, `PGPASSWORD=x supabase db push`).
    // Found in review of PR #74.
    while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens = tokens.slice(1);
    if (!tokens.length) continue;
    let bin = tokens[0].split("/").pop();

    if (PACKAGE_RUNNERS.has(bin)) {
      let i = 1;
      while (tokens[i] && tokens[i].startsWith("-")) i++;
      if (tokens[i]) {
        tokens = tokens.slice(i);
        bin = tokens[0].split("/").pop();
      }
    }

    if (SHELL_WRAPPERS.has(bin)) {
      const cIdx = tokens.indexOf("-c");
      if (cIdx !== -1 && tokens[cIdx + 1]) {
        results.push(...resolveInvocations(tokens[cIdx + 1]));
        continue;
      }
    }

    results.push(tokens);
  }
  return results;
}

function nonFlagTokens(tokens) {
  return tokens.slice(1).filter(t => !t.startsWith("-"));
}

function containsAdjacentSubsequence(arr, sub) {
  for (let i = 0; i + sub.length <= arr.length; i++) {
    let ok = true;
    for (let j = 0; j < sub.length; j++) {
      if (arr[i + j] !== sub[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

// Convenience for callers that only need a yes/no over the whole command (e.g. pr-guard, where
// there's nothing further to inspect once a match is found).
function findMatchingInvocation(cmd, binaries, subcommandWords) {
  for (const tokens of resolveInvocations(cmd)) {
    const bin = tokens[0].split("/").pop();
    if (binaries.has(bin) && containsAdjacentSubsequence(nonFlagTokens(tokens), subcommandWords)) {
      return tokens;
    }
  }
  return null;
}

module.exports = {
  stripHeredocs,
  splitSegments,
  tokenize,
  resolveInvocations,
  nonFlagTokens,
  containsAdjacentSubsequence,
  findMatchingInvocation,
};
