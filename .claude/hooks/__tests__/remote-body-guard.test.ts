import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Exercises the hook SCRIPT, not just its matcher. The fail-open guarantee (never brick a session)
// and the exit-2 block only exist at this level, so nothing else can assert them.
const HOOK = resolve(__dirname, "../remote-body-guard.js");
let dir: string;

const run = (command: string, cwd = dir) => {
  const r = spawnSync("node", [HOOK], {
    input: JSON.stringify({ cwd, tool_input: { command } }),
    encoding: "utf8",
  });
  return { code: r.status, stderr: r.stderr };
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "rbg-"));
  writeFileSync(join(dir, "err.md"), '{"message": "No server is currently available to service your request."}');
  writeFileSync(join(dir, "good.md"), "## Backlog row\n\n| field | value |\n|---|---|\n| owner | System |\n");
  writeFileSync(join(dir, "empty.md"), "");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("remote-body-guard — blocks", () => {
  it("blocks the failed fetch that motivated this hook", () => {
    const r = run(`gh issue edit 9 --body-file ${dir}/err.md`);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("BLOCKED");
  });

  it("blocks an empty body file", () => {
    expect(run(`gh issue edit 9 --body-file ${dir}/empty.md`).code).toBe(2);
  });

  it("blocks gh api PATCH carrying an error payload", () => {
    expect(run(`gh api -X PATCH repos/o/r/issues/9 --input ${dir}/err.md`).code).toBe(2);
  });
});

describe("remote-body-guard — allows", () => {
  it("allows a legitimate edit with a real body", () => {
    expect(run(`gh issue edit 9 --body-file ${dir}/good.md`).code).toBe(0);
  });

  it("allows an additive comment even with the same bad payload", () => {
    expect(run(`gh issue comment 9 --body-file ${dir}/err.md`).code).toBe(0);
  });

  it("allows an unrelated command", () => {
    expect(run("npm test").code).toBe(0);
  });

  // PreToolUse fires BEFORE the command runs, so for a compound round trip the file on disk is not
  // the file that will be pushed. Blocking on its current contents rejects a correct, atomic,
  // &&-guarded command. Found in review of PR #74.
  it("allows when the same command writes the body file first (redirect)", () => {
    const cmd = `gh issue view 9 --json body --jq .body > ${dir}/fresh.md && gh issue edit 9 --body-file ${dir}/fresh.md`;
    expect(run(cmd).code).toBe(0);
  });

  // A missing file cannot be pushed — gh fails and nothing is destroyed. Blocking here only produced
  // a confusing message, and caught unresolvable paths ($VAR, ~) as collateral.
  it("allows a body file that does not exist — gh will fail on its own", () => {
    expect(run(`gh issue edit 9 --body-file ${dir}/nope.md`).code).toBe(0);
  });

  it("allows an unexpanded shell variable as the path", () => {
    expect(run("gh issue edit 9 --body-file $BODY").code).toBe(0);
  });
});

describe("remote-body-guard — fails open", () => {
  it("exits 0 on malformed stdin rather than bricking the session", () => {
    const r = spawnSync("node", [HOOK], { input: "not json", encoding: "utf8" });
    expect(r.status).toBe(0);
  });

  it("exits 0 on an empty payload", () => {
    const r = spawnSync("node", [HOOK], { input: "", encoding: "utf8" });
    expect(r.status).toBe(0);
  });
});
