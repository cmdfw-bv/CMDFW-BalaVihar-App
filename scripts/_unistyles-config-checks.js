// scripts/_unistyles-config-checks.js
// Pure helpers for the unistyles-config-scan CI job (scripts/check-unistyles-config.js).
// Guards issue #29's root cause: Expo Router's static-export manifest builder
// (getBuildTimeServerManifestAsync) requires layout files like app/(tabs)/_layout.tsx
// standalone, outside the real render tree, so root app/_layout.tsx's "../lib/unistyles"
// import never runs first in that pass. Any file with a module-scope StyleSheet.create()
// must import lib/unistyles directly itself — Metro dedupes by resolved path, so
// StyleSheet.configure() still only runs once even if many files import it.
const path = require("node:path");

const UNISTYLES_CONFIG_MODULE = "lib/unistyles";

function hasStyleSheetCreate(sourceText) {
  return /\bStyleSheet\.create\s*\(/.test(sourceText) && /from\s+["']react-native-unistyles["']/.test(sourceText);
}

function importsUnistylesConfig(filePath, sourceText) {
  const importRe = /import\s+(?:[^'"]*\sfrom\s+)?["']([^"']+)["']/g;
  let match;
  while ((match = importRe.exec(sourceText)) !== null) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filePath), specifier));
    if (resolved === UNISTYLES_CONFIG_MODULE) return true;
  }
  return false;
}

// Returns true when `filePath` needs (but lacks) a direct import of lib/unistyles.
function findMissingUnistylesConfigImport(filePath, sourceText) {
  if (filePath === `${UNISTYLES_CONFIG_MODULE}.ts`) return false;
  if (!hasStyleSheetCreate(sourceText)) return false;
  return !importsUnistylesConfig(filePath, sourceText);
}

module.exports = { findMissingUnistylesConfigImport };
