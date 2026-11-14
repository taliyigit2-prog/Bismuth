// Camera performance profile (Faz 20 P20g, K-59, G-09): the setup wizard reads the computer (cores, memory) and
// suggests a profile; a profile sets how often the sidecar analyses a picture and how wide the live picture is.
// The limits that pick a profile and the values of each profile are a setting (`camera.profiles`, JSON), never code:
// this file holds the shape, the check and the pure rules. The values below are only the setting's default.
import * as z from 'zod'

export const CAMERA_PROFILES = ['light', 'standard', 'high'] as const
export const cameraProfileSchema = z.enum(CAMERA_PROFILES)
export type CameraProfile = z.infer<typeof cameraProfileSchema>

/** What a profile writes into the camera settings (same limits as the settings it fills). */
const profileValuesSchema = z
  .object({
    processEveryN: z.number().int().min(1).max(30),
    streamMaxWidth: z.number().int().min(320).max(1920),
    idleFaceScanEvery: z.number().int().min(0).max(30)
  })
  .strict()
export type CameraProfileValues = z.infer<typeof profileValuesSchema>

const positive = z.number().min(0).max(1024)
const rulesSchema = z
  .object({
    /** Below this memory (GB) or this many processor threads: "light". */
    lightBelowRamGb: positive,
    lightBelowCores: positive,
    /** At or above both: "high". Everything between is "standard". */
    highFromRamGb: positive,
    highFromCores: positive
  })
  .strict()

export const cameraProfileTableSchema = z
  .object({
    rules: rulesSchema,
    profiles: z
      .object({ light: profileValuesSchema, standard: profileValuesSchema, high: profileValuesSchema })
      .strict()
  })
  .strict()
export type CameraProfileTable = z.infer<typeof cameraProfileTableSchema>

export const DEFAULT_PROFILE_TABLE: CameraProfileTable = {
  rules: { lightBelowRamGb: 6, lightBelowCores: 4, highFromRamGb: 16, highFromCores: 8 },
  profiles: {
    light: { processEveryN: 5, streamMaxWidth: 640, idleFaceScanEvery: 6 },
    standard: { processEveryN: 3, streamMaxWidth: 960, idleFaceScanEvery: 3 },
    high: { processEveryN: 2, streamMaxWidth: 1280, idleFaceScanEvery: 2 }
  }
}
export const DEFAULT_PROFILE_TABLE_JSON = JSON.stringify(DEFAULT_PROFILE_TABLE)

/** The setting's text → the table, or null when it is not valid JSON of the right shape. */
export function parseProfileTable(json: string): CameraProfileTable | null {
  try {
    const parsed = cameraProfileTableSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export interface HardwareFacts {
  /** Processor threads the operating system reports. */
  cores: number
  /** Installed memory in gigabytes (1 GB = 1024³ bytes). */
  ramGb: number
}

/** The profile this computer suits (a missing/invalid table falls back to the default one). */
export function recommendProfile(hardware: HardwareFacts, table: CameraProfileTable | null): CameraProfile {
  const { rules } = table ?? DEFAULT_PROFILE_TABLE
  if (hardware.ramGb < rules.lightBelowRamGb || hardware.cores < rules.lightBelowCores) return 'light'
  if (hardware.ramGb >= rules.highFromRamGb && hardware.cores >= rules.highFromCores) return 'high'
  return 'standard'
}

/** The settings a chosen profile writes (`camera.profile` and the three it governs). */
export function profileSettings(
  profile: CameraProfile,
  table: CameraProfileTable | null
): {
  'camera.profile': CameraProfile
  'camera.processEveryN': number
  'camera.streamMaxWidth': number
  'camera.idleFaceScanEvery': number
} {
  const v = (table ?? DEFAULT_PROFILE_TABLE).profiles[profile]
  return {
    'camera.profile': profile,
    'camera.processEveryN': v.processEveryN,
    'camera.streamMaxWidth': v.streamMaxWidth,
    'camera.idleFaceScanEvery': v.idleFaceScanEvery
  }
}
