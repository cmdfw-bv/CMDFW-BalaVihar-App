#!/usr/bin/env node
// Regenerates (or, with --check, verifies) the ADR index block in .docs/adr/README.md FROM
// the ADR files themselves — the files are the single source of truth. Thin I/O wrapper over
// the pure logic in _adr-index.mjs (unit-tested in scripts/__tests__/adr-index.test.ts).
//
//   npm run gen:adr-index            regenerate and write the index
//   node scripts/gen-adr-index.mjs --check   CI gate: fail if the index is stale OR any ADR is invalid
//
// Fail-CLOSED: an unreadable/invalid ADR, a duplicate id, an unknown category, or missing
// markers exits non-zero with a NAMED reason. See ADR-2026-08-21-adr-identifier-scheme.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAdr, validateAll, buildIndexBlock, renderReadme } from './_adr-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADR_DIR = path.join(ROOT, '.docs/adr');
const README = path.join(ADR_DIR, 'README.md');
const CHECK = process.argv.includes('--check');

const fail = (lines) => {
  for (const l of lines) console.error(`✗ ${l}`);
  process.exit(1);
};

// Every .md in the ADR dir except the README is treated as an ADR and must be valid — so a
// stray or mis-named file can't slip in undocumented. Sorted for deterministic processing.
let files;
try {
  files = fs.readdirSync(ADR_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
} catch (e) {
  fail([`could not read ${ADR_DIR} (${e.message})`]);
}

const adrs = files.map((f) => {
  try {
    return parseAdr(f, fs.readFileSync(path.join(ADR_DIR, f), 'utf8'));
  } catch (e) {
    fail([`could not read ${f} (${e.message})`]);
  }
});

const errors = validateAll(adrs);
if (errors.length) {
  fail([`${errors.length} ADR problem(s) found:`, ...errors, 'Fix the ADR file(s) above, then re-run `npm run gen:adr-index`.']);
}

let readmeText;
try {
  readmeText = fs.readFileSync(README, 'utf8');
} catch (e) {
  fail([`could not read ${README} (${e.message})`]);
}

const { readme, error } = renderReadme(readmeText, buildIndexBlock(adrs));
if (error) fail([error]);

if (CHECK) {
  if (readme !== readmeText) {
    fail(['.docs/adr/README.md is out of sync with the ADR files. Run `npm run gen:adr-index` and commit.']);
  }
  console.log(`✓ ADR index is in sync with the files (${adrs.length} ADRs).`);
} else {
  fs.writeFileSync(README, readme);
  console.log(`✓ Regenerated ADR index (${adrs.length} ADRs).`);
}
