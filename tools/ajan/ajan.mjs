#!/usr/bin/env node
// Runs a Claude agent on this repository through the Claude Agent SDK, billed to the Anthropic API key in
// ANTHROPIC_API_KEY (Console promotional credits cover "Agent SDK", unlike the `claude` CLI).
//
//   node tools/ajan/ajan.mjs                                   # Fable reads docs/fable-talimati.md
//   node tools/ajan/ajan.mjs --model haiku --butce 0.2 "Merhaba de ve dur."   # cheap billing test
//   node tools/ajan/ajan.mjs --model claude-opus-5-5 --butce 80 "<task>"
//   node tools/ajan/ajan.mjs --devam                           # continue the last session
//
// After each turn the script waits for your reply in the terminal (empty line = quit), so the agent can ask
// questions. Ctrl+C once stops the current turn; twice quits.
import { query } from '@anthropic-ai/claude-agent-sdk'
import { createInterface } from 'node:readline/promises'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const stateDir = join(here, 'kayit')
const lastSessionFile = join(stateDir, 'son-oturum.json')
mkdirSync(stateDir, { recursive: true })
const logFile = join(stateDir, `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`)

const DEFAULT_PROMPT = 'docs/fable-talimati.md dosyasını baştan sona oku ve eksiksiz uygula.'

function parseArgs(argv) {
  const out = { model: 'claude-fable-5-1', budget: 100, resume: false, prompt: null, effort: null }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--model') out.model = argv[++i]
    else if (a === '--butce') out.budget = Number(argv[++i])
    else if (a === '--efor') out.effort = argv[++i]
    else if (a === '--devam') out.resume = true
    else if (a === '-h' || a === '--help') out.help = true
    else rest.push(a)
  }
  if (rest.length) out.prompt = rest.join(' ')
  return out
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n'))
  process.exit(0)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    'ANTHROPIC_API_KEY tanımlı değil. GitHub > Settings > Codespaces > Secrets bölümüne ekleyin,\n' +
      'sonra codespace\'i yeniden başlatın (Code > Codespaces > ... > Stop, ardından tekrar açın).',
  )
  process.exit(1)
}
if (!Number.isFinite(args.budget) || args.budget <= 0) {
  console.error('--butce pozitif bir dolar tutarı olmalı (örn. --butce 100).')
  process.exit(1)
}

const log = (line) => appendFileSync(logFile, line + '\n')
const say = (line) => {
  console.log(line)
  log(line)
}

let sessionId = null
let spent = 0
if (args.resume) {
  if (!existsSync(lastSessionFile)) {
    console.error('Devam edilecek oturum bulunamadı (tools/ajan/kayit/son-oturum.json yok).')
    process.exit(1)
  }
  const last = JSON.parse(readFileSync(lastSessionFile, 'utf8'))
  sessionId = last.sessionId
  if (!process.argv.includes('--model')) args.model = last.model
}

const APPEND = [
  'Sahip Türkçe konuşuyor; ona her zaman basit Türkçe ile yaz.',
  'Bu oturum Claude Agent SDK ile bir terminal betiğinden yürütülüyor. AskUserQuestion aracı yok:',
  'sahibe soru sormak istediğinde soruları numaralı olarak mesajının sonuna yaz ve turu bitir;',
  'sahip cevabı terminalden yazacak. Soru sormadan ilerleyebileceğin işleri kesintisiz sürdür.',
].join(' ')

function short(value, n = 140) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function describeTool(block) {
  const i = block.input ?? {}
  const arg = i.command ?? i.file_path ?? i.path ?? i.pattern ?? i.url ?? i.description ?? i.prompt ?? ''
  return `${block.name}${arg ? ': ' + short(arg) : ''}`
}

let current = null
let interrupted = false
process.on('SIGINT', () => {
  if (current && !interrupted) {
    interrupted = true
    say('\n⏹  Durduruluyor… (çıkmak için tekrar Ctrl+C)')
    current.interrupt().catch(() => {})
  } else {
    say('\nÇıkılıyor.')
    process.exit(130)
  }
})

async function runTurn(prompt) {
  const remaining = Math.max(args.budget - spent, 0.01)
  interrupted = false
  current = query({
    prompt,
    options: {
      cwd: repo,
      model: args.model,
      ...(args.effort ? { effort: args.effort } : {}),
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: APPEND },
      disallowedTools: ['AskUserQuestion'],
      maxBudgetUsd: remaining,
      ...(sessionId ? { resume: sessionId } : {}),
    },
  })

  let lastText = ''
  for await (const msg of current) {
    if (msg.session_id) sessionId = msg.session_id
    if (msg.type === 'system' && msg.subtype === 'init') {
      say(`▶ Model: ${msg.model ?? args.model} · oturum: ${msg.session_id} · bütçe: $${remaining.toFixed(2)}`)
      writeFileSync(lastSessionFile, JSON.stringify({ sessionId: msg.session_id, model: args.model }, null, 2))
    } else if (msg.type === 'assistant') {
      const sub = msg.parent_tool_use_id ? '   [alt ajan] ' : ''
      if (msg.error) say(`${sub}⚠️  ${msg.error}`)
      for (const block of msg.message?.content ?? []) {
        if (block.type === 'text' && block.text.trim()) {
          if (sub) say(`${sub}${short(block.text, 200)}`)
          else {
            lastText = block.text
            say(`\n${block.text}\n`)
          }
        } else if (block.type === 'tool_use') {
          say(`${sub}  → ${describeTool(block)}`)
        }
      }
    } else if (msg.type === 'result') {
      spent += msg.total_cost_usd ?? 0
      const status =
        msg.subtype === 'success'
          ? 'tamamlandı'
          : msg.subtype === 'error_max_budget_usd'
            ? 'BÜTÇE SINIRINA ULAŞILDI'
            : `hata (${msg.subtype})`
      if (msg.subtype !== 'success' && msg.errors?.length) say(`⚠️  ${msg.errors.join(' | ')}`)
      say(
        `\n── Tur ${status} · bu tur $${(msg.total_cost_usd ?? 0).toFixed(2)} · toplam $${spent.toFixed(2)} / $${args.budget} · ` +
          `${Math.round((msg.duration_ms ?? 0) / 60000)} dk ──`,
      )
    }
  }
  current = null
  return lastText
}

say(`Bismuth ajan başlatıcı · kayıt: ${logFile}`)
const rl = createInterface({ input: process.stdin, output: process.stdout })
let prompt = args.prompt ?? (args.resume ? 'Kaldığın yerden devam et.' : DEFAULT_PROMPT)

while (true) {
  try {
    await runTurn(prompt)
  } catch (err) {
    current = null
    say(`⚠️  Hata: ${err?.message ?? err}`)
    if (/credit balance|billing|402/i.test(String(err?.message))) {
      say('Kredi sorunu: platform.claude.com > Billing sayfasını kontrol edin.')
    }
  }
  if (spent >= args.budget) {
    say(`Bütçe doldu ($${spent.toFixed(2)}). Devam etmek için: node tools/ajan/ajan.mjs --devam --butce <yeni tutar>`)
    break
  }
  let answer = ''
  try {
    answer = (await rl.question('\nCevabınız (boş bırakıp Enter = çıkış): ')).trim()
  } catch {
    break // stdin closed (non-interactive run)
  }
  if (!answer) break
  log(`\n> ${answer}`)
  prompt = answer
}
rl.close()
say(`Oturum kapandı. Toplam harcama: $${spent.toFixed(2)}. Devam etmek için: node tools/ajan/ajan.mjs --devam`)
process.exit(0)
