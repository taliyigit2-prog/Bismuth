// The computer's own facts for the camera setup (Faz 20 P20g, K-59): processor, memory, operating system. Read from
// Node's `os` module in the main process; nothing leaves the computer and nothing is stored (the profile it leads
// to is a setting).
import { arch, cpus, release, totalmem, platform } from 'node:os'

export interface Hardware {
  cpuModel: string
  cores: number
  ramGb: number
  platform: string
  osRelease: string
  arch: string
}

const clean = (text: string, max: number): string =>
  text.replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** `readOs` is replaceable so a test can describe any computer. */
export function readHardware(
  readOs: {
    cpus: typeof cpus
    totalmem: typeof totalmem
    platform: typeof platform
    release: typeof release
    arch: typeof arch
  } = { cpus, totalmem, platform, release, arch }
): Hardware {
  const list = readOs.cpus()
  return {
    cpuModel: clean(list[0]?.model ?? '', 120),
    cores: Math.max(1, list.length),
    ramGb: Math.round((readOs.totalmem() / 1024 ** 3) * 10) / 10,
    platform: clean(readOs.platform(), 20),
    osRelease: clean(readOs.release(), 60),
    arch: clean(readOs.arch(), 20)
  }
}
