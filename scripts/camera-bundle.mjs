#!/usr/bin/env node
// node scripts/camera-bundle.mjs --target win-x64|mac-arm64 --models <folder> [--out camera-addon-out]
//                                [--python-archive <file>] [--pip <python>] [--dry-run]
//
// Builds the camera add-on (Faz 20, P20f): one zip with an embedded Python, its libraries, the Python files and the
// model files (layout in src/main/camera/addon.ts). Not part of the main installer: ~1.5-2 GB installed (docs/kurulum.md).
// Runs on the packager's computer or in the release workflow, never on the hotel computer. Needs: node 22, python 3.12
// with pip and venv, zip (Windows: the system's tar.exe), curl, and a C/C++ compiler for insightface (MSVC on Windows, Xcode tools on
// macOS). The target system is the HOST system: the Windows add-on is built on Windows, the Mac add-on on an Apple-chip
// Mac, because insightface has no wheel and is compiled (a Linux-built one would not run on the target).
// Downloads (python.org / python-build-standalone / PyPI) happen HERE, at build time; the add-on itself never
// downloads anything (G-01, G-07).
//
// Supply chain (P20ffix): the Python archive must match the SHA-256 pinned below (no flag replaces it); every library
// comes from the hash-locked files in otel-kamera/ (`pip --require-hashes`, one index: PyPI; regenerate with
// scripts/camera-lock.mjs); insightface is compiled from its hash-pinned source archive with hash-pinned build tools.
//
// --models: a folder laid out like resources/camera/models (yolo11n.pt, insightface/models/buffalo_s/*.onnx). The weights
// never enter the repository (CLAUDE.md yasak 14): the packager keeps them elsewhere and names the folder here.
// Writes SHA256SUMS next to the models; a packaged sidecar refuses a model that is not listed (otel-kamera/model_loader.py).
//
// Targets: win-x64 (python.org embeddable zip) and mac-arm64 (python-build-standalone; macOS 14 or newer, the platform
// tag of the PyTorch wheel). Windows arm64 and Intel Macs have no add-on: PyTorch no longer ships an Intel-Mac wheel and
// the Windows-on-ARM wheels of the stack are incomplete. PyPI's Windows torch wheel is the CPU build (126 MB, the size of
// download.pytorch.org/whl/cpu), so no second package index is used. CUDA libraries never ship.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Pinned interpreters. `sha256` is checked on every run; there is no flag to skip or replace it.
// win-x64: hashed from python.org over TLS on 2026-11-14. mac-arm64: equals the SHA256SUMS file published with the
// python-build-standalone release 20250317 (compared on 2026-11-14).
const TARGETS = {
  'win-x64': {
    platform: 'win32',
    arch: 'x64',
    python: '3.12.10',
    url: 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip',
    sha256: '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3',
    zip: 'Bismuth-Kamera-Windows.zip'
  },
  'mac-arm64': {
    platform: 'darwin',
    arch: 'arm64',
    python: '3.12.9',
    url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20250317/cpython-3.12.9+20250317-aarch64-apple-darwin-install_only.tar.gz',
    sha256: '7c7fd9809da0382a601a79287b5d62d61ce0b15f5a5ee836233727a516e85381',
    zip: 'Bismuth-Kamera-Mac.zip'
  }
}
const PYPI = 'https://pypi.org/simple'
// Windows: the system's bsdtar reads and writes zip files (Git's GNU tar, first in PATH there, does not).
const systemTar =
  process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'

function args(argv) {
  const out = { flags: new Set() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.flags.add('dry')
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i]
  }
  return out
}
const opt = args(process.argv.slice(2))
const dry = opt.flags.has('dry')
const target = TARGETS[opt.target ?? '']
if (!target || !opt.models) {
  console.error(
    'usage: camera-bundle.mjs --target win-x64|mac-arm64 --models <folder> [--out dir] [--python-archive file] [--dry-run]'
  )
  process.exit(2)
}
if (!dry && (process.platform !== target.platform || process.arch !== target.arch)) {
  console.error(
    `camera-bundle: the ${opt.target} add-on is built on its own system (this one is ${process.platform}/${process.arch}): ` +
      'insightface is compiled here and its libraries are installed for the host (docs/kurulum.md)'
  )
  process.exit(2)
}
const outDir = opt.out ?? join(root, 'camera-addon-out')
const addonDir = join(outDir, 'camera-addon')
const modelsSrc = opt.models
const kamera = join(root, 'otel-kamera')

const run = (cmd, argv, o = {}) => {
  console.log(`$ ${cmd} ${argv.join(' ')}`)
  if (dry) return ''
  return execFileSync(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'], ...o })
}
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  )

// 1. The models must be complete before anything is downloaded.
const MODELS = [
  'yolo11n.pt',
  'insightface/models/buffalo_s/det_500m.onnx',
  'insightface/models/buffalo_s/w600k_mbf.onnx'
]
for (const m of MODELS) {
  if (!existsSync(join(modelsSrc, m))) {
    console.error(
      `camera-bundle: model file missing: ${join(modelsSrc, m)} (see resources/camera/models/README.md)`
    )
    process.exit(1)
  }
}
for (const f of ['requirements-bundle.lock', 'requirements-build.lock', 'requirements-insightface.lock']) {
  if (!existsSync(join(kamera, f))) {
    console.error(`camera-bundle: ${f} is missing (node scripts/camera-lock.mjs writes it)`)
    process.exit(1)
  }
}

rmSync(addonDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
for (const d of ['python', 'site-packages', 'app', 'models', 'licenses'])
  mkdirSync(join(addonDir, d), { recursive: true })

// 2. Python interpreter: downloaded over https only, then it must match the pinned hash before anything is unpacked.
const archive = opt['python-archive'] ?? join(outDir, basename(target.url))
if (!opt['python-archive'] && !existsSync(archive))
  run('curl', ['-fL', '--proto', '=https', '--tlsv1.2', '--retry', '3', '-o', archive, target.url])
if (!dry) {
  const got = sha256(archive)
  console.log(`python archive sha256 ${got}`)
  if (got !== target.sha256) {
    console.error(`camera-bundle: the Python archive does not match the pinned sha256 ${target.sha256}`)
    rmSync(archive, { force: true })
    process.exit(1)
  }
}
if (target.platform === 'win32') {
  run(systemTar, ['-xf', archive, '-C', join(addonDir, 'python')])
  // The embeddable Python ignores PYTHONPATH; the ._pth file names the add-on's folders (relative to python/).
  const pth =
    (dry ? [] : readdirSync(join(addonDir, 'python'))).find((f) => f.endsWith('._pth')) ?? 'python312._pth'
  if (!dry)
    writeFileSync(
      join(addonDir, 'python', pth),
      ['python312.zip', '.', '../site-packages', '../app', 'import site', ''].join('\n')
    )
} else {
  run('tar', ['-xzf', archive, '-C', addonDir]) // the archive's top folder is `python/`
}

// 3. Libraries into site-packages (pip --target), every file checked against the lock's hashes; one index (PyPI).
const hostPython = opt.pip ?? (process.platform === 'win32' ? 'python' : 'python3')
const siteDir = join(addonDir, 'site-packages')
const pipArgs = (rest) => ['-m', 'pip', '--disable-pip-version-check', ...rest, '--index-url', PYPI]
run(
  hostPython,
  pipArgs([
    'install',
    '--target',
    siteDir,
    '--no-compile',
    '--require-hashes',
    '--no-deps',
    '--only-binary=:all:',
    '-r',
    join(kamera, 'requirements-bundle.lock')
  ])
)

// insightface 0.7.3 has no wheel and a compiled part its import needs (`from insightface.app import FaceAnalysis` loads
// `mesh_core_cython` through the mask renderer): compile it here, from the hash-pinned source archive, with
// hash-pinned build tools in a throw-away environment; install the wheel it makes.
const buildEnv = join(outDir, 'build-env')
const wheels = join(outDir, 'wheels')
rmSync(buildEnv, { recursive: true, force: true })
rmSync(wheels, { recursive: true, force: true })
run(hostPython, ['-m', 'venv', buildEnv])
const buildPython = join(
  buildEnv,
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python'
)
run(
  buildPython,
  pipArgs([
    'install',
    '--require-hashes',
    '--no-deps',
    '--only-binary=:all:',
    '-r',
    join(kamera, 'requirements-build.lock')
  ])
)
run(
  buildPython,
  pipArgs([
    'wheel',
    '--require-hashes',
    '--no-deps',
    '--no-build-isolation',
    '-r',
    join(kamera, 'requirements-insightface.lock'),
    '-w',
    wheels
  ])
)
run(hostPython, [
  '-m',
  'pip',
  '--disable-pip-version-check',
  'install',
  '--target',
  siteDir,
  '--no-compile',
  '--no-deps',
  '--no-index',
  '--find-links',
  wheels,
  'insightface'
])
rmSync(buildEnv, { recursive: true, force: true })
rmSync(wheels, { recursive: true, force: true })

// The compiled part must be there, or the camera would not start.
if (!dry && !walk(siteDir).some((f) => /mesh_core_cython.*\.(so|pyd)$/.test(f))) {
  console.error('camera-bundle: insightface has no compiled mesh_core_cython (its import would fail)')
  process.exit(1)
}

// 4. The Python files and static page (no tests, launchers, notes or local data).
if (!dry) {
  const src = join(root, 'otel-kamera')
  for (const f of readdirSync(src)) {
    if (/\.py$/.test(f)) copyFileSync(join(src, f), join(addonDir, 'app', f))
  }
  cpSync(join(src, 'static'), join(addonDir, 'app', 'static'), { recursive: true })

  // 5. Models + SHA256SUMS (every file; the sidecar rejects a model that is not listed).
  cpSync(modelsSrc, join(addonDir, 'models'), { recursive: true })
  rmSync(join(addonDir, 'models', 'SHA256SUMS'), { force: true })
  rmSync(join(addonDir, 'models', 'README.md'), { force: true })
  const base = join(addonDir, 'models')
  const lines = walk(base)
    .map((f) => `${sha256(f)}  ${relative(base, f).split('\\').join('/')}`)
    .sort((a, b) => a.slice(66).localeCompare(b.slice(66)))
  writeFileSync(join(base, 'SHA256SUMS'), lines.join('\n') + '\n')

  // 6. Licence texts of everything shipped (dist-info) + the Bismuth notice.
  const licenses = join(addonDir, 'licenses')
  for (const dist of readdirSync(siteDir).filter((f) => f.endsWith('.dist-info'))) {
    const dir = join(siteDir, dist)
    const files = walk(dir).filter(
      (f) => /(licen[cs]e|copying|notice)/i.test(basename(f)) && statSync(f).isFile()
    )
    files.forEach((f, i) =>
      copyFileSync(f, join(licenses, `${dist.replace(/\.dist-info$/, '')}-${i}-${basename(f)}`))
    )
  }
  copyFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(licenses, 'THIRD_PARTY_NOTICES.md'))

  // 7. Manifest read by src/main/camera/addon.ts.
  const bismuth = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  writeFileSync(
    join(addonDir, 'addon.json'),
    JSON.stringify(
      { schema: 1, platform: target.platform, arch: target.arch, bismuth, python: target.python },
      null,
      2
    ) + '\n'
  )
}

// 8. Zip (stored at level 6; the folder `camera-addon/` is the zip's top level so unpacking into userData just works).
const zipPath = join(outDir, target.zip)
rmSync(zipPath, { force: true })
if (process.platform === 'win32') run(systemTar, ['-a', '-cf', zipPath, 'camera-addon'], { cwd: outDir })
else run('zip', ['-qr', '-6', zipPath, 'camera-addon'], { cwd: outDir })
if (!dry && existsSync(zipPath)) {
  const mb = (n) => (n / 1e6).toFixed(0)
  const size = walk(addonDir).reduce((n, f) => n + statSync(f).size, 0)
  console.log(
    `${target.zip}: ${mb(statSync(zipPath).size)} MB zip, ${mb(size)} MB unpacked, sha256 ${sha256(zipPath)}`
  )
}
