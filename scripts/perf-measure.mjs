// Performance measurement (Faz 22 P22a): start-up time and per-process memory/CPU of the built program, idle and under a
// simple busy scenario. The process-tree sampler is shell-independent (it works on any pid), so the same script measures
// a Tauri build later (`--attach`).
//
//   npm run build && xvfb-run -a node scripts/perf-measure.mjs [--runs 3] [--label baseline] [--out .tmp/perf]
//     --arg <electron switch>   extra command-line switch for the program (repeatable), e.g. --arg --in-process-gpu
//     --env KEY=VALUE           extra environment for the program (repeatable)
//     --idle <s>                idle sampling seconds (default 30)      --no-busy   skip the busy scenario
//     --light                   light mode: server mode + window closed, tree measured with no window
//     --seed <dir>              data folder to copy (default .tmp/perf/seed, made once: 19 rooms, ~19,000 stays)
//   node scripts/perf-measure.mjs --attach <pid|process name> [--idle 30] [--label tauri]   (any running program)
//   node scripts/perf-measure.mjs --tauri <binary> [--runs 3] [--label tauri]   (P22c: the Tauri shell + Node sidecar, same
//     seed and the same steps; needs `npm run build`, `node shell-tauri/sidecar/build.mjs` and `cargo build --release`)
//   node scripts/perf-measure.mjs --report a.json b.json                                      (Markdown table, side by side)
//
// Output: <out>/<label>.json and <label>.md. Numbers: RSS and PSS (PSS does not count shared pages twice; Linux only),
// CPU as percent of one core, by process type (main, renderer, gpu-process, utility ...).
import { execFileSync, spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { cpus, loadavg, platform, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MB = 1024 * 1024
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d

// ---------- arguments ----------
function parseArgs(argv) {
  const o = {
    runs: 1,
    label: 'run',
    out: join(root, '.tmp/perf'),
    args: [],
    env: {},
    idle: 30,
    busy: true,
    light: false
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--runs') o.runs = Number(next())
    else if (a === '--label') o.label = next()
    else if (a === '--out') o.out = resolve(next())
    else if (a === '--seed') o.seed = resolve(next())
    else if (a === '--arg') o.args.push(next())
    else if (a === '--env') {
      const [k, ...v] = next().split('=')
      o.env[k] = v.join('=')
    } else if (a === '--idle') o.idle = Number(next())
    else if (a === '--no-busy') o.busy = false
    else if (a === '--light') o.light = true
    else if (a === '--attach') o.attach = next()
    else if (a === '--tauri') o.tauri = resolve(next())
    else if (a === '--report') o.report = argv.slice(i + 1)
  }
  return o
}

// ---------- process tree sampler (any program) ----------
/** One row per process: { pid, ppid, rssKb, pssKb|null, cpuSec, cmd }. */
function snapshot() {
  if (platform() === 'linux') {
    const rows = []
    for (const name of readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue
      try {
        const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
        const close = stat.lastIndexOf(')')
        const f = stat.slice(close + 2).split(' ')
        const cmd = readFileSync(`/proc/${name}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
        let pssKb = null
        try {
          const m = /^Pss:\s+(\d+) kB/m.exec(readFileSync(`/proc/${name}/smaps_rollup`, 'utf8'))
          pssKb = m ? Number(m[1]) : null
        } catch {
          /* kernel without smaps_rollup, or not ours */
        }
        rows.push({
          pid: Number(name),
          ppid: Number(f[1]),
          rssKb: Number(f[21]) * 4,
          pssKb,
          cpuSec: (Number(f[11]) + Number(f[12])) / 100,
          cmd
        })
      } catch {
        /* process ended meanwhile */
      }
    }
    return rows
  }
  if (platform() === 'win32') {
    // Not run in the Codespace (needs the hotel computer): Win32_Process has the working set and the CPU time (100 ns).
    const ps =
      'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.WorkingSetSize)|$($_.KernelModeTime + $_.UserModeTime)|$($_.CommandLine)" }'
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], {
      encoding: 'utf8',
      maxBuffer: 64 * MB
    })
    return out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [pid, ppid, ws, cpu, ...cmd] = line.split('|')
        return {
          pid: +pid,
          ppid: +ppid,
          rssKb: Number(ws) / 1024,
          pssKb: null,
          cpuSec: Number(cpu) / 1e7,
          cmd: cmd.join('|')
        }
      })
  }
  // macOS: ps (rss in KB, time as [dd-][hh:]mm:ss.ss)
  const out = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,time=,command='], {
    encoding: 'utf8',
    maxBuffer: 64 * MB
  })
  return out
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l)
      const t = m[4].split(/[-:]/).map(Number)
      const sec =
        t.length === 4
          ? t[0] * 86400 + t[1] * 3600 + t[2] * 60 + t[3]
          : t.length === 3
            ? t[0] * 3600 + t[1] * 60 + t[2]
            : t[0] * 60 + t[1]
      return { pid: +m[1], ppid: +m[2], rssKb: +m[3], pssKb: null, cpuSec: sec, cmd: m[5] }
    })
}

/** The root and all its descendants. */
function tree(rows, rootPid) {
  const kids = new Map()
  for (const r of rows) (kids.get(r.ppid) ?? kids.set(r.ppid, []).get(r.ppid)).push(r)
  const byPid = new Map(rows.map((r) => [r.pid, r]))
  const out = []
  const stack = [byPid.get(rootPid)].filter(Boolean)
  while (stack.length) {
    const r = stack.pop()
    out.push(r)
    stack.push(...(kids.get(r.pid) ?? []))
  }
  return out
}

/** main | renderer | gpu-process | utility | zygote ...: from `--type=`; else the main process (or, for a Tauri/WebView tree, the program name). */
const typeHints = new Map()
function kindOf(r, rootPid) {
  // A program that knows its own process types (Electron's getAppMetrics) tells them: on Linux the sandboxed
  // renderers and the GPU process carry the zygote's command line.
  if (typeHints.has(r.pid)) return typeHints.get(r.pid)
  const t = /--type=([\w-]+)/.exec(r.cmd)
  if (t) return t[1]
  if (r.pid === rootPid) return 'main'
  // A Tauri tree: the Node sidecar and the system WebView's helper processes (WebKitGTK; WebView2 on Windows).
  const exe = (r.cmd.split(' ')[0] ?? '').split(/[\\/]/).pop() ?? ''
  if (/^node(\.exe)?$/i.test(exe)) return 'node-sidecar'
  const web = /^WebKit(\w+)Process$/.exec(exe)
  if (web) return `webkit-${web[1].toLowerCase()}`
  if (/^msedgewebview2/i.test(exe)) return 'webview2'
  return 'child'
}

function summarize(before, after, seconds, rootPid) {
  const prev = new Map(before.map((r) => [r.pid, r]))
  const byType = {}
  let rss = 0
  let pss = 0
  let havePss = true
  let cpu = 0
  for (const r of after) {
    const k = kindOf(r, rootPid)
    const e = (byType[k] ??= { count: 0, rssMb: 0, pssMb: 0, cpuPct: 0 })
    const c = prev.has(r.pid) ? (Math.max(0, r.cpuSec - prev.get(r.pid).cpuSec) / seconds) * 100 : 0
    e.count++
    e.rssMb += r.rssKb / 1024
    if (r.pssKb === null) havePss = false
    else e.pssMb += r.pssKb / 1024
    e.cpuPct += c
    rss += r.rssKb / 1024
    pss += (r.pssKb ?? 0) / 1024
    cpu += c
  }
  for (const e of Object.values(byType))
    for (const k of ['rssMb', 'pssMb', 'cpuPct']) e[k] = round(e[k], k === 'cpuPct' ? 1 : 0)
  return {
    processes: after.length,
    rssMb: round(rss),
    pssMb: havePss ? round(pss) : null,
    cpuPct: round(cpu, 1),
    byType
  }
}

/** Samples the tree of `pid` for `seconds` (a sample every 2 s); the memory is the median sample, the CPU the whole-window average. */
async function sampleWindow(pid, seconds, hints = async () => {}) {
  await hints()
  const first = snapshot()
  const t0 = Date.now()
  const samples = []
  while (Date.now() - t0 < seconds * 1000) {
    await sleep(Math.min(2000, seconds * 1000 - (Date.now() - t0)))
    samples.push(tree(snapshot(), pid))
  }
  await hints()
  const last = samples.at(-1)
  const mid = [...samples].sort((a, b) => sum(a, 'rssKb') - sum(b, 'rssKb'))[Math.floor(samples.length / 2)]
  const sec = (Date.now() - t0) / 1000
  const result = summarize(tree(first, pid), mid, sec, pid)
  // CPU over the whole window (first vs last) instead of the median sample's.
  const whole = summarize(tree(first, pid), last, sec, pid)
  result.cpuPct = whole.cpuPct
  for (const [k, e] of Object.entries(result.byType)) e.cpuPct = whole.byType[k]?.cpuPct ?? 0
  const peak = Math.max(...samples.map((s) => sum(s, 'rssKb'))) / 1024
  result.peakRssMb = round(peak)
  result.seconds = round(sec, 1)
  return result
}
const sum = (rows, key) => rows.reduce((a, r) => a + (r[key] ?? 0), 0)

// ---------- seed ----------
function ensureSeed(o) {
  const dir = o.seed ?? join(o.out, 'seed')
  if (existsSync(join(dir, 'bismuth.db'))) return dir
  console.error(`seed: making ${dir} (once)`)
  mkdirSync(dir, { recursive: true })
  const tsx = (file, ...rest) =>
    execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.node.json', file, ...rest], {
      cwd: root,
      stdio: 'inherit'
    })
  tsx('tests/e2e/seed-calendar.ts', dir, '--dense')
  tsx('tests/e2e/seed-perf.ts', dir)
  return dir
}

// ---------- the Electron scenario ----------
async function electronRun(o, seed, idx) {
  const { _electron } = await import('@playwright/test')
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-perf-'))
  cpSync(seed, dir, { recursive: true })
  const t0 = Date.now()
  const app = await _electron.launch({
    args: [root, ...(platform() === 'linux' ? ['--no-sandbox'] : []), ...o.args],
    env: {
      ...process.env,
      BISMUTH_USER_DATA: dir,
      ELECTRON_RENDERER_URL: '',
      BISMUTH_EXTERNAL_ORIGIN: 'http://127.0.0.1:9',
      ...o.env
    },
    cwd: root
  })
  const pid = app.process().pid
  const hints = async () => {
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics()).catch(() => [])
    for (const m of metrics)
      typeHints.set(
        m.pid,
        m.type === 'Browser'
          ? 'main'
          : m.type === 'Tab'
            ? 'renderer'
            : m.type === 'GPU'
              ? 'gpu-process'
              : m.type.toLowerCase()
      )
  }
  const call = (page, path, body = {}) =>
    page.evaluate(
      async ({ p, text }) => {
        const res = await window.bismuth.api({ path: `/api/${p}`, body: text })
        return { status: res.status, body: res.body ? JSON.parse(res.body) : null }
      },
      { p: path, text: JSON.stringify(body) }
    )
  try {
    const page = await app.firstWindow()
    const windowMs = Date.now() - t0
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const readyMs = Date.now() - t0
    const state = await call(page, 'auth.state')
    if (!state.body.session) {
      const res = await call(page, 'auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })
      if (res.status !== 200) throw new Error(`sign-in failed: ${JSON.stringify(res.body)}`)
    }
    const t1 = Date.now()
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await page
      .getByTestId('tape-chart')
      .locator('[data-testid^="stay-"]')
      .first()
      .waitFor({ state: 'visible', timeout: 60000 })
    const calendarMs = Date.now() - t1
    const versions = await app.evaluate(() => ({
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    }))

    const out = { run: idx, startup: { windowMs, readyMs, calendarAfterReloadMs: calendarMs }, versions }
    if (o.light) {
      // Server mode on, the window closed: only the main process (and utilities) are left; the browser takes over.
      await call(page, 'settings.set', {
        'host.port': Number(o.env.BISMUTH_PERF_PORT ?? 47519),
        'app.mode': 'host',
        'app.lightMode': true
      })
      await sleep(2000)
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.close()))
      await sleep(6000)
      out.idle = await sampleWindow(pid, o.idle, hints)
      return out
    }
    await sleep(3000)
    out.idle = await sampleWindow(pid, o.idle, hints)
    if (o.busy) {
      const chart = page.getByTestId('tape-chart')
      const busy = sampleWindow(pid, 20, hints)
      for (let i = 0; i < 10; i++) {
        await chart.evaluate((el) => {
          const d = el.querySelector('[data-testid^="tape-day-"]')
          el.scrollLeft += (d?.getBoundingClientRect().width ?? 40) * 7
        })
        await sleep(300)
      }
      for (const h of ['#/reports', '#/ledger', '#/calendar']) {
        await page.evaluate((x) => {
          location.hash = x
        }, h)
        await sleep(2500)
      }
      out.busy = await busy
    }
    return out
  } finally {
    await app.close().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------- the Tauri scenario (P22c) ----------
async function tauriRun(o, seed, idx) {
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-perf-'))
  cpSync(seed, dir, { recursive: true })
  const port = Number(o.env.BISMUTH_PORT ?? 47931)
  const marks = {}
  const t0 = Date.now()
  const child = spawn(o.tauri, [], {
    env: {
      ...process.env,
      BISMUTH_ROOT: root,
      BISMUTH_DATA: dir,
      BISMUTH_PORT: String(port),
      BISMUTH_PERF: '1',
      ...o.env
    },
    stdio: ['ignore', 'ignore', 'pipe']
  })
  let err = ''
  child.stderr.on('data', (b) => {
    for (const line of b.toString().split('\n')) {
      const m = /^PERF (\w+) (\d+)/.exec(line)
      if (m) marks[m[1]] = Number(m[2])
      else if (line.trim() && err.length < 4000) err += line + '\n'
    }
  })
  let exited = false
  child.on('exit', () => (exited = true))
  const probe = async (path) => {
    try {
      return await (await fetch(`http://127.0.0.1:${port}/__perf/${path}`)).text()
    } catch {
      return null
    }
  }
  const sidecar = async () => JSON.parse((await probe('mark/ping')) ?? '{}')
  const waitFor = async (name, ms = 120000) => {
    const t = Date.now()
    for (;;) {
      const m = await sidecar()
      if (m[name]) return m
      if (exited) throw new Error(`the program exited early: ${err}`)
      if (Date.now() - t > ms) throw new Error(`no '${name}' mark in ${ms} ms: ${err}`)
      await sleep(100)
    }
  }
  const pid = child.pid
  try {
    const ready = await waitFor('ready')
    const calendar = await waitFor('calendar')
    const startup = {
      windowMs: marks.window_created - t0,
      readyMs: ready.ready - t0,
      calendarAfterReloadMs: calendar.calendar - calendar.reloadStart
    }
    const extra = {
      processStartMs: marks.process_start - t0,
      sidecarListeningMs: marks.sidecar_listening - t0,
      pageFinishedMs: marks.page_finished - t0
    }
    await sleep(3000)
    const out = { run: idx, startup, extra, versions: { shell: 'tauri', node: process.versions.node } }
    out.idle = await sampleWindow(pid, o.idle)
    if (o.busy) {
      const busy = sampleWindow(pid, 20)
      await probe('cmd/busy')
      out.busy = await busy
      await waitFor('busyDone', 60000)
    }
    return out
  } finally {
    child.kill('SIGTERM')
    for (let i = 0; i < 50 && !exited; i++) await sleep(100)
    if (!exited) child.kill('SIGKILL')
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------- report ----------
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
function medianRun(runs) {
  const pick = (f) => med(runs.map(f).filter((x) => typeof x === 'number'))
  const phase = (name) => {
    if (!runs[0][name]) return undefined
    const types = new Set(runs.flatMap((r) => Object.keys(r[name].byType)))
    const byType = {}
    for (const t of types)
      byType[t] = {
        count: pick((r) => r[name].byType[t]?.count ?? 0),
        rssMb: pick((r) => r[name].byType[t]?.rssMb ?? 0),
        pssMb: pick((r) => r[name].byType[t]?.pssMb ?? 0),
        cpuPct: pick((r) => r[name].byType[t]?.cpuPct ?? 0)
      }
    return {
      processes: pick((r) => r[name].processes),
      rssMb: pick((r) => r[name].rssMb),
      pssMb: runs[0][name].pssMb === null ? null : pick((r) => r[name].pssMb),
      cpuPct: pick((r) => r[name].cpuPct),
      peakRssMb: pick((r) => r[name].peakRssMb),
      byType
    }
  }
  return {
    startup: runs[0].startup
      ? Object.fromEntries(Object.keys(runs[0].startup).map((k) => [k, pick((r) => r.startup[k])]))
      : undefined,
    idle: phase('idle'),
    busy: phase('busy')
  }
}

function markdown(reports) {
  const cols = reports.map((r) => r.label)
  const row = (name, f) => `| ${name} | ${reports.map((r) => f(r) ?? '–').join(' | ')} |`
  const lines = [`| Ölçüt | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---:').join('|')}|`]
  lines.push(row('Pencere açıldı (ms)', (r) => r.median.startup?.windowMs))
  lines.push(row('Uygulama hazır (ms)', (r) => r.median.startup?.readyMs))
  lines.push(row('Takvim çubukları (ms, yeniden yüklemeden)', (r) => r.median.startup?.calendarAfterReloadMs))
  for (const [phase, title] of [
    ['idle', 'Boşta'],
    ['busy', 'Yoğun']
  ]) {
    lines.push(row(`${title}: süreç sayısı`, (r) => r.median[phase]?.processes))
    lines.push(row(`${title}: toplam RSS (MB)`, (r) => r.median[phase]?.rssMb))
    lines.push(row(`${title}: toplam PSS (MB)`, (r) => r.median[phase]?.pssMb))
    lines.push(row(`${title}: CPU (% tek çekirdek)`, (r) => r.median[phase]?.cpuPct))
    const types = [...new Set(reports.flatMap((r) => Object.keys(r.median[phase]?.byType ?? {})))].sort()
    for (const t of types)
      lines.push(
        row(`${title}: ${t} (RSS MB / CPU %)`, (r) => {
          const e = r.median[phase]?.byType[t]
          return e ? `${e.rssMb} / ${e.cpuPct}` : null
        })
      )
  }
  return lines.join('\n') + '\n'
}

// ---------- main ----------
const o = parseArgs(process.argv.slice(2))
if (o.report) {
  console.log(markdown(o.report.map((f) => JSON.parse(readFileSync(f, 'utf8')))))
  process.exit(0)
}
mkdirSync(o.out, { recursive: true })
const env = {
  platform: `${platform()}-${process.arch}`,
  cpus: cpus().length,
  loadAtStart: round(loadavg()[0], 2)
}
let runs = []
let versions = null
if (o.attach) {
  const rows = snapshot()
  const rootProc = /^\d+$/.test(o.attach)
    ? rows.find((r) => r.pid === Number(o.attach))
    : rows.find(
        (r) =>
          r.cmd.split(/[\\/]/).pop()?.toLowerCase().startsWith(o.attach.toLowerCase()) &&
          !/--type=/.test(r.cmd)
      )
  if (!rootProc) throw new Error(`no running process matches ${o.attach}`)
  runs.push({ run: 0, idle: await sampleWindow(rootProc.pid, o.idle) })
} else if (o.tauri) {
  if (platform() === 'linux' && !process.env.DISPLAY) console.error('no DISPLAY: run under xvfb-run -a')
  if (!existsSync(join(root, 'out/renderer/index.html'))) throw new Error('run `npm run build` first')
  const seed = ensureSeed(o)
  for (let i = 0; i < o.runs; i++) {
    runs.push(await tauriRun(o, seed, i))
    versions ??= runs[0].versions
    console.error(`run ${i + 1}/${o.runs} done`)
    await sleep(2000)
  }
} else {
  if (platform() === 'linux' && !process.env.DISPLAY) console.error('no DISPLAY: run under xvfb-run -a')
  if (!existsSync(join(root, 'out/main/index.js'))) throw new Error('run `npm run build` first')
  const seed = ensureSeed(o)
  for (let i = 0; i < o.runs; i++) {
    runs.push(await electronRun(o, seed, i))
    versions ??= runs[0].versions
    console.error(`run ${i + 1}/${o.runs} done`)
    await sleep(2000)
  }
}
const report = {
  label: o.label,
  tool: o.attach ? 'attach' : o.tauri ? 'tauri' : 'electron',
  args: o.args,
  light: o.light,
  env,
  versions,
  runs,
  median: medianRun(runs)
}
writeFileSync(join(o.out, `${o.label}.json`), JSON.stringify(report, null, 1))
const md = markdown([report])
writeFileSync(join(o.out, `${o.label}.md`), md)
console.log(md)
