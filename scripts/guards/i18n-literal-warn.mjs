#!/usr/bin/env node
// PostToolUse heuristic helper, only src/renderer/**/*.tsx: early warning for user-visible text
// written straight into JSX instead of t('...') (G-08, ANTIGRAVITY.md > Yasaklar 8). Never blocks: regexes have false
// positives; the hard gate is ESLint's i18next/no-literal-string rule, which runs inside pre-commit-gate.
import { readFileSync } from 'node:fs'

let input
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0)
}
const rawPath = String(input.tool_input?.file_path ?? '')
const fp = rawPath.replace(/\\/g, '/')
if (!/(^|\/)src\/renderer\/.+\.tsx$/.test(fp)) process.exit(0)
if (/\.(test|spec|stories)\.tsx$/.test(fp)) process.exit(0)

const ti = input.tool_input ?? {}
const chunks = []
if (typeof ti.content === 'string') chunks.push(ti.content)
if (typeof ti.new_string === 'string') chunks.push(ti.new_string)
if (Array.isArray(ti.edits))
  for (const e of ti.edits) if (typeof e?.new_string === 'string') chunks.push(e.new_string)
if (chunks.length === 0) process.exit(0)

let fileText = null
try {
  fileText = readFileSync(rawPath, 'utf8')
} catch {
  /* fall back to line numbers inside the edit */
}

// Character before `>` that marks the end of a JSX tag (tag name, attribute value, `}`, `/>`, fragment `<>`).
const TAG_END = String.raw`(?<=[\p{L}\p{N}_"'}\/<])`
const TEXT_PATTERNS = [
  new RegExp(String.raw`${TAG_END}>([^<>{}]+?)(?=<\/|<\p{L}|\{|$)`, 'gu'), // >Kaydet<  >Toplam: {  >text…EOL
  /\}([^<>{}]+?)(?=<\/|<\p{L})/gu // {count} kişi</span>
]
const PROP_RE = /\b(placeholder|title|aria-label|alt|label)\s*=\s*(?:\{\s*)?(["'`])((?:(?!\2).)*?)\2/gu
const OBJ_RE = /(?:^|[\s{,])(label|title|placeholder|description)\s*:\s*(["'`])((?:(?!\2).)*?)\2/gu
const NON_TEXT_ATTR =
  /\b(className|class|data-[\w-]+|id|key|htmlFor|to|href|src|type|name|role|variant|size|side|align|dir|lang|form|method|autoComplete|inputMode)\s*=\s*(?:\{\s*)?(["'`])(?:(?!\2).)*\2(?:\s*\})?/g
const CODE_KEYWORD =
  /^(return|else|default|break|continue|case|export|import|const|let|var|type|interface|function|async|await|extends|implements|from|as|new|typeof|keyof|satisfies|null|undefined|true|false|this|throw|try|catch|finally|yield|enum|declare|readonly)\b/

function clean(line) {
  return line
    .replace(/\{\s*\/\*.*?\*\/\s*\}/g, ' ')
    .replace(/\/\*.*?\*\//g, ' ')
    .replace(/(^|\s)\/\/.*$/, '$1')
    .replace(/\b(?:i18n\.|i18next\.)?t\(\s*(["'`])(?:(?!\1).)*\1[^()]*\)/g, 't()')
    .replace(NON_TEXT_ATTR, '$1=""')
    .replace(/\bclassName\s*=\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, 'className={}')
}

function looksLikeText(s) {
  const t = s.trim()
  if (!/\p{L}{2,}/u.test(t)) return false
  if (/[;=`]|&&|\|\||=>/.test(t)) return false
  if (/^[|&,:?)\].]/.test(t)) return false
  if (/^\(|[\p{L}\p{N}_]\(|[\p{L}\p{N}_]\.[\p{L}_]/u.test(t)) return false
  if (/^(extends|as|satisfies|keyof|typeof|in|is|instanceof)\b/.test(t)) return false
  return true
}

function isKeyLike(v) {
  return /^[\w-]+(\.[\w-]+)+$/.test(v)
}

const findings = []
const seen = new Set()
const add = (line, snippet) => {
  const key = `${line}|${snippet}`
  if (seen.has(key)) return
  seen.add(key)
  findings.push({ line, snippet: snippet.length > 80 ? `${snippet.slice(0, 77)}...` : snippet })
}

for (const chunk of chunks) {
  let base = null
  if (fileText !== null) {
    const idx = fileText.indexOf(chunk)
    if (idx >= 0) base = fileText.slice(0, idx).split('\n').length - 1
  }
  const label = (i) => (base === null ? `değişiklikte satır ${i + 1}` : `satır ${base + i + 1}`)

  let inBlockComment = false
  let prevEndsWithTag = false
  chunk.split(/\r?\n/).forEach((rawLine, i) => {
    const trimmed = rawLine.trim()
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false
      return
    }
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlockComment = true
      return
    }
    if (!trimmed || /^(\/\/|\*|\/\*)/.test(trimmed)) return
    if (/^import\b/.test(trimmed) || /^export\s.*\bfrom\s/.test(trimmed)) return
    if (/<Trans\b|\bi18nKey\b/.test(trimmed)) return

    const line = clean(rawLine)
    const code = line.trim()

    if (prevEndsWithTag && /^[^<>{}]+$/.test(code) && !CODE_KEYWORD.test(code) && looksLikeText(code)) {
      add(label(i), code)
    }
    prevEndsWithTag = new RegExp(`${TAG_END}>$`, 'u').test(code) && !code.endsWith('=>')

    for (const re of TEXT_PATTERNS) {
      re.lastIndex = 0
      for (const m of line.matchAll(re)) {
        if (looksLikeText(m[1])) add(label(i), line.slice(m.index, m.index + m[0].length + 1).trim())
      }
    }
    for (const m of line.matchAll(PROP_RE)) {
      const value = m[3].replace(/\$\{[^}]*\}/g, '')
      if (/\p{L}{2,}/u.test(value) && !isKeyLike(value)) add(label(i), m[0].trim())
    }
    for (const m of line.matchAll(OBJ_RE)) {
      const value = m[3].replace(/\$\{[^}]*\}/g, '')
      const hasNonAscii = [...value].some((ch) => (ch.codePointAt(0) ?? 0) > 0x7f)
      const prose = /\p{Ll}/u.test(value) && (/\s/.test(value) || /^\p{Lu}/u.test(value) || hasNonAscii)
      if (prose && !isKeyLike(value)) add(label(i), m[0].trim())
    }
  })
}

if (findings.length === 0) process.exit(0)

const shown = findings.slice(0, 5).map((f) => `  - ${f.line}: ${f.snippet}`)
if (findings.length > 5) shown.push(`  - ... ve ${findings.length - 5} yer daha`)
const where = fp.slice(Math.max(0, fp.search(/src\/renderer\//)))
const message =
  `i18n uyarısı (${where}): kullanıcıya görünen metin koda gömülmüş olabilir:\n${shown.join('\n')}\n` +
  `Kullanıcıya görünen her metin src/renderer/i18n/tr.json içinde bir anahtar olmalı ve t('...') ile çağrılmalı; ` +
  `en.json ve ru.json aynı anahtarları alır (ANTIGRAVITY.md > Yasaklar 8, G-08). Terimler için tr-copy-guide becerisine bak. ` +
  `Gerçekten çevrilmeyecek bir değerse (marka adı, para birimi kodu, dil adının kendi yazımı) bu uyarıyı yok say.`

process.stdout.write(
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } })
)
process.exit(0)
