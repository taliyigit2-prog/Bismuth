#!/usr/bin/env node
// node scripts/camera-bundle.mjs --target win-x64|mac-arm64 --models <folder> [--out camera-addon-out]
//                                [--python-archive <file>] [--python-sha256 <hex>] [--python-url <url>] [--dry-run]
//
// Builds the camera add-on (Faz 20, P20f): one zip with an embedded Python, its libraries, the Python files and the
// model files (layout in src/main/camera/addon.ts). Not part of the main installer: ~1.5-2 GB installed (docs/kurulum.md).
// Runs on the packager's computer or in the release workflow, never on the hotel computer. Needs: node 22, python 3.12
// with pip, zip (or tar on macOS), curl. Downloads (python.org / python-build-standalone / PyPI / download.pytorch.org)
// happen HERE, at build time; the add-on itself never downloads anything (G-01, G-07).
//
// --models: a folder laid out like resources/camera/models (yolo11n.pt, insightface/models/buffalo_s/*.onnx). The weights
// never enter the repository (CLAUDE.md yasak 14): the packager keeps them elsewhere and names the folder here.
// Writes SHA256SUMS next to the models; a packaged sidecar refuses a model that is not listed (otel-kamera/model_loader.py).
//
// Targets: win-x64 (python.org embeddable zip) and mac-arm64 (python-build-standalone). Windows arm64 and Intel Macs
// have no add-on: PyTorch no longer ships an Intel-Mac wheel and the Windows-on-ARM wheels of the stack are incomplete.
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

// Pinned interpreters. The SHA-256 is printed at every run; pass --python-sha256 to make a mismatch fatal.
// <!-- doğrula --> URLs and dates are from memory of the release pages; check them on the first real run.
const TARGETS = {
  'win-x64': {
    platform: 'win32',
    arch: 'x64',
    pipPlatform: 'win_amd64',
    python: '3.12.10',
    url: 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip',
    zip: 'Bismuth-Kamera-Windows.zip',
    torchIndex: 'https://download.pytorch.org/whl/cpu'
  },
  'mac-arm64': {
    platform: 'darwin',
    arch: 'arm64',
    pipPlatform: 'macosx_11_0_arm64',
    python: '3.12.9',
    url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20250317/cpython-3.12.9+20250317-aarch64-apple-darwin-install_only.tar.gz',
    zip: 'Bismuth-Kamera-Mac.zip',
    torchIndex: null // macOS wheels on PyPI are CPU/MPS builds already
  }
}

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
const target = TARGETS[opt.target ?? '']
if (!target || !opt.models) {
  console.error(
    'usage: camera-bundle.mjs --target win-x64|mac-arm64 --models <folder> [--out dir] [--dry-run]'
  )
  process.exit(2)
}
const outDir = opt.out ?? join(root, 'camera-addon-out')
const addonDir = join(outDir, 'camera-addon')
const modelsSrc = opt.models

const run = (cmd, argv, o = {}) => {
  console.log(`$ ${cmd} ${argv.join(' ')}`)
  if (opt.flags.has('dry')) return ''
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

rmSync(addonDir, { recursive: true, force: true })
for (const d of ['python', 'site-packages', 'app', 'models', 'licenses'])
  mkdirSync(join(addonDir, d), { recursive: true })

// 2. Python interpreter.
const archive = opt['python-archive'] ?? join(outDir, basename(opt['python-url'] ?? target.url))
if (!opt['python-archive'] && !existsSync(archive))
  run('curl', ['-fL', '--retry', '3', '-o', archive, opt['python-url'] ?? target.url])
if (!opt.flags.has('dry')) {
  const got = sha256(archive)
  console.log(`python archive sha256 ${got}`)
  if (opt['python-sha256'] && opt['python-sha256'].toLowerCase() !== got) {
    console.error('camera-bundle: python archive sha256 does not match --python-sha256')
    process.exit(1)
  }
}
if (target.platform === 'win32') {
  run('unzip', ['-q', '-o', archive, '-d', join(addonDir, 'python')])
  // The embeddable Python ignores PYTHONPATH; the ._pth file names the add-on's folders (relative to python/).
  const pth =
    readdirSync(opt.flags.has('dry') ? outDir : join(addonDir, 'python')).find((f) => f.endsWith('._pth')) ??
    'python312._pth'
  if (!opt.flags.has('dry'))
    writeFileSync(
      join(addonDir, 'python', pth),
      ['python312.zip', '.', '../site-packages', '../app', 'import site', ''].join('\n')
    )
} else {
  run('tar', ['-xzf', archive, '-C', addonDir]) // the archive's top folder is `python/`
}

// 3. Libraries into site-packages (pip --target; wheels for the target system when the host differs).
const hostIsTarget = process.platform === target.platform && process.arch === target.arch
const pip = (extra, native = false) =>
  run(opt.pip ?? 'python3', [
    '-m',
    'pip',
    'install',
    '--target',
    join(addonDir, 'site-packages'),
    '--no-compile',
    '--disable-pip-version-check',
    ...(hostIsTarget || native
      ? []
      : [
          '--platform',
          target.pipPlatform,
          '--python-version',
          '3.12',
          '--implementation',
          'cp',
          '--abi',
          'cp312'
        ]),
    ...extra
  ])
const reqs = ['otel-kamera/requirements.txt', 'otel-kamera/requirements-bundle.txt'].map((f) => join(root, f))
// insightface 0.7.3 is source-only (a Cython extension for 3D faces that Bismuth never uses): install it without
// dependencies on the host, then delete the compiled files. Everything else must be a ready-made wheel.
const withoutInsightface = join(outDir, 'requirements-wheels.txt')
if (!opt.flags.has('dry')) {
  const lines = reqs
    .flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/))
    .filter((l) => l.trim() && !l.trim().startsWith('#') && !/^insightface==/.test(l))
  writeFileSync(withoutInsightface, lines.join('\n') + '\n')
}
pip([
  '--only-binary=:all:',
  ...(target.torchIndex ? ['--extra-index-url', target.torchIndex] : []),
  '-r',
  withoutInsightface
])
const insightfaceLine = reqs
  .flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/))
  .find((l) => /^insightface==/.test(l))
pip(['--no-deps', insightfaceLine?.split('#')[0].trim() ?? 'insightface'], true) // builds on the host (needs a C compiler)
// insightface and ultralytics pull the full opencv-python too; two `cv2` folders would fight. Keep the headless one.
if (!opt.flags.has('dry')) {
  const sp = join(addonDir, 'site-packages')
  for (const f of readdirSync(sp)) {
    if (/^opencv_python-/.test(f)) rmSync(join(sp, f), { recursive: true, force: true })
    if (/\.(so|pyd)$/.test(f) && /mesh_core_cython/.test(f)) rmSync(join(sp, f), { force: true })
  }
  for (const f of walk(sp)) if (/mesh_core_cython.*\.(so|pyd)$/.test(f)) rmSync(f, { force: true })
}
pip([
  '--no-deps',
  '--force-reinstall',
  '--only-binary=:all:',
  ...reqs
    .flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/))
    .filter((l) => /^opencv-python-headless==/.test(l))
    .map((l) => l.split('#')[0].trim())
])

// 4. The Python files and static page (no tests, launchers, notes or local data).
if (!opt.flags.has('dry')) {
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
  const sp = join(addonDir, 'site-packages')
  for (const dist of readdirSync(sp).filter((f) => f.endsWith('.dist-info'))) {
    const dir = join(sp, dist)
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
run('zip', ['-qr', '-6', zipPath, 'camera-addon'], { cwd: outDir })
if (!opt.flags.has('dry') && existsSync(zipPath)) {
  const mb = (n) => (n / 1e6).toFixed(0)
  const size = walk(addonDir).reduce((n, f) => n + statSync(f).size, 0)
  console.log(
    `${target.zip}: ${mb(statSync(zipPath).size)} MB zip, ${mb(size)} MB unpacked, sha256 ${sha256(zipPath)}`
  )
}
