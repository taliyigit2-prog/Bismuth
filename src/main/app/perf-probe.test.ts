import { describe, expect, it } from 'vitest'
import { parsePerfArgs, runPerfProbe, summarizeSamples, type ProcessMetric } from './perf-probe'

const proc = (type: string, kb: number, cpu: number): ProcessMetric => ({
  type,
  memory: { workingSetSize: kb },
  cpu: { percentCPUUsage: cpu }
})

describe('perf probe arguments', () => {
  it('needs --perf-out; the idle time is kept between 5 and 600 seconds', () => {
    expect(parsePerfArgs(['--smoke'])).toBeNull()
    expect(parsePerfArgs(['--perf-out=a.json'])).toEqual({ out: 'a.json', idleSeconds: 30 })
    expect(parsePerfArgs(['--perf-out=a.json', '--perf-idle=120'])?.idleSeconds).toBe(120)
    expect(parsePerfArgs(['--perf-out=a.json', '--perf-idle=1'])?.idleSeconds).toBe(5)
    expect(parsePerfArgs(['--perf-out=a.json', '--perf-idle=99999'])?.idleSeconds).toBe(600)
    expect(parsePerfArgs(['--perf-out=a.json', '--perf-idle=abc'])?.idleSeconds).toBe(30)
  })
})

describe('perf probe summary', () => {
  it('sums memory per process type in MB and averages CPU over the samples', () => {
    const samples = [
      [proc('Browser', 204_800, 2), proc('Tab', 102_400, 4), proc('Tab', 102_400, 0)],
      [proc('Browser', 204_800, 0), proc('Tab', 102_400, 2), proc('Tab', 102_400, 0)]
    ]
    const s = summarizeSamples(samples) as {
      rssMb: number
      processes: number
      byType: Record<string, { rssMb: number; cpuPct: number; count: number }>
    }
    expect(s.processes).toBe(3)
    expect(s.rssMb).toBe(400)
    expect(s.byType['Tab']).toEqual({ count: 2, rssMb: 200, pssMb: 0, cpuPct: 3 })
    expect(s.byType['Browser']?.cpuPct).toBe(1)
  })

  it('writes a report once, samples every 2 s for the asked time, then quits', async () => {
    let written = ''
    let done = 0
    let waited = 0
    let t = 1000
    await runPerfProbe({
      out: 'x.json',
      idleSeconds: 6,
      startedAt: 0,
      platform: 'test',
      versions: {},
      metrics: () => [proc('Browser', 1024, 1)],
      done: () => void done++,
      now: () => t,
      sleep: async (ms) => {
        waited += ms
        t += ms
      },
      write: (_file, text) => void (written = text)
    })
    expect(waited).toBe(6000)
    expect(done).toBe(1)
    const report = JSON.parse(written) as {
      median: { startup: { readyMs: number }; idle: { seconds: number } }
    }
    expect(report.median.startup.readyMs).toBe(1000)
    expect(report.median.idle.seconds).toBe(6)
  })
})
