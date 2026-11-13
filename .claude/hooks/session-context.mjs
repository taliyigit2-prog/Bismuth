#!/usr/bin/env node
// SessionStart (startup|resume|compact): prints the current phase, git state and the hard rules
// so every session (and every post-compaction context) starts from the same facts.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  /* no stdin */
}
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

const lines = [];
const durum = join(root, "docs", "plan", "fazlar", "DURUM.md");
if (existsSync(durum)) {
  const text = readFileSync(durum, "utf8");
  const current = text.split("\n").find((l) => l.startsWith("**Şu anki faz:**"));
  if (current) lines.push(current.replace(/\*\*/g, ""));
}
// Uninterrupted execution (K-39): the next wave and its open packages come from YURUTME.md so a post-compaction
// context resumes from the same place (docs/analiz/OPUS-BASLANGIC.md, /orkestra).
const yurutme = join(root, "docs", "plan", "fazlar", "YURUTME.md");
if (existsSync(yurutme)) {
  const rows = readFileSync(yurutme, "utf8")
    .split("\n")
    .filter((l) => /^\|\s*\d+\s*\|/.test(l) && /(🔄|⬜)/.test(l))
    .slice(0, 8)
    .map((l) => l.replace(/\s*\|\s*/g, " | ").trim());
  if (rows.length) lines.push(`YURUTME.md açık paketler (ilk ${rows.length}): ${rows.join(" ;; ")}`);
}
try {
  const status = execFileSync("git", ["status", "--short"], { cwd: root, stdio: "pipe" })
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(0, 20);
  lines.push(status.length ? `git status (ilk 20): ${status.join(" | ")}` : "git status: temiz");
} catch {
  /* not a git repo */
}
lines.push(
  "Yasaklar: internet şartı yok · OTA entegrasyonu yok · fatura yok · telemetri/otomatik güncelleme yok · " +
    "tek giriş · para tam sayı kuruş · yetki servis katmanında · metin tr.json'da · migrasyon değişmez · otel kuralı = ayar.",
);
lines.push("Devam etmek için: docs/plan/fazlar/YURUTME.md (dalga/paket durumu) ve DURUM.md'yi oku; otonom yürütme /orkestra, tek faz /phase-runner NN.");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
  }),
);
process.exit(0);
