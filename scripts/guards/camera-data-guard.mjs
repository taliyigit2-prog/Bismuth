#!/usr/bin/env node
// PreToolUse / git pre-commit: camera data is biometric data (docs/analiz/06-kamera-entegrasyonu.md, K-51):
// face crops, alert frames, embeddings, model weights, Telegram or RTSP secrets must never enter the repository.
// Blocks (exit 2) when the working tree (staged, unstaged, untracked) of the checkout being committed contains:
//   - any file under otel-kamera/{guest_photos,alerts}/ or a userData-like camera/ data folder;
//   - image files (jpg/jpeg/png/webp/heic/bmp/gif) anywhere except docs/, build/, resources/, src/renderer/assets|public,
//     tests/ fixtures, .agent/, prototypes/, and .github/;
//   - embeddings / weights: *.npy, *.npz, *.pt, *.pth, *.onnx, *.tflite, *.pkl, *.safetensors;
//   - secrets: .env, .env.* (except .env.example), *.pem, *.key, files whose text contains a Telegram bot token
//     (digits:35 chars) or an rtsp:// URL with user:password@.
// Like kbs-data-guard, a `cd <dir> && git …` prefix selects that checkout. Text that merely mentions git is ignored.
import { readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  process.exit(0)
}
const command = String(input.tool_input?.command ?? '')
const isGitWrite = command
  .split(/&&|\|\||;|\n|\|/)
  .some((s) => /^\s*(?:\w+=\S*\s+)*git(?:\s+-C\s+\S+)?\s+(add|commit)\b/.test(s))
if (!isGitWrite) process.exit(0)

const base = input.cwd || process.env.BISMUTH_PROJECT_DIR || process.cwd()
const cd = /^\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*&&/.exec(command)?.[1]?.replace(/^["']|["']$/g, '')
let root
try {
  root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: cd ? resolve(base, cd) : base,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true
  }).trim()
} catch {
  process.exit(0)
}
const git = (args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true
  })
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
let files = []
try {
  files = [
    ...new Set([
      ...git(['diff', '--cached', '--name-only']),
      ...git(['diff', '--name-only']),
      ...git(['ls-files', '--others', '--exclude-standard'])
    ])
  ]
} catch {
  process.exit(0)
}

const IMAGE = /\.(jpe?g|png|webp|heic|bmp|gif)$/i
const IMAGE_OK = /^(docs|build|resources|src\/renderer\/(assets|public)|tests|\.agent|prototypes|\.github)\//
const WEIGHTS = /\.(npy|npz|pt|pth|onnx|tflite|pkl|safetensors)$/i
const SECRET_NAME = /(^|\/)\.env(\..+)?$|\.(pem|key)$/
const CAMERA_DATA = /(^|\/)(guest_photos|alerts|camera-data|faces)\//
const problems = []
for (const f of files) {
  if (CAMERA_DATA.test(f)) problems.push(`${f}: kamera verisi klasörü`)
  else if (IMAGE.test(f) && !IMAGE_OK.test(f)) problems.push(`${f}: görüntü dosyası (yüz/kare olabilir)`)
  else if (WEIGHTS.test(f)) problems.push(`${f}: model ağırlığı / yüz vektörü`)
  else if (SECRET_NAME.test(f) && !/\.env\.example$/.test(f)) problems.push(`${f}: sır dosyası`)
  else {
    try {
      const abs = join(root, f)
      const st = statSync(abs)
      if (!st.isFile() || st.size > 2 * 1024 * 1024) continue
      const text = readFileSync(abs, 'utf8')
      if (/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/.test(text))
        problems.push(`${f}: Telegram bot token'ına benzeyen metin`)
      if (/rtsp:\/\/[^\s/@:]+:[^\s/@]+@/.test(text)) problems.push(`${f}: şifreli RTSP adresi`)
    } catch {
      /* unreadable: ignore */
    }
  }
}
if (problems.length > 0) {
  process.stderr.write(
    `Engellendi: kamera/biyometrik veri ya da sır depoya giremez (K-51, ANTIGRAVITY.md yasak 14).\n${problems.map((p) => `  - ${p}`).join('\n')}\nDosyayı .gitignore'a ekleyin ya da çalışma ağacından çıkarın; örnek görüntüler yalnız docs/ ya da tests/ altında sentetik olabilir.\n`
  )
  process.exit(2)
}
process.exit(0)
