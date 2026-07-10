import { existsSync, copyFileSync } from "node:fs";
const src = ".env.example";
const dest = ".env";
if (!existsSync(src)) { console.error("✗ .env.example missing"); process.exit(1); }
if (existsSync(dest)) { console.log("• .env already exists — leaving it untouched"); process.exit(0); }
copyFileSync(src, dest);
console.log("✓ created .env from .env.example — fill in the blanks");
