#!/usr/bin/env node
// Runs every Bismuth guard and the native Antigravity PreToolUse hook with sample inputs and checks the expected
// exit code (and, where it matters, stdout/stderr and side effects). Fixture projects are created in the OS temp
// directory and removed at the end; the real repository is never modified.
// Usage: node scripts/guards/test-guards.mjs
import { spawnSync, execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const agyHook = join(root, '.agent', 'hooks', 'pre-tool-use.mjs')
const pm = ['npm', 'install'].join(' ') // avoids tripping deps-guard on this file's own text
const commit = ['git', 'commit'].join(' ')

// Guards and fixture git commands must not inherit GIT_DIR & co. (e.g. when this runs inside a git hook).
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))

// ---------- fixture projects ----------
const tmpRoot = mkdtempSync(join(tmpdir(), 'bismuth-guards-'))
const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}
const project = (name, { scripts, nodeModules = true, git = false, files = {} } = {}) => {
  const dir = join(tmpRoot, name)
  mkdirSync(dir, { recursive: true })
  if (scripts) write(join(dir, 'package.json'), JSON.stringify({ name, private: true, scripts }, null, 2))
  if (nodeModules) mkdirSync(join(dir, 'node_modules'), { recursive: true })
  for (const [rel, text] of Object.entries(files)) write(join(dir, rel), text)
  if (git) execFileSync('git', ['init', '-q'], { cwd: dir, env: baseEnv, stdio: 'ignore' })
  return dir
}
const ok = 'node -e "process.exit(0)"'
const allScripts = { typecheck: ok, lint: ok, test: ok, check: ok }
const marker = (dir) => join(dir, '.cache', '.checks-passed')
const future = (s) => new Date(Date.now() + s * 1000)

const pEmpty = project('empty')
const pPartial = project('partial', { scripts: { typecheck: ok, lint: ok } })
const pNoModules = project('no-modules', { scripts: allScripts, nodeModules: false })
const pPass = project('pass', { scripts: allScripts })
const pFail = project('fail', {
  scripts: { ...allScripts, test: 'node -e "console.error(\'FAILTEST: 1 test failed\');process.exit(1)"' }
})
const pKbsSheet = project('kbs-sheet', {
  git: true,
  files: { 'data/EGM_Konaklayan_Listesi.xlsx': 'PK\u0003\u0004' }
})
// Built at run time so this file itself never holds a valid identity number (the guard would block it).
const fakeIdentity = ['123456', '78950'].join('')
const pKbsNumber = project('kbs-number', {
  git: true,
  files: { 'src/guest.ts': `export const id = '${fakeIdentity}'\n` }
})
// A valid-checksum number inside a hex checksum (lock files) is not an identity number.
const pKbsHash = project('kbs-hash', {
  git: true,
  files: { 'Cargo.lock': `checksum = "ab${fakeIdentity}cd"\n` }
})
const pKbsClean = project('kbs-clean', {
  git: true,
  files: {
    'src/guest.ts':
      "export const sample = '10000000146' // public test number\nexport const phone = '05321234567'\n"
  }
})
// Docs-only change in a checkout whose tests fail: the gate must skip the toolchain (nothing it checks changed).
const failScripts = {
  ...allScripts,
  test: 'node -e "console.error(\'FAILTEST: 1 test failed\');process.exit(1)"'
}
const pDocsOnly = project('docs-only', {
  scripts: failScripts,
  git: true,
  files: {
    '.gitignore': 'node_modules\n',
    'docs/analiz/not.md': '# belge\n',
    '.agent/rules/x.md': '# kural\n'
  }
})
const pDocsCode = project('docs-code', {
  scripts: failScripts,
  git: true,
  files: { '.gitignore': 'node_modules\n', 'docs/not.md': '# belge\n', 'src/a.ts': 'export const a = 1\n' }
})
for (const dir of [pDocsOnly, pDocsCode]) {
  const g = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      env: baseEnv,
      stdio: 'ignore'
    })
  g('add', 'package.json', '.gitignore')
  g('commit', '-q', '-m', 'init')
}
// camera-data-guard fixtures: a face crop, a weight file and a bot token in the tree; a clean tree with a docs image.
const pCamFace = project('cam-face', {
  git: true,
  files: { 'otel-kamera/guest_photos/guest_1.jpg': '\xff\xd8' }
})
const pCamWeights = project('cam-weights', { git: true, files: { 'otel-kamera/yolo11n.pt': 'PK' } })
const pCamToken = project('cam-token', {
  git: true,
  files: {
    'otel-kamera/config.py':
      "TOKEN='" + ['1234567890', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'].join(':') + "'\n"
  }
})
const pCamClean = project('cam-clean', {
  git: true,
  files: {
    'docs/analiz/ekler/ekran.png': '\x89PNG',
    'otel-kamera/.env.example': 'TELEGRAM_BOT_TOKEN=\n',
    'src/a.ts': 'export const a = 1\n'
  }
})
// A git checkout (a worktree, say) whose tests fail, while the project dir passes.
const pGitFail = project('git-fail', {
  scripts: { ...allScripts, test: 'node -e "console.error(\'FAILTEST: 1 test failed\');process.exit(1)"' },
  git: true
})
const pStop = project('stop', {
  scripts: allScripts,
  git: true,
  files: { 'src/app.ts': 'export const a = 1;\n' }
})
const pStopDocs = project('stop-docs', {
  scripts: allScripts,
  git: true,
  files: { 'docs/notes.md': '# not code\n' }
})
const pStopDrizzle = project('stop-drizzle', {
  scripts: allScripts,
  git: true,
  files: { 'drizzle/0001_x.sql': 'select 1;\n' }
})
const pStopPkg = project('stop-pkg', {
  scripts: allScripts,
  git: true,
  files: { 'docs/notes.md': '# not code\n' }
})
for (const dir of [pStopDocs, pStopPkg]) {
  const g = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      env: baseEnv,
      stdio: 'ignore'
    })
  g('add', 'package.json')
  g('commit', '-q', '-m', 'init')
}
write(
  join(pStopPkg, 'package.json'),
  JSON.stringify({ name: 'stop-pkg', private: true, scripts: { ...allScripts, extra: ok } }, null, 2)
)
const pStopLock = project('stop-lock', {
  scripts: allScripts,
  git: true,
  files: { 'package-lock.json': '{}\n' }
})
const pStopBuilder = project('stop-builder', {
  scripts: allScripts,
  git: true,
  files: { 'electron-builder.yml': 'asar: true\n' }
})
const pStopGh = project('stop-gh', {
  scripts: allScripts,
  git: true,
  files: { '.github/workflows/ci.yml': 'name: ci\n' }
})
const pNpmrc = project('npmrc', { scripts: allScripts, files: { '.npmrc': 'save-exact=true\n' } })
const pFmt = project('fmt', {
  scripts: allScripts,
  files: {
    'src/a.ts': 'const a = 1\n',
    'vitest.config.ts': 'export default {}\n',
    'docs/x.ts': 'const x = 1\n',
    'drizzle/meta/_journal.json': '{}\n',
    'src/readme.md': '# md\n',
    // Fake prettier: records its arguments so the test can see whether (and how) the hook called it.
    'node_modules/.bin/prettier':
      "#!/usr/bin/env node\nrequire('fs').appendFileSync(require('path').join(__dirname, '..', '..', 'prettier-calls.log'), process.argv.slice(2).join(' ') + '\\n');\n",
    'node_modules/.bin/prettier.cmd': '@node "%~dp0prettier" %*\r\n'
  }
})
chmodSync(join(pFmt, 'node_modules', '.bin', 'prettier'), 0o755)
const fmtLog = join(pFmt, 'prettier-calls.log')
const fmtCalls = () =>
  existsSync(fmtLog) ? readFileSync(fmtLog, 'utf8').trim().split('\n').filter(Boolean) : []
const fmtCase = (rel, expectCall, note) => ({
  script: join(here, 'format-file.mjs'),
  env: { BISMUTH_PROJECT_DIR: pFmt },
  input: { cwd: pFmt, tool_name: 'Edit', tool_input: { file_path: join(pFmt, rel) } },
  expect: 0,
  note,
  before: () => rmSync(fmtLog, { force: true }),
  after: () => {
    const calls = fmtCalls()
    if (!expectCall) return calls.length === 0 ? null : `prettier beklenmedik şekilde çağrıldı: ${calls[0]}`
    if (calls.length !== 1) return `prettier ${calls.length} kez çağrıldı (beklenen 1)`
    return calls[0].startsWith('--write ') && calls[0].replace(/\\/g, '/').endsWith(rel)
      ? null
      : `argümanlar: ${calls[0]}`
  }
})
const tsx = (content, file = 'src/renderer/features/today/today-page.tsx') => ({
  cwd: root,
  tool_name: 'Write',
  tool_input: { file_path: join(tmpRoot, 'nowhere', file), content }
})
const warns = /"additionalContext":"i18n uyarısı/
const agyCase = (name, args, expectDecision, note, extra = {}) => ({
  script: agyHook,
  label: 'pre-tool-use.mjs',
  input: { toolCall: { id: 'tc_1', name, args }, cwd: extra.cwd ?? root },
  expect: 0,
  stdout: new RegExp(`"decision":"${expectDecision}"`),
  note,
  ...extra
})

const cases = [
  // ---------- db-migration-guard ----------
  {
    script: join(here, 'db-migration-guard.mjs'),
    input: { cwd: root, tool_name: 'Edit', tool_input: { file_path: 'drizzle/0002_new.sql' } },
    expect: 0,
    note: 'untracked migration passes'
  },
  {
    script: join(here, 'db-migration-guard.mjs'),
    input: { cwd: root, tool_name: 'Edit', tool_input: { file_path: 'docs/plan/README.md' } },
    expect: 0,
    note: 'non-migration passes'
  },

  // ---------- protect-files ----------
  {
    script: join(here, 'protect-files.mjs'),
    input: { cwd: root, tool_name: 'Edit', tool_input: { file_path: 'docs/plan/01-gereksinimler.md' } },
    expect: 2,
    note: 'requirements blocked'
  },
  {
    script: join(here, 'protect-files.mjs'),
    input: { cwd: root, tool_name: 'Edit', tool_input: { file_path: 'package-lock.json' } },
    expect: 2,
    note: 'lockfile blocked'
  },
  {
    script: join(here, 'protect-files.mjs'),
    env: { HOTEL_CRM_ALLOW_PROTECTED: '1' },
    input: { cwd: root, tool_name: 'Edit', tool_input: { file_path: 'docs/plan/01-gereksinimler.md' } },
    expect: 2,
    note: 'no escape variable'
  },
  {
    script: join(here, 'protect-files.mjs'),
    input: { cwd: root, tool_name: 'Edit', tool_input: { file_path: 'docs/plan/03-mimari.md' } },
    expect: 0,
    note: 'other doc passes'
  },

  // ---------- deps-guard ----------
  {
    script: join(here, 'deps-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: `${pm} electron-updater` } },
    expect: 2,
    note: 'blocked package'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Bash',
      tool_input: { command: ['npm', '--no-audit', 'install', 'electron-updater'].join(' ') }
    },
    expect: 2,
    note: 'flag before install blocked'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Bash',
      tool_input: { command: `${pm} --save-exact 'x@npm:electron-updater'` }
    },
    expect: 2,
    note: 'quoted npm alias blocked'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Bash',
      tool_input: { command: `${pm} --save-exact update-electron-app` }
    },
    expect: 2,
    note: 'update-electron-app blocked'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    env: { BISMUTH_PROJECT_DIR: pEmpty },
    input: { cwd: pEmpty, tool_name: 'Bash', tool_input: { command: `${pm} zod` } },
    expect: 2,
    note: 'no save-exact blocked'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    env: { BISMUTH_PROJECT_DIR: pNpmrc },
    input: { cwd: pNpmrc, tool_name: 'Bash', tool_input: { command: `${pm} zod` } },
    expect: 0,
    note: '.npmrc save-exact passes'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: `${pm} --save-exact zod` } },
    expect: 0,
    note: 'save-exact passes'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: 'yarn add electron-updater' } },
    expect: 2,
    note: 'yarn add: blocked package'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: 'yarn global add @sentry/node' } },
    expect: 2,
    note: 'yarn global add: blocked package'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    env: { BISMUTH_PROJECT_DIR: pEmpty },
    input: { cwd: pEmpty, tool_name: 'Bash', tool_input: { command: 'yarn add zod' } },
    expect: 2,
    note: 'yarn add without exact blocked'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: 'yarn add --exact zod' } },
    expect: 0,
    note: 'yarn add --exact passes'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: pm } },
    expect: 0,
    note: 'bare install passes'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: {
      cwd: '/nonexistent',
      tool_name: 'Bash',
      tool_input: { command: `sed -i "s/a/b/" x.json && ${pm} --no-audit 2>&1 | tail -3` }
    },
    expect: 0,
    note: 'sed -i is not npm i'
  },
  {
    script: join(here, 'deps-guard.mjs'),
    input: {
      cwd: '/nonexistent',
      tool_name: 'Bash',
      tool_input: { command: `cd app && ${pm} --save-exact -D @sentry/electron` }
    },
    expect: 2,
    note: 'blocked scoped package'
  },

  // ---------- no-network-guard ----------
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/renderer/features/x.tsx',
        content: 'const r = await fetch("https://api.example.com")'
      }
    },
    expect: 2,
    note: 'renderer fetch blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/network/tcmb.ts',
        content: 'fetch("https://www.tcmb.gov.tr/kurlar/today.xml")'
      }
    },
    expect: 0,
    note: 'network module passes'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/discovery/index.ts',
        content: 'const r = await fetch("http://127.0.0.1:7373")'
      }
    },
    expect: 0,
    note: 'discovery module passes'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/renderer/index.html',
        content: '<link href="https://fonts.googleapis.com/css" rel="stylesheet">'
      }
    },
    expect: 2,
    note: 'CDN stylesheet blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: { file_path: 'src/shared/money.ts', content: 'export const x = 1;' }
    },
    expect: 0,
    note: 'plain code passes'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: { file_path: 'src/main/server/app.ts', content: 'serve({ fetch: app.fetch, port })' }
    },
    expect: 0,
    note: 'host-mode server passes'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/renderer/lib/transport/http.ts',
        content: 'await fetch(`${baseUrl}/api`)'
      }
    },
    expect: 0,
    note: 'client transport passes'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/renderer/features/today/page.tsx',
        content: 'await fetch(`${baseUrl}/api`)'
      }
    },
    expect: 2,
    note: 'fetch in a feature blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/bridge.ts',
        content: 'await fetch("http://127.0.0.1:47511/api/health", { headers })'
      }
    },
    expect: 0,
    note: 'camera: fetch to the 127.0.0.1 sidecar passes'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/bridge.ts',
        content: 'const base = `http://${BRIDGE_HOST}:${port}`; await fetch(`${base}/api/x`)'
      }
    },
    expect: 0,
    note: 'camera: templated loopback base passes'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/sidecar.ts',
        content: 'const url = "rtsp:' + '//admin:pw@192.168.1.64:554/Streaming/Channels/101"'
      }
    },
    expect: 0,
    note: 'camera: rtsp:// target passes'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/bridge.ts',
        content: 'await fetch("https://api.example.com/upload")'
      }
    },
    expect: 2,
    stderr: /127\.0\.0\.1/,
    note: 'camera: outside https blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/bridge.ts',
        content: 'await fetch("http://127.0.0.1.evil.com/x")'
      }
    },
    expect: 2,
    note: 'camera: loopback-looking host blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/bridge.ts',
        content: 'await fetch("http://localhost@evil.com/x")'
      }
    },
    expect: 2,
    note: 'camera: userinfo trick blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: { file_path: 'src/main/camera/bridge.ts', content: 'await fetch("http://192.168.1.20/x")' }
    },
    expect: 2,
    note: 'camera: LAN http blocked (the camera is reached by rtsp inside the sidecar)'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: { file_path: 'src/main/camera/sidecar.ts', content: "server.listen(port, '0.0.0.0')" }
    },
    expect: 2,
    stderr: /0\.0\.0\.0/,
    note: 'camera: binding 0.0.0.0 blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: { file_path: 'src/main/camera/bridge.ts', content: 'new WebSocket("ws://127.0.0.1:1/x")' }
    },
    expect: 2,
    note: 'camera: WebSocket blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/network/telegram/index.ts',
        content: 'await fetch("https://api.telegram.org/bot/x")'
      }
    },
    expect: 0,
    note: 'telegram client in src/main/network passes'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/discovery.ts',
        content:
          "const NS = 'http://schemas.xmlsoap.org/ws/2005/04/discovery'; socket.send(probe, 3702, '239.255.255.250')"
      }
    },
    expect: 0,
    note: 'camera search: WS-Discovery namespace and multicast group pass'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/discovery.ts',
        content: "await fetch('https://api.example.com/x')"
      }
    },
    expect: 2,
    note: 'camera search: an outside URL is still blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/discovery.ts',
        content: "const NS = 'http://schemas.xmlsoap.org.evil.com/ws/2005/04/discovery'"
      }
    },
    expect: 2,
    note: 'camera search: look-alike namespace host blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/camera/bridge.ts',
        content: "const NS = 'http://schemas.xmlsoap.org/ws/2005/04/discovery'"
      }
    },
    expect: 2,
    note: 'camera: the namespace exception is for discovery.ts alone'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: { file_path: 'src/main/camera/discovery.ts', content: "socket.bind(37020, '0.0.0.0')" }
    },
    expect: 2,
    note: 'camera search: binding 0.0.0.0 blocked'
  },
  {
    script: join(here, 'no-network-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/main/services/camera-service.ts',
        content: 'await fetch("http://127.0.0.1:1/x")'
      }
    },
    expect: 2,
    note: 'camera network code outside src/main/camera blocked'
  },

  // ---------- pre-commit-gate ----------
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pEmpty },
    input: { cwd: pEmpty, tool_name: 'Bash', tool_input: { command: `${commit} -m x` } },
    expect: 0,
    stderr: /package\.json yok/,
    note: 'no package.json: fail-open'
  },
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pPartial },
    input: { cwd: pPartial, tool_name: 'Bash', tool_input: { command: `${commit} -m x` } },
    expect: 0,
    stderr: /test betiği yok/,
    note: 'missing test script: fail-open'
  },
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pNoModules },
    input: { cwd: pNoModules, tool_name: 'Bash', tool_input: { command: `${commit} -m x` } },
    expect: 0,
    stderr: /node_modules yok/,
    note: 'no node_modules: fail-open'
  },
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pFail },
    input: { cwd: pFail, tool_name: 'Bash', tool_input: { command: 'git status --short' } },
    expect: 0,
    note: 'not a commit: checks not run'
  },
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pFail },
    input: { cwd: pFail, tool_name: 'Bash', tool_input: { command: `git add -A && ${commit} -m "feat: x"` } },
    expect: 2,
    stderr: /npm test.*başarısız[\s\S]*FAILTEST/,
    note: 'failing test blocks the commit',
    after: () => (existsSync(marker(pFail)) ? 'başarısız koşuda .checks-passed yazılmış' : null)
  },
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pPass },
    input: { cwd: pPass, tool_name: 'Bash', tool_input: { command: `${commit} -m "feat: x"` } },
    expect: 0,
    note: 'all green: commit passes, marker written',
    after: () =>
      existsSync(marker(pPass)) && !Number.isNaN(Date.parse(readFileSync(marker(pPass), 'utf8').trim()))
        ? null
        : '.checks-passed yazılmadı'
  },
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pDocsOnly },
    input: {
      cwd: pDocsOnly,
      tool_name: 'Bash',
      tool_input: { command: `git add -A && ${commit} -m "docs: x"` }
    },
    expect: 0,
    stderr: /yalnız belge\/ayar\/koruma/,
    note: 'docs-only commit: toolchain skipped even though tests would fail'
  },
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pDocsCode },
    input: {
      cwd: pDocsCode,
      tool_name: 'Bash',
      tool_input: { command: `git add -A && ${commit} -m "feat: x"` }
    },
    expect: 2,
    stderr: /FAILTEST/,
    note: 'docs + code commit: toolchain runs'
  },
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pDocsOnly },
    input: { cwd: pDocsOnly, tool_name: 'Bash', tool_input: { command: `${commit} -m "docs: x"` } },
    expect: 2,
    stderr: /FAILTEST/,
    note: 'nothing staged and no add: cannot tell, toolchain runs'
  },

  // ---------- workflow-guard ----------
  {
    script: join(here, 'workflow-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: 'gh workflow run ci.yml' } },
    expect: 2,
    stderr: /gh workflow run/,
    note: 'workflow dispatch: blocked'
  },
  {
    script: join(here, 'workflow-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: 'gh run rerun 123' } },
    expect: 2,
    stderr: /gh run rerun/,
    note: 'rerun: blocked'
  },
  {
    script: join(here, 'workflow-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: 'gh release create v1.0.1 dist/*' } },
    expect: 2,
    stderr: /gh release create/,
    note: 'release create: blocked'
  },
  {
    script: join(here, 'workflow-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Bash',
      tool_input: { command: 'gh api -X POST repos/o/r/actions/workflows/ci.yml/dispatches' }
    },
    expect: 2,
    stderr: /POST|dispatches/,
    note: 'REST dispatch: blocked'
  },
  {
    script: join(here, 'workflow-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Bash',
      tool_input: { command: 'gh run list --limit 5 && gh run view 123 --log | tail -20' }
    },
    expect: 0,
    note: 'read-only gh: allowed'
  },
  {
    script: join(here, 'workflow-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: "git tag v1.0.1 -m 'release'" } },
    expect: 2,
    stderr: /v1\.0\.1/,
    note: 'version tag: blocked'
  },
  {
    script: join(here, 'workflow-guard.mjs'),
    input: {
      cwd: root,
      tool_name: 'Bash',
      tool_input: { command: "git tag -l 'v*' && git tag archive/faz0" }
    },
    expect: 0,
    note: 'listing and non-version tag: allowed'
  },
  {
    script: join(here, 'workflow-guard.mjs'),
    input: { cwd: root, tool_name: 'Bash', tool_input: { command: "echo 'gh workflow run ci.yml'" } },
    expect: 0,
    note: 'text mentioning gh: not a command'
  },

  // ---------- camera-data-guard ----------
  {
    script: join(here, 'camera-data-guard.mjs'),
    input: { cwd: pCamFace, tool_name: 'Bash', tool_input: { command: 'git add -A' } },
    expect: 2,
    stderr: /guest_photos/,
    note: 'face crop in the tree: blocked'
  },
  {
    script: join(here, 'camera-data-guard.mjs'),
    input: { cwd: pCamWeights, tool_name: 'Bash', tool_input: { command: `${commit} -am x` } },
    expect: 2,
    stderr: /yolo11n\.pt/,
    note: 'model weights: blocked'
  },
  {
    script: join(here, 'camera-data-guard.mjs'),
    input: { cwd: pCamToken, tool_name: 'Bash', tool_input: { command: 'git add otel-kamera' } },
    expect: 2,
    stderr: /Telegram/,
    note: 'bot token text: blocked'
  },
  {
    script: join(here, 'camera-data-guard.mjs'),
    input: { cwd: pCamClean, tool_name: 'Bash', tool_input: { command: 'git add -A' } },
    expect: 0,
    note: 'docs image, .env.example and code: allowed'
  },
  {
    script: join(here, 'camera-data-guard.mjs'),
    input: { cwd: pCamFace, tool_name: 'Bash', tool_input: { command: 'git status --short' } },
    expect: 0,
    note: 'not add/commit: ignored'
  },

  // ---------- kbs-data-guard ----------
  {
    script: join(here, 'kbs-data-guard.mjs'),
    input: { cwd: pKbsSheet, tool_name: 'Bash', tool_input: { command: 'git add -A' } },
    expect: 2,
    stderr: /EGM_Konaklayan_Listesi\.xlsx/,
    note: 'spreadsheet in the changes: blocked'
  },
  {
    script: join(here, 'kbs-data-guard.mjs'),
    input: { cwd: pKbsNumber, tool_name: 'Bash', tool_input: { command: `${commit} -am x` } },
    expect: 2,
    stderr: /src\/guest\.ts:1/,
    note: 'valid identity number: blocked'
  },
  {
    script: join(here, 'kbs-data-guard.mjs'),
    input: { cwd: pKbsClean, tool_name: 'Bash', tool_input: { command: 'git add -A' } },
    expect: 0,
    note: 'public test number and a phone number pass'
  },
  {
    script: join(here, 'kbs-data-guard.mjs'),
    input: { cwd: pKbsHash, tool_name: 'Bash', tool_input: { command: 'git add -A' } },
    expect: 0,
    note: 'digits inside a hex checksum pass'
  },
  {
    script: join(here, 'kbs-data-guard.mjs'),
    input: { cwd: pKbsClean, tool_name: 'Bash', tool_input: { command: `cd ${pKbsSheet} && git add -A` } },
    expect: 2,
    stderr: /xlsx/,
    note: 'cd <dir> && git add: that checkout is scanned'
  },
  {
    script: join(here, 'kbs-data-guard.mjs'),
    input: { cwd: pKbsSheet, tool_name: 'Bash', tool_input: { command: 'git status --short' } },
    expect: 0,
    note: 'not add/commit: ignored'
  },

  // ---------- push-guard ----------
  {
    script: join(here, 'push-guard.mjs'),
    input: {
      cwd: pKbsClean,
      tool_name: 'Bash',
      tool_input: { command: 'git push -u origin antigravity/some-session' }
    },
    expect: 0,
    note: 'work branch: allowed'
  },
  {
    script: join(here, 'push-guard.mjs'),
    input: {
      cwd: pKbsClean,
      tool_name: 'Bash',
      tool_input: { command: 'git push -u origin antigravity/x 2>&1 | tail -1' }
    },
    expect: 0,
    note: 'pipe and redirection are not refspecs'
  },
  {
    script: join(here, 'push-guard.mjs'),
    input: { cwd: pKbsClean, tool_name: 'Bash', tool_input: { command: 'git push origin main > log.txt' } },
    expect: 2,
    stderr: /'main'/,
    note: 'redirection after a forbidden target: still blocked'
  },
  {
    script: join(here, 'push-guard.mjs'),
    input: {
      cwd: pKbsClean,
      tool_name: 'Bash',
      tool_input: { command: "python3 - <<'EOF'\nprint('git push origin main')\nEOF" }
    },
    expect: 0,
    note: 'text that mentions a push is not a push'
  },
  {
    script: join(here, 'push-guard.mjs'),
    input: { cwd: pKbsClean, tool_name: 'Bash', tool_input: { command: 'git push origin main' } },
    expect: 2,
    stderr: /'main'/,
    note: 'main: blocked'
  },
  {
    script: join(here, 'push-guard.mjs'),
    input: {
      cwd: pKbsClean,
      tool_name: 'Bash',
      tool_input: { command: 'git push origin HEAD:refs/heads/release' }
    },
    expect: 2,
    stderr: /'release'/,
    note: 'HEAD:other branch: blocked'
  },
  {
    script: join(here, 'push-guard.mjs'),
    input: {
      cwd: pKbsClean,
      tool_name: 'Bash',
      tool_input: { command: 'git push --force origin antigravity/x' }
    },
    expect: 2,
    stderr: /force/,
    note: '--force: blocked'
  },
  {
    script: join(here, 'push-guard.mjs'),
    input: {
      cwd: pKbsClean,
      tool_name: 'Bash',
      tool_input: { command: 'git push --force-with-lease origin antigravity/x' }
    },
    expect: 0,
    note: '--force-with-lease: allowed'
  },
  {
    script: join(here, 'push-guard.mjs'),
    input: {
      cwd: pKbsClean,
      tool_name: 'Bash',
      tool_input: { command: 'git fetch origin && git push origin +antigravity/x' }
    },
    expect: 2,
    stderr: /refspec/,
    note: '+refspec: blocked'
  },

  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pPass },
    input: { cwd: pGitFail, tool_name: 'Bash', tool_input: { command: `${commit} -m "feat: x"` } },
    expect: 2,
    stderr: /FAILTEST/,
    note: 'commit in another checkout (worktree): that checkout is checked, not the project dir'
  },
  {
    script: join(here, 'pre-commit-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pPass },
    input: {
      cwd: pPass,
      tool_name: 'Bash',
      tool_input: { command: `cd ${pGitFail} && ${commit} -m "feat: x"` }
    },
    expect: 2,
    stderr: /FAILTEST/,
    note: 'cd <worktree> && git commit: that checkout is checked'
  },

  // ---------- stop-gate ----------
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pEmpty },
    input: { cwd: pEmpty, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /^$/,
    note: 'no package.json: fail-open'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pPartial },
    input: { cwd: pPartial, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /^$/,
    note: 'missing scripts: fail-open'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStop },
    input: { cwd: pStop, hook_event_name: 'Stop', stop_hook_active: true },
    expect: 0,
    stdout: /^$/,
    note: 'stop_hook_active: no loop'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStop },
    input: { cwd: pStop, hookEventName: 'Stop', continuationActive: true },
    expect: 0,
    stdout: /^$/,
    note: 'continuationActive: no loop'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStopDocs },
    input: { cwd: pStopDocs, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /^$/,
    note: 'only docs changed: no block'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStop },
    input: { cwd: pStop, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /"decision":"block".*src\/app\.ts.*npm run check/,
    note: 'untracked src file, no marker: block'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStopDrizzle },
    input: { cwd: pStopDrizzle, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /"decision":"block".*drizzle\/0001_x\.sql/,
    note: 'drizzle/ change: block'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStopPkg },
    input: { cwd: pStopPkg, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /"decision":"block".*package\.json/,
    note: 'package.json change: block'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStopLock },
    input: { cwd: pStopLock, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /"decision":"block".*package-lock\.json/,
    note: 'package-lock.json change: block'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStopBuilder },
    input: { cwd: pStopBuilder, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /"decision":"block".*electron-builder\.yml/,
    note: 'electron-builder.yml change: block'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStopGh },
    input: { cwd: pStopGh, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /"decision":"block".*\.github\/workflows\/ci\.yml/,
    note: '.github/ change: block'
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStop },
    input: { cwd: pStop, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /^$/,
    note: 'marker newer than changes: pass',
    before: () => {
      write(marker(pStop), `${new Date().toISOString()}\n`)
      utimesSync(marker(pStop), future(60), future(60))
    }
  },
  {
    script: join(here, 'stop-gate.mjs'),
    env: { BISMUTH_PROJECT_DIR: pStop },
    input: { cwd: pStop, hook_event_name: 'Stop', stop_hook_active: false },
    expect: 0,
    stdout: /"decision":"block"/,
    note: 'edit after marker: block again',
    before: () => {
      write(join(pStop, 'tests', 'app.test.ts'), "it.todo('x');\n")
      utimesSync(join(pStop, 'tests', 'app.test.ts'), future(120), future(120))
    }
  },

  // ---------- format-file ----------
  fmtCase('src/a.ts', true, 'src file formatted'),
  fmtCase('vitest.config.ts', true, 'root config formatted'),
  fmtCase('docs/x.ts', false, 'docs/ skipped'),
  fmtCase('drizzle/meta/_journal.json', false, 'drizzle/ skipped'),
  fmtCase('src/readme.md', false, 'non-code extension skipped'),
  {
    script: join(here, 'format-file.mjs'),
    env: { BISMUTH_PROJECT_DIR: pEmpty },
    input: { cwd: pEmpty, tool_name: 'Write', tool_input: { file_path: join(pEmpty, 'src', 'missing.ts') } },
    expect: 0,
    note: 'no prettier installed: silent'
  },
  { script: join(here, 'format-file.mjs'), input: 'not json', expect: 0, note: 'bad input never blocks' },

  // ---------- i18n-literal-warn ----------
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx('export const A = () => <Button>Kaydet</Button>;\n'),
    expect: 0,
    stdout: /i18n uyarısı[\s\S]*satır 1: >Kaydet</,
    note: 'JSX literal warns'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx("export const A = () => <Button>{t('common.save')}</Button>;\n"),
    expect: 0,
    stdout: /^$/,
    note: 't() passes'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx('<Input placeholder="Misafir ara" />\n'),
    expect: 0,
    stdout: warns,
    note: 'placeholder literal warns'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx('<Input placeholder={t("guests.search")} aria-label={t("guests.search")} />\n'),
    expect: 0,
    stdout: /^$/,
    note: 'translated props pass'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx('<h1 className="text-xl font-semibold">Rezervasyonlar</h1>\n'),
    expect: 0,
    stdout: /Rezervasyonlar/,
    note: 'className line still checked'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx('<div data-testid="empty-state" className="p-4" />\n'),
    expect: 0,
    stdout: /^$/,
    note: 'testid/className values ignored'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx('<p>\n  Henüz rezervasyon yok\n</p>\n'),
    expect: 0,
    stdout: /satır 2: Henüz rezervasyon yok/,
    note: 'wrapped text node warns'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx('<span>{count} kişi</span>\n'),
    expect: 0,
    stdout: /kişi/,
    note: 'text after expression warns'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx("const nav = [{ to: '/calendar', label: 'Takvim', icon: CalendarIcon }];\n"),
    expect: 0,
    stdout: /label: 'Takvim'/,
    note: 'nav label literal warns'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx(
      [
        'import { Button } from "@/components/ui/button";',
        '// Kaydet düğmesi',
        '/* <p>Eski metin</p> */',
        'const [open, setOpen] = useState<boolean>(false);',
        'const ref = useRef<HTMLDivElement>(null);',
        'const rows = items.filter((x) => x.total < 3 && x.paid > 0);',
        'type P = Promise<void> | Array<string>;',
        'function f<T extends object>(props: Props<T>) {}',
        "const nav = [{ to: '/calendar', labelKey: 'nav.calendar', title: 'nav.calendarTitle' }];",
        '<SelectItem value="tr">{t("lang.tr")}</SelectItem>',
        'return (\n  <>\n    {items.map((i) => (\n      <Row key={i.id} item={i} />\n    ))}\n  </>\n);'
      ].join('\n')
    ),
    expect: 0,
    stdout: /^$/,
    note: 'code, comments, generics, keys: no warning'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: {
      cwd: root,
      tool_name: 'Edit',
      tool_input: {
        file_path: join(tmpRoot, 'nowhere/src/renderer/features/x/x.tsx'),
        old_string: 'a',
        new_string: '<Label>Ad soyad</Label>'
      }
    },
    expect: 0,
    stdout: /değişiklikte satır 1: >Ad soyad</,
    note: 'Edit new_string checked'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: {
      cwd: root,
      tool_name: 'MultiEdit',
      tool_input: {
        file_path: join(tmpRoot, 'nowhere/src/renderer/features/x/x.tsx'),
        edits: [{ old_string: 'a', new_string: '<img alt="Oda fotoğrafı" />' }]
      }
    },
    expect: 0,
    stdout: warns,
    note: 'MultiEdit edits checked'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    note: 'line number taken from the file on disk',
    input: {
      cwd: root,
      tool_name: 'Edit',
      tool_input: {
        file_path: join(tmpRoot, 'real/src/renderer/features/x/x.tsx'),
        old_string: 'a',
        new_string: '    <Badge>Ödendi</Badge>'
      }
    },
    expect: 0,
    stdout: /- satır 3: >Ödendi</,
    before: () =>
      write(
        join(tmpRoot, 'real/src/renderer/features/x/x.tsx'),
        'export const X = () => (\n  <div>\n    <Badge>Ödendi</Badge>\n  </div>\n);\n'
      )
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx('<Button>Kaydet</Button>\n', 'src/main/menu.tsx'),
    expect: 0,
    stdout: /^$/,
    note: 'outside renderer ignored'
  },
  {
    script: join(here, 'i18n-literal-warn.mjs'),
    input: tsx('render(<Button>Kaydet</Button>);\n', 'src/renderer/features/x/x.test.tsx'),
    expect: 0,
    stdout: /^$/,
    note: 'test files ignored'
  },

  // ---------- Antigravity native PreToolUse hook ----------
  agyCase(
    'run_command',
    { CommandLine: 'gh workflow run ci.yml' },
    'deny',
    'Antigravity: gh workflow run denied'
  ),
  agyCase('run_command', { CommandLine: 'git push origin main' }, 'deny', 'Antigravity: push to main denied'),
  agyCase(
    'run_command',
    { CommandLine: 'git push -u origin antigravity/fix' },
    'allow',
    'Antigravity: push to antigravity/* allowed'
  ),
  agyCase(
    'run_command',
    { CommandLine: `${pm} electron-updater` },
    'deny',
    'Antigravity: banned package denied'
  ),
  agyCase(
    'edit_file',
    { Path: 'docs/plan/01-gereksinimler.md', Replacement: 'x' },
    'deny',
    'Antigravity: protected requirements doc denied'
  ),
  agyCase(
    'write_file',
    { Path: 'src/renderer/features/x.tsx', Content: 'fetch("https://api.example.com")' },
    'deny',
    'Antigravity: renderer fetch denied'
  ),
  agyCase(
    'write_file',
    { Path: 'src/main/network/x.ts', Content: 'fetch("https://api.example.com")' },
    'allow',
    'Antigravity: network folder fetch allowed'
  ),
  {
    script: agyHook,
    label: 'pre-tool-use.mjs',
    input: 'not json',
    expect: 0,
    stdout: /"decision":"allow"/,
    note: 'Antigravity: malformed JSON fails open'
  }
]

let failed = 0
try {
  for (const c of cases) {
    let problem = null
    try {
      c.before?.()
    } catch (err) {
      problem = `hazırlık hatası: ${err.message}`
    }
    const res = spawnSync(process.execPath, [c.script], {
      input: typeof c.input === 'string' ? c.input : JSON.stringify(c.input),
      env: { ...baseEnv, BISMUTH_PROJECT_DIR: root, ...c.env },
      encoding: 'utf8'
    })
    const stdout = (res.stdout ?? '').trim()
    const stderr = (res.stderr ?? '').trim()
    const name = c.label ?? c.script.split(/[\\/]/).pop()
    if (!problem && res.status !== c.expect) problem = `exit=${res.status} (beklenen ${c.expect})`
    if (!problem && c.stdout && !c.stdout.test(stdout)) problem = `stdout ${c.stdout} ile eşleşmedi`
    if (!problem && c.stderr && !c.stderr.test(stderr)) problem = `stderr ${c.stderr} ile eşleşmedi`
    if (!problem && c.after) problem = c.after()
    if (problem) failed++
    console.log(
      `${problem ? 'FAIL' : 'PASS'}  ${name.padEnd(24)} exit=${res.status} (beklenen ${c.expect})  ${c.note ?? ''}`
    )
    if (problem) {
      console.log(`   sorun: ${problem}`)
      console.log(
        '   stderr:',
        stderr.split('\n').slice(-3).join(' | '),
        '\n   stdout:',
        stdout.slice(0, 300)
      )
    }
  }
} finally {
  rmSync(tmpRoot, { recursive: true, force: true })
}
console.log(
  failed === 0
    ? `\nTüm koruma testleri geçti (${cases.length} senaryo).`
    : `\n${failed}/${cases.length} koruma testi başarısız.`
)
process.exit(failed === 0 ? 0 : 1)
