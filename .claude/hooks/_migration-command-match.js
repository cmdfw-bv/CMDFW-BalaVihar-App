#!/usr/bin/env node
// Shared helper: does a Bash command string push Supabase migrations to a REMOTE project?
// See _shell-command-match.js for why this is tokenized rather than a raw regex over the whole
// command string. Structural rule (§6.3, §11.3), decided per resolved invocation (not by scanning
// flags across the whole raw string — a chained command with multiple `supabase` invocations must
// not let one invocation's `--local` mask another's remote push):
//   - `supabase db push`      defaults to the linked REMOTE project  -> gated (unless --local)
//   - `supabase migration up` defaults to LOCAL                      -> gated only with --linked/--db-url
//   - `--local`               -> always allowed (local dev)
//   - anything else (csv-import, data loads, `db reset`, ...) -> never gated
const { resolveInvocations, nonFlagTokens, containsAdjacentSubsequence } = require("./_shell-command-match.js");

function classifyInvocation(tokens) {
  const bin = tokens[0].split("/").pop();
  if (bin !== "supabase") return null;

  const nonFlag = nonFlagTokens(tokens);
  const isPush = containsAdjacentSubsequence(nonFlag, ["db", "push"]);
  const isMigUp = containsAdjacentSubsequence(nonFlag, ["migration", "up"]);
  if (!isPush && !isMigUp) return null; // not a schema-migration command (e.g. csv-import)

  const hasLocal = tokens.some(t => t === "--local" || t.startsWith("--local="));
  const hasRemoteFlag = tokens.some(t => t === "--linked" || t.startsWith("--linked=") || t.startsWith("--db-url"));

  let remote;
  if (hasLocal) remote = false;
  else if (hasRemoteFlag) remote = true;
  else if (isPush) remote = true; // db push defaults to the linked remote project
  else remote = false;            // migration up defaults to local

  return { isPush, isMigUp, remote };
}

function isRemoteMigrationPush(cmd) {
  return resolveInvocations(cmd).some(tokens => {
    const c = classifyInvocation(tokens);
    return !!(c && c.remote);
  });
}

module.exports = { isRemoteMigrationPush, classifyInvocation };

if (require.main === module) {
  const cmd = process.argv.slice(2).join(" ");
  process.stdout.write(String(isRemoteMigrationPush(cmd)));
}
