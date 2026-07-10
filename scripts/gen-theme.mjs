import { existsSync } from "node:fs";
const tokens = "design/sankalp/design-tokens.json";
if (!existsSync(tokens)) {
  console.log("• " + tokens + " not present yet — keeping the placeholder lib/theme.ts (ADR-0010).");
  process.exit(0);
}
// When Sankalp lands: read tokens, pre-resolve color-mix(), and emit lib/theme.ts.
console.log("✓ design-tokens.json found — TODO(impl when Sankalp imports): regenerate lib/theme.ts");
