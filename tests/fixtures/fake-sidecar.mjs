// A stand-in for the Python camera sidecar (otel-kamera/web_app.py) for the Node tests: same contract, no Python.
// Reads BISMUTH_CAMERA_TOKEN and BISMUTH_CAMERA_CONFIG from the environment, listens only on 127.0.0.1, answers
// GET /api/health with the token check, and leaves when its stdin closes (the parent watch). FAKE_MODE picks a behaviour:
//   ok (default) · slow (reports "starting" for a while) · crash (exits 3 soon after it listens) ·
//   hang (never listens) · stubborn (ignores SIGTERM and stdin; only SIGKILL stops it) · ignore-term (ignores SIGTERM)
// The Kamera screen's endpoints (Faz 20 P20b) answer too: /api/status, /api/overlay, /api/stream (an image
// that repeats, behind the signed `st` address an <img> uses) and POST /api/system/toggle-alarms.
// P20c: like the real sidecar it keeps nothing on disk: GET /api/alerts?after&boot&limit (in memory, with a `boot` id and a
// face crop), PUT /api/faces/active (the in-house faces Bismuth pushes), POST /api/faces/capture and /api/faces/extract.
import { appendFileSync } from 'node:fs'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { crc32, deflateSync } from 'node:zlib'

const mode = process.env.FAKE_MODE ?? 'ok'
// This run's id: the alarm counter below starts over with every start, as the real sidecar's does.
const boot = createHash('sha1').update(`${process.pid}:${Date.now()}`).digest('hex').slice(0, 32)
const token = process.env.BISMUTH_CAMERA_TOKEN ?? ''
const config = JSON.parse(process.env.BISMUTH_CAMERA_CONFIG ?? '{}')
const host = config.WEB_HOST
const port = config.WEB_PORT
if (host !== '127.0.0.1' || !Number.isInteger(port)) process.exit(2)

if (process.env.FAKE_RECORD) {
  appendFileSync(
    process.env.FAKE_RECORD,
    JSON.stringify({
      pid: process.pid,
      tokenSha256: createHash('sha256').update(token).digest('hex'),
      tokenInArgv: process.argv.some((a) => a.includes(token)),
      watchStdin: process.env.BISMUTH_CAMERA_WATCH_STDIN,
      source: config.CAMERA_SOURCE,
      host,
      port
    }) + '\n'
  )
}

// A 320x180 gradient PNG (the "camera picture"), built without any image library.
function makePicture(width = 320, height = 180) {
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const at = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) {
      rows[at + 1 + x * 3] = 40 + Math.floor((x / width) * 120)
      rows[at + 2 + x * 3] = 60 + Math.floor((y / height) * 100)
      rows[at + 3 + x * 3] = 90
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(body))
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const localIso = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const ago = (hours) => localIso(new Date(Date.now() - hours * 3_600_000))

const streamOk = (value) => {
  const [exp, sig] = String(value ?? '').split('.')
  if (!/^\d+$/.test(exp ?? '') || Number(exp) < Date.now() / 1000 || !sig) return false
  const want = createHmac('sha256', token).update(`stream:${exp}`).digest('hex')
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want))
}

if (mode === 'hang') setInterval(() => undefined, 1000)
else {
  const born = Date.now()
  const slowMs = Number(process.env.FAKE_SLOW_MS ?? 400)
  const picture = makePicture()
  let alarmsPaused = false
  // Three alarms, oldest first (ids count up); each carries a tiny JPEG-looking face crop (the screen never decodes it).
  const crop = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-face-crop')]).toString(
    'base64'
  )
  const alerts = [
    { id: 1, alert_time: ago(30), track: 1, crop },
    { id: 2, alert_time: ago(2), track: 2, crop },
    { id: 3, alert_time: ago(0.5), track: 3, crop }
  ]
  // A 512-value float32 vector, the shape the real sidecar answers with.
  const vector = Buffer.alloc(2048)
  for (let i = 0; i < 512; i++) vector.writeFloatLE(((i * 7) % 13) / 13 + 0.05, i * 4)
  const face = { embedding: vector.toString('base64'), crop, model: 'buffalo_s' }
  let activeFaces = []
  const server = createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    if (req.headers.host !== `127.0.0.1:${port}`) return send(403, { detail: 'forbidden_host' })
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    const streamAllowed =
      req.method === 'GET' && url.pathname === '/api/stream' && streamOk(url.searchParams.get('st'))
    if (req.headers['x-bismuth-token'] !== token && !streamAllowed)
      return send(401, { detail: 'token_required' })
    if (url.pathname === '/api/health') {
      const starting = mode === 'slow' && Date.now() - born < slowMs
      return send(200, {
        ok: !starting,
        state: starting ? 'starting' : 'running',
        error: null,
        uptime_seconds: (Date.now() - born) / 1000,
        boot,
        ...(starting ? {} : { loop: { state: 'ok' } })
      })
    }
    if (url.pathname === '/api/status')
      return send(200, {
        camera_connected: true,
        camera_covered: false,
        camera_location: config.CAMERA_LOCATION ?? '',
        active_guests_count: activeFaces.length || 4,
        alarms_paused: alarmsPaused,
        fps: 12.5
      })
    if (url.pathname === '/api/alerts') {
      const after = url.searchParams.get('boot') === boot ? Number(url.searchParams.get('after') ?? 0) : 0
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100)
      return send(200, { boot, alerts: alerts.filter((a) => a.id > after).slice(0, limit) })
    }
    if (url.pathname === '/api/faces/active' && req.method === 'PUT') {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        try {
          activeFaces = JSON.parse(raw).faces ?? []
          send(200, { ok: true, count: activeFaces.length })
        } catch {
          send(422, { detail: 'bad_list' })
        }
      })
      return
    }
    if (url.pathname === '/api/faces/capture' && req.method === 'POST') return send(200, face)
    if (url.pathname === '/api/faces/extract' && req.method === 'POST') return send(200, face)
    if (url.pathname === '/api/overlay')
      return send(200, {
        frame: { width: 320, height: 180 },
        faces: [
          { box: [0.125, 0.22, 0.3125, 0.66], kind: 'known', name: 'Иван Петров', room: null, score: 0.7 },
          { box: [0.625, 0.28, 0.78, 0.67], kind: 'unknown', name: null, room: null, score: null }
        ]
      })
    if (url.pathname === '/api/system/toggle-alarms' && req.method === 'POST') {
      alarmsPaused = !alarmsPaused
      return send(200, { ok: true, alarms_paused: alarmsPaused })
    }
    if (url.pathname === '/api/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'content-type': 'multipart/x-mixed-replace; boundary=frame',
        'cache-control': 'no-store'
      })
      const frame = () =>
        res.write(
          Buffer.concat([
            Buffer.from(`--frame\r\nContent-Type: image/png\r\nContent-Length: ${picture.length}\r\n\r\n`),
            picture,
            Buffer.from('\r\n')
          ])
        )
      frame()
      const timer = setInterval(frame, 250)
      res.on('close', () => clearInterval(timer))
      return
    }
    send(404, { detail: 'not_found' })
  })
  server.listen(port, host, () => {
    if (mode === 'crash') setTimeout(() => process.exit(3), Number(process.env.FAKE_CRASH_MS ?? 150))
  })
}

if (mode === 'stubborn' || mode === 'ignore-term') process.on('SIGTERM', () => undefined)
if (mode === 'stubborn') process.stdin.on('data', () => undefined)
else process.stdin.on('end', () => process.exit(0)).resume()
