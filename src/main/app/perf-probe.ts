// `Bismuth --perf-out=<file> [--perf-idle=<seconds>]` (Faz 22 P22a): for measuring on the hotel's own computer, where
// there is no Node to run scripts/perf-measure.mjs. After the window is ready the program samples its own processes
// (Electron's metrics: working set and CPU per process) every 2 s for the given time (default 30), writes a JSON in
// the same shape as the script's report (`node scripts/perf-measure.mjs --report <file>` makes the Markdown table)
// and quits. The program never opens the file again and nothing is sent anywhere.
import { writeFileSync } from 'node:fs'

export interface ProcessMetric {
  type: string
  memory: { workingSetSize: number }
  cpu: { percentCPUUsage: number }
}

export interface PerfProbeOptions {
  /** Where the JSON goes. */
  out: string
  idleSeconds: number
  startedAt: number
  platform: string
  versions: Record<string, string | undefined>
  metrics(): ProcessMetric[]
  /** Called once the file is written (the program quits). */
  done(): void
  now?(): number
  sleep?(ms: number): Promise<void>
  write?(file: string, text: string): void
}

const round = (n: number, d = 0): number => Math.round(n * 10 ** d) / 10 ** d
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

/** Parses `--perf-out=` and `--perf-idle=` (seconds, 5–600; default 30). Null when no output file was asked for. */
export function parsePerfArgs(argv: string[]): { out: string; idleSeconds: number } | null {
  const value = (name: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const out = value('perf-out')
  if (!out) return null
  const idle = Number(value('perf-idle') ?? 30)
  return { out, idleSeconds: Number.isFinite(idle) ? Math.min(600, Math.max(5, Math.round(idle))) : 30 }
}

/** Per-process-type table of one sample set, plus the median-total sample's numbers (memory) and the average CPU. */
export function summarizeSamples(samples: ProcessMetric[][]): Record<string, unknown> {
  const totalOf = (s: ProcessMetric[]): number => s.reduce((a, p) => a + p.memory.workingSetSize, 0)
  const mid = [...samples].sort((a, b) => totalOf(a) - totalOf(b))[Math.floor(samples.length / 2)] ?? []
  const byType: Record<string, { count: number; rssMb: number; pssMb: number; cpuPct: number }> = {}
  for (const p of mid) {
    const e = (byType[p.type] ??= { count: 0, rssMb: 0, pssMb: 0, cpuPct: 0 })
    e.count++
    e.rssMb += p.memory.workingSetSize / 1024
  }
  // CPU: the average of every sample's per-type sum (Electron reports the share since its last call).
  for (const type of Object.keys(byType)) {
    const perSample = samples.map((s) =>
      s.filter((p) => p.type === type).reduce((a, p) => a + p.cpu.percentCPUUsage, 0)
    )
    byType[type]!.cpuPct = round(perSample.reduce((a, b) => a + b, 0) / Math.max(1, perSample.length), 1)
    byType[type]!.rssMb = round(byType[type]!.rssMb)
  }
  const cpuPct = round(
    Object.values(byType).reduce((a, e) => a + e.cpuPct, 0),
    1
  )
  return {
    processes: mid.length,
    // Working set (Windows) / resident size: the number the Task Manager's "Memory" column is closest to.
    rssMb: round(totalOf(mid) / 1024),
    pssMb: null,
    cpuPct,
    peakRssMb: round(Math.max(0, ...samples.map(totalOf)) / 1024),
    seconds: samples.length * 2,
    byType
  }
}

export async function runPerfProbe(o: PerfProbeOptions): Promise<void> {
  const now = o.now ?? Date.now
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const readyMs = now() - o.startedAt
  o.metrics() // the first call only starts the CPU interval
  const samples: ProcessMetric[][] = []
  for (let spent = 0; spent < o.idleSeconds * 1000; spent += 2000) {
    await sleep(2000)
    samples.push(o.metrics())
  }
  const idle = summarizeSamples(samples)
  const run = { run: 0, startup: { readyMs }, idle }
  const report = {
    label: 'in-app',
    tool: 'electron-in-app',
    env: { platform: o.platform },
    versions: o.versions,
    runs: [run],
    median: { startup: { readyMs }, idle },
    note: 'RSS column = working set; the window was in whatever state the data folder starts in (the sign-in screen when nobody is signed in).',
    medianCpu: median(samples.map((s) => s.reduce((a, p) => a + p.cpu.percentCPUUsage, 0)))
  }
  ;(o.write ?? writeFileSync)(o.out, JSON.stringify(report, null, 1))
  o.done()
}
