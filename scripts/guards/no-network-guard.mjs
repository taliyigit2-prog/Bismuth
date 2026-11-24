#!/usr/bin/env node
// PostToolUse / PreToolUse on write/edit: network code is allowed only in five places:
//   src/main/network/          optional external data (market FX rates, holiday check, weather, Telegram K-50)
//   src/main/server/           host mode: embedded HTTP server for client devices (G-140)
//   src/main/discovery/        server mode: local-network announcement (mDNS, never internet)
//   src/renderer/lib/transport/ client mode: the one place the UI talks to a host over HTTP (G-141)
//   src/main/camera/           camera sidecar (K-49): ONLY 127.0.0.1 / localhost (the Python sidecar) and rtsp://
//                              (the camera itself); fetch is allowed there, but any other http(s)/ws(s) target, any
//                              outside URL and binding 0.0.0.0 are not.
// Everywhere else it violates G-01/G-02 (no CDN, no third-party calls, no hidden network use).
import { readFileSync } from 'node:fs'

let input
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0)
}
const fp = String(input.tool_input?.file_path ?? '').replace(/\\/g, '/')
if (!fp || !/\.(ts|tsx|js|jsx|mjs|cjs|html|css)$/.test(fp)) process.exit(0)
if (/(^|\/)src\/main\/(network|server|discovery)\//.test(fp)) process.exit(0)
if (/(^|\/)src\/renderer\/lib\/transport\//.test(fp)) process.exit(0)
if (/(^|\/)(tests?|__tests__|e2e|scripts|\.github|docs|\.agent)\//.test(fp)) process.exit(0)
if (/\.(test|spec)\.(ts|tsx|js)$/.test(fp)) process.exit(0)

let text = String(input.tool_input?.new_string ?? input.tool_input?.content ?? '')
if (!text) process.exit(0)
const inCamera = /(^|\/)src\/main\/camera\//.test(fp)
// The camera search file (P20g, K-59) writes ONVIF/WS-Discovery messages: their XML namespace identifiers look like
// outside addresses but are names nothing connects to. Only this file, only these three name spaces.
if (/(^|\/)src\/main\/camera\/discovery\.ts$/.test(fp))
  text = text.replace(
    /\bhttp:\/\/(?:www\.w3\.org\/2003\/05\/soap-envelope|schemas\.xmlsoap\.org\/ws\/\d{4}\/\d{2}\/(?:addressing|discovery)|www\.onvif\.org\/ver10\/network\/wsdl)\b[^\s"'`)<>]*/g,
    ''
  )

const patterns = [
  { re: /\bfetch\s*\(/, what: 'fetch(' },
  { re: /\baxios\b/, what: 'axios' },
  { re: /\bXMLHttpRequest\b/, what: 'XMLHttpRequest' },
  { re: /\bnew\s+WebSocket\b/, what: 'WebSocket' },
  { re: /\bnet\.request\s*\(/, what: 'net.request(' },
  { re: /\bhttps?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/i, what: 'dış URL' },
  { re: /<link[^>]+href=["']https?:\/\//i, what: 'CDN stylesheet' },
  { re: /<script[^>]+src=["']https?:\/\//i, what: 'CDN script' },
  { re: /@import\s+url\(["']?https?:\/\//i, what: 'CSS @import (uzak)' }
]
// The sidecar's loopback calls are the camera module's job: fetch / WebSocket-free HTTP to 127.0.0.1 is allowed there.
const cameraPatterns = [
  {
    re: /\b(?:https?|wss?|ftp):\/\/(?!(?:127\.0\.0\.1|localhost|\$\{BRIDGE_HOST\})(?![\w.@-]))[^\s"'`)]+/i,
    what: '127.0.0.1 dışı hedef (camera yalnız 127.0.0.1 ve rtsp://)'
  },
  { re: /\b0\.0\.0\.0\b/, what: '0.0.0.0 (yan süreç yalnız 127.0.0.1)' },
  { re: /\bnew\s+WebSocket\b/, what: 'WebSocket' },
  { re: /\baxios\b/, what: 'axios' },
  { re: /\bXMLHttpRequest\b/, what: 'XMLHttpRequest' },
  { re: /\bnet\.request\s*\(/, what: 'net.request(' }
]
const hits = (inCamera ? cameraPatterns : patterns).filter((p) => p.re.test(text)).map((p) => p.what)
if (hits.length === 0) process.exit(0)

process.stderr.write(
  `Ağ kuralı ihlali: ${fp} içinde ${hits.join(', ')} bulundu.\n` +
    `Ağ kodu yalnızca src/main/network/ (dış veri, Telegram), src/main/server/ (sunucu modu), src/main/discovery/, src/main/camera/ (yalnız 127.0.0.1 ve rtsp://) ve src/renderer/lib/transport/ (istemci modu) içinde olabilir (ANTIGRAVITY.md > Yasaklar 1; G-01, G-02, G-140, K-49). ` +
    `Değişikliği geri al ya da kodu bu klasörlerden birine taşı; kaynaklar (font, simge, veri) paket içinden yüklenir.\n`
)
process.exit(2)
