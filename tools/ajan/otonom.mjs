#!/usr/bin/env node
// Unattended runner: keeps a Claude Agent SDK session going turn after turn without waiting for the owner.
// Same session file as ajan.mjs (tools/ajan/kayit/son-oturum.json), so the two can hand over to each other.
//
//   node tools/ajan/otonom.mjs --devam                      # continue the last session (e.g. Opus /orkestra)
//   node tools/ajan/otonom.mjs --model claude-opus-5-5 "<task>"
//   node tools/ajan/otonom.mjs --devam --saat 10            # stop after 10 hours (default 12)
//
// It stops when the agent writes <<ORKESTRA_BITTI>> alone on a line, when credit runs out, after 5 errors in a row,
// after 3 turns in a row that use no tools (nothing left to do), or when the time limit is reached.
import { query } from '@anthropic-ai/claude-agent-sdk'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const stateDir = join(here, 'kayit')
const lastSessionFile = join(stateDir, 'son-oturum.json')
mkdirSync(stateDir, { recursive: true })
const logFile = join(stateDir, `otonom-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`)

const args = { model: null, resume: false, hours: 12, prompt: null }
const rest = []
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a === '--model') args.model = process.argv[++i]
  else if (a === '--devam') args.resume = true
  else if (a === '--saat') args.hours = Number(process.argv[++i])
  else rest.push(a)
}
if (rest.length) args.prompt = rest.join(' ')

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY tanımlı değil (GitHub > Settings > Codespaces > Secrets).')
  process.exit(1)
}

let sessionId = null
let spent = 0
if (args.resume) {
  if (!existsSync(lastSessionFile)) {
    console.error('Devam edilecek oturum yok (tools/ajan/kayit/son-oturum.json).')
    process.exit(1)
  }
  const last = JSON.parse(readFileSync(lastSessionFile, 'utf8'))
  sessionId = last.sessionId
  spent = Number(last.spent ?? 0) || 0
  args.model ??= last.model
}
args.model ??= 'claude-opus-5-5'

const say = (line) => {
  console.log(line)
  appendFileSync(logFile, line + '\n')
}
const save = () =>
  sessionId && writeFileSync(lastSessionFile, JSON.stringify({ sessionId, model: args.model, spent }, null, 2))

const DONE = '<<ORKESTRA_BITTI>>'
const APPEND = [
  'Sahip uyuyor ve bu oturum tam otonom: tur bitince bir betik sana otomatik olarak "devam et" yazacak.',
  'Asla soru sorma, onay bekleme ya da sahibe seçenek sunma; belirsizlikte en makul varsayılanı seç,',
  'kararı docs/plan/06-kararlar.md veya YURUTME.md günlüğüne "(otonom varsayılan)" diye yaz ve ilerle.',
  'Bu başlatıcıda tur biterse arka plan ajanları da durur: ajanları ön planda çalıştır ya da hepsinin sonucu',
  'gelmeden turu bitirme. Her paketi bitirince kontrolleri koş, commit et ve claude/… dalına pushla.',
  `Planlanan bütün iş gerçekten bittiğinde mesajının son satırına tek başına ${DONE} yaz;`,
  'bu işareti iş bitmeden hiçbir bağlamda (alıntı, açıklama, olumsuz cümle) yazma.',
  'Sahibe Türkçe yaz.',
].join(' ')

const CONTINUE =
  'Devam et (otomatik mesaj, sahip uyuyor). git status, git worktree list ve docs/plan/fazlar/YURUTME.md ile ' +
  'nerede kaldığını bul; yarım kalan worktree işlerini tamamla ve birleştir, sonra /orkestra ile sıradaki ' +
  'paket ve dalgalara geç. Soru sorma; varsayılanla ilerle ve kaydet. Her paketten sonra commit ve push. ' +
  'Her şey bittiyse son satıra tek başına bitiş işaretini yaz.'

const short = (v, n = 140) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

async function runTurn(prompt) {
  const q = query({
    prompt,
    options: {
      cwd: repo,
      model: args.model,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: APPEND },
      disallowedTools: ['AskUserQuestion'],
      ...(sessionId ? { resume: sessionId } : {}),
    },
  })
  const spentBefore = spent
  let turnCost = 0
  let text = ''
  let tools = 0
  let errors = []
  for await (const msg of q) {
    if (msg.session_id) sessionId = msg.session_id
    if (msg.type === 'system' && msg.subtype === 'init') {
      say(`▶ ${new Date().toLocaleTimeString('tr-TR')} · ${msg.model ?? args.model} · oturum ${msg.session_id}`)
      save()
    } else if (msg.type === 'assistant') {
      const sub = msg.parent_tool_use_id ? '   [alt ajan] ' : ''
      if (msg.error) errors.push(String(msg.error))
      for (const b of msg.message?.content ?? []) {
        if (b.type === 'text' && b.text.trim()) {
          if (sub) say(`${sub}${short(b.text, 200)}`)
          else {
            text += '\n' + b.text
            say(`\n${b.text}\n`)
          }
        } else if (b.type === 'tool_use') {
          tools++
          const i = b.input ?? {}
          say(`${sub}  → ${b.name}: ${short(i.command ?? i.file_path ?? i.description ?? i.pattern ?? '')}`)
        }
      }
    } else if (msg.type === 'result') {
      turnCost = Math.max(turnCost, Number(msg.total_cost_usd) || 0)
      spent = spentBefore + turnCost
      if (msg.subtype !== 'success' && msg.errors?.length) errors.push(...msg.errors)
      save()
    }
  }
  say(`── tur bitti · bu tur $${turnCost.toFixed(2)} · toplam ≈ $${spent.toFixed(2)} · ${tools} araç çağrısı ──`)
  return { text, tools, errors }
}

const deadline = Date.now() + args.hours * 3600_000
let prompt = args.prompt ?? (args.resume ? CONTINUE : null)
if (!prompt) {
  console.error('Görev metni verin ya da --devam kullanın.')
  process.exit(1)
}
let errorStreak = 0
let idleStreak = 0
say(`Otonom çalışma başladı · model ${args.model} · en çok ${args.hours} saat · kayıt ${logFile}`)

while (Date.now() < deadline) {
  let r
  try {
    r = await runTurn(prompt)
  } catch (err) {
    r = { text: '', tools: 0, errors: [String(err?.message ?? err)] }
  }
  const errText = r.errors.join(' | ')
  if (/credit balance|billing|insufficient|402/i.test(errText)) {
    say(`⛔ Kredi bitti: ${short(errText, 300)}`)
    break
  }
  if (r.text.split('\n').some((l) => l.trim() === DONE)) {
    say('✅ Ajan işin bittiğini bildirdi.')
    break
  }
  if (r.errors.length && !r.tools) {
    errorStreak++
    say(`⚠️  Hata (${errorStreak}/5): ${short(errText, 300)} · 60 sn sonra yeniden denenecek`)
    if (errorStreak >= 5) break
    await new Promise((res) => setTimeout(res, 60_000))
  } else errorStreak = 0
  idleStreak = r.tools ? 0 : idleStreak + 1
  if (idleStreak >= 3) {
    say('⏹  Üç turdur hiçbir araç kullanılmadı; yapılacak iş kalmadı sayılıyor.')
    break
  }
  prompt = CONTINUE
}
save()
say(`Otonom çalışma durdu · toplam ≈ $${spent.toFixed(2)}. Devam: node tools/ajan/otonom.mjs --devam`)
process.exit(0)
