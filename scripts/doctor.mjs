import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";

let hardFail = false;
const ok = (m) => console.log("  ✓ " + m);
const warn = (m) => console.log("  ⚠ " + m);
const bad = (m) => { console.log("  ✗ " + m); hardFail = true; };
const has = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); return true; } catch { return false; } };

console.log("\nBala Vihar — environment doctor\n");

// Node floor
const major = Number(process.versions.node.split(".")[0]);
major >= 20 ? ok(`Node ${process.versions.node} (>= 20.19 floor)`) : bad(`Node ${process.versions.node} too old — need >= 20.19; run "nvm use"`);

// .nvmrc recommended match (warn only)
if (existsSync(".nvmrc")) {
  const want = readFileSync(".nvmrc", "utf8").trim();
  major === Number(want) ? ok(`Node matches .nvmrc (${want})`) : warn(`Node ${major} ≠ recommended ${want} (.nvmrc) — fine to proceed; "nvm use" for the tested version`);
}

has("npm -v") ? ok("npm present") : bad("npm missing");
has("git --version") ? ok("git present") : warn("git missing");

// CLIs (resolved via the project's devDeps → npx)
has("npx --no-install supabase --version") ? ok("Supabase CLI resolvable") : bad('Supabase CLI missing — run "npm install"');
has("npx --no-install netlify --version") ? ok("Netlify CLI resolvable") : bad('Netlify CLI missing — run "npm install"');

// Docker (hard for `dev`, not for app-only `start`)
has("docker info") ? ok("Docker running (local DB available)") : warn('Docker not running — `npm run start` (app-only) works; `npm run dev` needs Docker Desktop');

// .env present
existsSync(".env") ? ok(".env present") : warn('.env missing — run "npm run env:init"');

// Ports (warn if occupied)
const checkPort = (p, who) => new Promise((res) => {
  const s = createServer().once("error", () => { warn(`port ${p} in use (${who}) — stop the other process or override`); res(); })
    .once("listening", () => s.close(() => { ok(`port ${p} free (${who})`); res(); })).listen(p, "127.0.0.1");
});
await checkPort(54321, "Supabase");
await checkPort(8081, "Expo");
await checkPort(8888, "Netlify");

console.log("");
if (hardFail) { console.log("✗ doctor failed — fix the ✗ items above.\n"); process.exit(1); }
console.log("✓ doctor passed.\n");
