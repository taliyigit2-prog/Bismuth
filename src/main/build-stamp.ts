// The build stamp electron.vite.config.ts writes into the main bundle (commit short id + commit day). Tests and
// tools that run the sources directly have no stamp: both fields are null and the About screen leaves the rows out.
declare const __BISMUTH_BUILD__: { commit: string | null; date: string | null } | undefined

export interface BuildStamp {
  commit: string | null
  date: string | null
}

export function buildStamp(): BuildStamp {
  if (typeof __BISMUTH_BUILD__ === 'undefined') return { commit: null, date: null }
  return { commit: __BISMUTH_BUILD__.commit, date: __BISMUTH_BUILD__.date }
}
