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
  for (const segment of splitSegments(cmd)) {
    let tokens = tokenize(segment);
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
  splitSegments,
  tokenize,
  resolveInvocations,
  nonFlagTokens,
  containsAdjacentSubsequence,
  findMatchingInvocation,
};
