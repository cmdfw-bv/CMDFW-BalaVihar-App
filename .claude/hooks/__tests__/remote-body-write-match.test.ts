import { describe, it, expect } from "vitest";
// @ts-expect-error - plain CJS helper, no types
import { remoteBodyWrites, looksLikeApiError } from "../_remote-body-write-match.js";

describe("remoteBodyWrites — which commands overwrite remote content from a local file", () => {
  it("catches gh issue edit --body-file", () => {
    expect(remoteBodyWrites("gh issue edit 9 --body-file /tmp/b.md")).toEqual(["/tmp/b.md"]);
  });

  it("catches gh pr edit --body-file", () => {
    expect(remoteBodyWrites("gh pr edit 50 --body-file ./body.md")).toEqual(["./body.md"]);
  });

  it("catches the --body-file=VALUE form", () => {
    expect(remoteBodyWrites("gh issue edit 9 --body-file=/tmp/b.md")).toEqual(["/tmp/b.md"]);
  });

  it("catches gh api PATCH --input", () => {
    expect(remoteBodyWrites("gh api -X PATCH repos/o/r/issues/9 --input /tmp/p.json")).toEqual(["/tmp/p.json"]);
  });

  it("catches gh api PUT --input", () => {
    expect(remoteBodyWrites("gh api --method PUT repos/o/r/x --input p.json")).toEqual(["p.json"]);
  });

  it("survives global flags before the subcommand", () => {
    expect(remoteBodyWrites("gh --repo o/r issue edit 9 --body-file b.md")).toEqual(["b.md"]);
  });

  // --- must NOT fire ---

  it("ignores creates — nothing existing is destroyed", () => {
    expect(remoteBodyWrites("gh issue create --body-file b.md")).toEqual([]);
  });

  it("ignores comments — additive, not an overwrite", () => {
    expect(remoteBodyWrites("gh issue comment 9 --body-file b.md")).toEqual([]);
  });

  it("ignores a POST to a subresource", () => {
    expect(remoteBodyWrites("gh api -X POST repos/o/r/issues/9/comments --input b.json")).toEqual([]);
  });

  it("ignores stdin bodies, which cannot be inspected", () => {
    expect(remoteBodyWrites("gh issue edit 9 --body-file -")).toEqual([]);
  });

  it("does not fire on a commit message that merely mentions the phrase", () => {
    expect(remoteBodyWrites("git commit -m 'use gh issue edit --body-file next time'")).toEqual([]);
  });

  it("ignores unrelated commands", () => {
    expect(remoteBodyWrites("npm test")).toEqual([]);
  });

  // Heredoc bodies are stdin DATA, never commands. A commit message describing the very failure this
  // hook guards against must not trip it — this fired on its own commit on first run.
  it("does not fire on a quoted heredoc body that describes the command", () => {
    const cmd = [
      "git commit -F - <<'EOF'",
      "fix: guard the read-modify-write round trip",
      "",
      "  gh issue view N --json body --jq .body > f && gh issue edit N --body-file f",
      "",
      "destroys the body when the read fails.",
      "EOF",
    ].join("\n");
    expect(remoteBodyWrites(cmd)).toEqual([]);
  });

  it("does not fire on an unquoted heredoc body", () => {
    const cmd = ["gh issue comment 9 --body-file - <<EOF", "gh pr edit 1 --body-file x.md", "EOF"].join("\n");
    expect(remoteBodyWrites(cmd)).toEqual([]);
  });

  it("still matches a real command that follows a heredoc", () => {
    const cmd = ["cat > note.md <<'EOF'", "gh issue edit 1 --body-file decoy.md", "EOF", "gh pr edit 50 --body-file real.md"].join("\n");
    expect(remoteBodyWrites(cmd)).toEqual(["real.md"]);
  });
});

describe("looksLikeApiError — does this file hold a failed fetch instead of content", () => {
  it("flags an empty file", () => {
    expect(looksLikeApiError("")).toBe(true);
  });

  it("flags a whitespace-only file", () => {
    expect(looksLikeApiError("\n  \n")).toBe(true);
  });

  it("flags the GitHub 503 body that caused this guard to exist", () => {
    expect(looksLikeApiError(
      "{\"message\": \"No server is currently available to service your request. Sorry about that.\"}"
    )).toBe(true);
  });

  it("flags a gh CLI error line", () => {
    expect(looksLikeApiError("gh: Not Found (HTTP 404)")).toBe(true);
  });

  it("flags a REST error envelope", () => {
    expect(looksLikeApiError(
      "{\"message\":\"Bad credentials\",\"documentation_url\":\"https://docs.github.com/rest\",\"status\":\"401\"}"
    )).toBe(true);
  });

  it("flags a rate-limit body", () => {
    expect(looksLikeApiError("{\"message\":\"API rate limit exceeded for user\"}")).toBe(true);
  });

  // --- must NOT fire ---

  it("passes a normal issue body", () => {
    expect(looksLikeApiError("## Backlog row\n\n| field | value |\n|---|---|\n| owner | System |")).toBe(false);
  });

  it("passes a short but legitimate body", () => {
    expect(looksLikeApiError("Fixes the thing.")).toBe(false);
  });

  it("passes a LONG body that quotes an API error — the false positive that matters", () => {
    const body =
      "## Why\n\nGitHub returned `No server is currently available to service your request` " +
      "repeatedly during this work, which is worth recording because it masked a real failure.\n\n" +
      "### Detail\n\n" +
      ("The fetch failed, the error text landed in the body file, and the subsequent write would have " +
        "clobbered the issue. We now guard against exactly that.\n\n").repeat(8);
    expect(body.length).toBeGreaterThan(1000);
    expect(looksLikeApiError(body)).toBe(false);
  });
});

// PR #74 review: the flag set was applied uniformly, but `-F` means --body-file on `issue/pr edit`
// and --field key=value on `gh api`. A routine typed parameter was being read as a filename.
describe("remoteBodyWrites — file flags are per-subcommand, not global", () => {
  it("does not treat gh api -F key=value as a body file", () => {
    expect(remoteBodyWrites("gh api --method PATCH repos/o/r/issues/9 -F milestone=3")).toEqual([]);
  });

  it("still honours -F as --body-file on issue edit", () => {
    expect(remoteBodyWrites("gh issue edit 9 -F body.md")).toEqual(["body.md"]);
  });

  it("honours --notes-file on release edit", () => {
    expect(remoteBodyWrites("gh release edit v1.0 --notes-file notes.md")).toEqual(["notes.md"]);
  });

  it("honours -F on release edit (its --notes-file shorthand)", () => {
    expect(remoteBodyWrites("gh release edit v1.0 -F notes.md")).toEqual(["notes.md"]);
  });

  it("ignores --input on issue edit, which has no such flag", () => {
    expect(remoteBodyWrites("gh issue edit 9 --input x.json")).toEqual([]);
  });
});

describe("looksLikeApiError — anchored errors win regardless of length", () => {
  it("flags a long HTML error page (a body is markdown, never an HTML document)", () => {
    const html = "<!DOCTYPE html>\n<html><body><h1>GitHub Unavailable</h1>\n" +
      "<p>HTTP 503 — please retry.</p>\n".repeat(40) + "</body></html>";
    expect(html.length).toBeGreaterThan(1000);
    expect(looksLikeApiError(html)).toBe(true);
  });

  it("flags a gh error followed by a lot of stale text", () => {
    expect(looksLikeApiError("gh: Not Found (HTTP 404)\n" + "x".repeat(1200))).toBe(true);
  });

  // These two were false positives before anchoring — both are legitimate short bodies.
  it("passes a short body that merely discusses an HTTP status", () => {
    expect(looksLikeApiError("## Bug\n\nWe should handle HTTP 404 from the fetch by retrying once.")).toBe(false);
  });

  it("passes a short body quoting a REST envelope inside a code fence", () => {
    expect(looksLikeApiError('Example response:\n```\n{"documentation_url": "https://docs.github.com/rest"}\n```')).toBe(false);
  });
});
