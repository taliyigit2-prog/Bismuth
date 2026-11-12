#!/usr/bin/env node
// PreToolUse on Bash (npm install / npm i / pnpm add / yarn add): block packages that contradict G-07
// (no telemetry, no auto-update, no cloud SDKs) and require exact versions. Only the package-manager
// segment of a compound shell command is inspected (so `sed -i` elsewhere is not mistaken for `npm i`).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const cmd = String(input.tool_input?.command ?? "");

// Split on shell separators and keep the segments that are package-manager installs.
const segments = cmd
  .split(/&&|\|\||;|\||\n/)
  .map((s) => s.trim())
  .map((s) => s.match(/^(?:\S+=\S+\s+)*(npm|pnpm|yarn)\s+(install|i|add)\b(.*)$/))
  .filter(Boolean);
if (segments.length === 0) process.exit(0);

const blocked = [
  /^electron-updater(@|$)/,
  /^@sentry\//,
  /^posthog/,
  /^mixpanel/,
  /^firebase(@|$)/,
  /^@segment\//,
  /^analytics-node/,
  /^amplitude/,
  /^@amplitude\//,
  /^bugsnag/,
  /^@bugsnag\//,
  /^newrelic/,
  /^dd-trace/,
  /^@datadog\//,
];

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
let saveExact = false;
for (const dir of [input.cwd, root].filter(Boolean)) {
  const npmrc = join(dir, ".npmrc");
  if (existsSync(npmrc) && /save-exact\s*=\s*true/.test(readFileSync(npmrc, "utf8"))) saveExact = true;
}

for (const [, , , rest] of segments) {
  const tokens = rest.split(/\s+/).filter(Boolean);
  const flags = tokens.filter((t) => t.startsWith("-"));
  const pkgs = tokens.filter((t) => !t.startsWith("-") && !/^\d?>/.test(t) && !/^[<>]/.test(t));
  for (const p of pkgs) {
    if (blocked.some((re) => re.test(p))) {
      process.stderr.write(`Engellendi: "${p}" telemetri/otomatik güncelleme/bulut SDK'sı (CLAUDE.md > Yasaklar 4, G-07).\n`);
      process.exit(2);
    }
  }
  const exact = saveExact || flags.some((f) => f === "--save-exact" || f === "-E" || f === "--exact");
  if (pkgs.length > 0 && !exact) {
    process.stderr.write(
      `Engellendi: bağımlılıklar sabit sürümle eklenir. ".npmrc" içine "save-exact=true" yaz ya da --save-exact kullan (G-07).\n`,
    );
    process.exit(2);
  }
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      additionalContext: "Hatırlatma: yeni bağımlılığı docs/plan/bagimliliklar.md dosyasına ekle (ne için, lisans, sürüm).",
    },
  }),
);
process.exit(0);
