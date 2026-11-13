#!/usr/bin/env node
// npm run notices — writes THIRD_PARTY_NOTICES.md (full licence texts, shipped next to the app) and
// src/renderer/features/about/third-party.json (list shown on the About page). Run after changing
// dependencies (docs/plan/bagimliliklar.md); CI fails if the committed files are stale.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Build tools and test tools never reach the user's machine.
const TOOLING = new Set([
  'electron-vite',
  'vite',
  '@vitejs/plugin-react',
  'electron-builder',
  'typescript',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  '@types/better-sqlite3',
  'eslint',
  '@eslint/js',
  'typescript-eslint',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-refresh',
  'eslint-plugin-i18next',
  'eslint-config-prettier',
  'globals',
  'prettier',
  'prettier-plugin-tailwindcss',
  'vitest',
  'jsdom',
  '@testing-library/react',
  '@testing-library/dom',
  '@testing-library/jest-dom',
  '@testing-library/user-event',
  '@playwright/test',
  '@axe-core/playwright',
  'tsx',
  'drizzle-kit',
  'i18next-cli',
  '@tailwindcss/vite'
])

// Files adapted from other open-source projects (header comment in each file names the source).
const COPIED = [
  {
    project: 'electron-vite react-ts template (alex8088/quick-start)',
    license: 'MIT',
    copyright: 'Copyright (c) 2022-present, Alex.Wei'
  },
  {
    project: 'arjunemirchandani/electron-db',
    license: 'MIT',
    copyright: 'Copyright (c) 2026 Arjune Mirchandani'
  },
  { project: 'guasam/electron-react-app', license: 'MIT', copyright: 'Copyright (c) 2022 Guasam' },
  { project: 'cawa-93/vite-electron-builder', license: 'MIT', copyright: 'Copyright (c) 2021 Alex Kozack' },
  { project: 'actualbudget/actual', license: 'MIT', copyright: 'Copyright James Long' },
  { project: 'shadcn/ui (components/ui)', license: 'MIT', copyright: 'Copyright (c) 2023 shadcn' },
  { project: 'Yr weather symbols (assets/weather)', license: 'MIT', copyright: 'Copyright (c) 2015-2017 Yr' }
]

const MIT = (copyright) => `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`

const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
  .filter((n) => !TOOLING.has(n))
  .sort((a, b) => a.localeCompare(b))

const packages = names.map((name) => {
  const dir = join(root, 'node_modules', name)
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f))
  const text = licenseFile ? readFileSync(join(dir, licenseFile), 'utf8').trim() : null
  const license = typeof meta.license === 'string' ? meta.license : (meta.license?.type ?? 'UNKNOWN')
  return { name, version: meta.version, license, text }
})

// Camera module (Faz 20, optional Python sidecar in otel-kamera/): versions come from requirements.txt so the notice
// cannot drift from what ships; every pinned package must have an entry here (the script stops otherwise).
const CAMERA_PACKAGES = {
  fastapi: { license: 'MIT', note: 'HTTP surface of the sidecar (127.0.0.1 only)' },
  uvicorn: { license: 'BSD-3-Clause', note: 'ASGI server' },
  'python-multipart': { license: 'Apache-2.0', note: 'form uploads' },
  pydantic: { license: 'MIT', note: 'request validation' },
  numpy: { license: 'BSD-3-Clause', note: 'image and vector maths' },
  'opencv-python-headless': {
    license: 'Apache-2.0 (bundled FFmpeg: LGPL-2.1, dynamically linked)',
    note: 'RTSP reading, JPEG'
  },
  supervision: { license: 'MIT', note: 'detections and zone helpers' },
  ultralytics: {
    license: 'AGPL-3.0',
    note: 'YOLO11n person detection; code is called, never modified (K-57)'
  },
  insightface: {
    license: 'MIT (code)',
    note: 'face detection and recognition; model weights are NON-COMMERCIAL (below)'
  },
  onnxruntime: { license: 'MIT', note: 'runs the InsightFace models on the CPU' }
}
const CAMERA_MODELS = [
  {
    file: 'yolo11n.pt',
    from: 'Ultralytics (github.com/ultralytics/assets)',
    license: 'AGPL-3.0'
  },
  {
    file: 'buffalo_s (det_500m.onnx, w600k_mbf.onnx)',
    from: 'InsightFace model zoo (github.com/deepinsight/insightface)',
    license: 'non-commercial research only'
  }
]
const cameraRequirements = readFileSync(join(root, 'otel-kamera/requirements.txt'), 'utf8')
  .split(/\r?\n/)
  .map((line) => /^([A-Za-z0-9_.-]+)==([^\s#]+)/.exec(line))
  .filter(Boolean)
  .map((m) => ({ name: m[1], version: m[2] }))
const cameraMissing = cameraRequirements.filter((r) => !CAMERA_PACKAGES[r.name])
if (cameraMissing.length > 0)
  throw new Error(
    `otel-kamera/requirements.txt has packages without a notice entry: ${cameraMissing.map((r) => r.name).join(', ')}`
  )

const cameraSection = [
  '## Camera module (optional; runs only when switched on in Settings)',
  '',
  'Bismuth can start a separate Python program ("sidecar", folder `otel-kamera/`) that recognises faces from a hotel camera.',
  'It listens on 127.0.0.1 only, downloads nothing and sends nothing out; its model files ship inside the installer.',
  '',
  '### Licence warning (owner decision K-57, 2026-11-13)',
  '',
  '- The InsightFace `buffalo_s` model weights are licensed by their authors for **non-commercial research purposes only**.',
  '  Using them for hotel door security is not "research"; the licence text does not define commercial use, so a risk',
  "  remains. The owner knowingly keeps them for the owner's own single hotel and does not sell or pass on this program.",
  '- Ultralytics YOLO11 is **AGPL-3.0**. It is run as a separate process and its code is never modified. Ultralytics',
  '  states on its own licence page that internal business use also needs an Enterprise licence; that is a company policy',
  '  stricter than the licence text.',
  '- Consequence: **this build must not be sold, sub-licensed or handed to another hotel with these models.** Before any',
  '  such step, replace them with openly licensed models (YuNet MIT + SFace Apache-2.0; plan in',
  '  `docs/analiz/06-kamera-entegrasyonu.md` section 6.2) or obtain written permission / an Enterprise licence.',
  '- Telemetry of the libraries is switched off (`ultralytics settings.sync=False`, offline environment variables).',
  '',
  '### Model files',
  '',
  '| File | Source | Licence |',
  '|---|---|---|',
  ...CAMERA_MODELS.map((m) => `| ${m.file} | ${m.from} | ${m.license} |`),
  '',
  '### Python packages (pinned in `otel-kamera/requirements.txt`)',
  '',
  '| Package | Version | Licence | Use |',
  '|---|---|---|---|',
  ...cameraRequirements.map(
    (r) =>
      `| ${r.name} | ${r.version} | ${CAMERA_PACKAGES[r.name].license} | ${CAMERA_PACKAGES[r.name].note} |`
  ),
  '',
  'Full licence texts of these packages are shipped inside the camera add-on next to the Python files (P20f packaging).',
  ''
]

const unknown = packages.filter((p) => !p.text)
const md = [
  '# Third-party notices — Bismuth',
  '',
  'Bismuth includes the open-source software listed below. Generated by `npm run notices`; do not edit by hand.',
  "Electron also ships Chromium's notices in `LICENSES.chromium.html` next to the program.",
  '',
  '## Packages',
  '',
  ...packages.flatMap((p) => [
    `### ${p.name} ${p.version} (${p.license})`,
    '',
    '```',
    p.text ?? `License: ${p.license} (no licence file in the package; see the package's repository)`,
    '```',
    ''
  ]),
  ...cameraSection,
  '## Source code adapted from other projects',
  '',
  ...COPIED.flatMap((c) => [`### ${c.project} (${c.license})`, '', '```', MIT(c.copyright), '```', ''])
].join('\n')

writeFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), md)
writeFileSync(
  join(root, 'src/renderer/features/about/third-party.json'),
  JSON.stringify(
    {
      packages: packages.map(({ name, version, license }) => ({ name, version, license })),
      copiedCode: COPIED.map(({ project, license }) => ({ project, license }))
    },
    null,
    2
  ) + '\n'
)
console.log(
  `${packages.length} packages, ${COPIED.length} adapted sources${unknown.length ? `; no licence file: ${unknown.map((p) => p.name).join(', ')}` : ''}`
)
if (existsSync(join(root, 'node_modules/electron/dist/LICENSES.chromium.html')))
  console.log('Chromium notices: shipped by Electron')
