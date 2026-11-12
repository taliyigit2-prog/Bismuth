#!/usr/bin/env node
// PostToolUse on Edit|Write|MultiEdit: network code is allowed only in three places:
//   src/main/network/          optional external data (market FX rates, holiday check, weather)
//   src/main/server/           host mode: embedded HTTP server for client devices (G-140)
//   src/renderer/lib/transport/ client mode: the one place the UI talks to a host over HTTP (G-141)
// Everywhere else it violates G-01/G-02 (no CDN, no third-party calls, no hidden network use).
import { readFileSync } from "node:fs";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const fp = String(input.tool_input?.file_path ?? "").replace(/\\/g, "/");
if (!fp || !/\.(ts|tsx|js|jsx|mjs|cjs|html|css)$/.test(fp)) process.exit(0);
if (/(^|\/)src\/main\/(network|server)\//.test(fp)) process.exit(0);
if (/(^|\/)src\/renderer\/lib\/transport\//.test(fp)) process.exit(0);
// prototypes/ holds Faz 0 spike code (live API checks etc.), never shipped in the product bundle.
if (/(^|\/)(tests?|__tests__|e2e|scripts|prototypes|\.github|docs|\.claude)\//.test(fp)) process.exit(0);
if (/\.(test|spec)\.(ts|tsx|js)$/.test(fp)) process.exit(0);

const text = String(input.tool_input?.new_string ?? input.tool_input?.content ?? "");
if (!text) process.exit(0);

const patterns = [
  { re: /\bfetch\s*\(/, what: "fetch(" },
  { re: /\baxios\b/, what: "axios" },
  { re: /\bXMLHttpRequest\b/, what: "XMLHttpRequest" },
  { re: /\bnew\s+WebSocket\b/, what: "WebSocket" },
  { re: /\bnet\.request\s*\(/, what: "net.request(" },
  { re: /\bhttps?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/i, what: "dış URL" },
  { re: /<link[^>]+href=["']https?:\/\//i, what: "CDN stylesheet" },
  { re: /<script[^>]+src=["']https?:\/\//i, what: "CDN script" },
  { re: /@import\s+url\(["']?https?:\/\//i, what: "CSS @import (uzak)" },
];
const hits = patterns.filter((p) => p.re.test(text)).map((p) => p.what);
if (hits.length === 0) process.exit(0);

process.stderr.write(
  `Ağ kuralı ihlali: ${fp} içinde ${hits.join(", ")} bulundu.\n` +
    `Ağ kodu yalnızca src/main/network/ (dış veri), src/main/server/ (sunucu modu) ve src/renderer/lib/transport/ (istemci modu) içinde olabilir (CLAUDE.md > Yasaklar 1; G-01, G-02, G-140). ` +
    `Değişikliği geri al ya da kodu bu klasörlerden birine taşı; kaynaklar (font, simge, veri) paket içinden yüklenir.\n`,
);
process.exit(2);
