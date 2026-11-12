#!/usr/bin/env node
// PreToolUse on Edit|Write|MultiEdit: files that must not change silently.
// - .env*            : secrets never belong in the repo
// - lockfiles        : only the package manager writes them
// - requirements doc : only via /requirement-change (owner's explicit request), see CLAUDE.md > Yasaklar 12
import { readFileSync } from "node:fs";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const fp = String(input.tool_input?.file_path ?? "").replace(/\\/g, "/");
if (!fp) process.exit(0);

const rules = [
  { re: /(^|\/)\.env(\..*)?$/, why: ".env dosyaları depoya girmez; gizli bilgi yok (G-07)." },
  {
    re: /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/,
    why: "Kilit dosyalarını yalnızca paket yöneticisi yazar (npm install --save-exact ...).",
  },
  {
    re: /(^|\/)docs\/plan\/01-gereksinimler\.md$/,
    why: "Gereksinim kataloğu yalnızca sahibin açık isteğiyle /requirement-change ile değişir (CLAUDE.md > Yasaklar 12).",
  },
];

if (process.env.HOTEL_CRM_ALLOW_PROTECTED === "1") process.exit(0); // used by /requirement-change

for (const rule of rules) {
  if (rule.re.test(fp)) {
    process.stderr.write(`Engellendi: ${fp}\n${rule.why}\n`);
    process.exit(2);
  }
}
process.exit(0);
