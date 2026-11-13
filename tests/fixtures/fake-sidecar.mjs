// A stand-in for the Python camera sidecar (otel-kamera/web_app.py) for the Node tests: same contract, no Python.
// Reads BISMUTH_CAMERA_TOKEN and BISMUTH_CAMERA_CONFIG from the environment, listens only on 127.0.0.1, answers
// GET /api/health with the token check, and leaves when its stdin closes (the parent watch). FAKE_MODE picks a behaviour:
//   ok (default) · slow (reports "starting" for a while) · crash (exits 3 soon after it listens) ·
//   hang (never listens) · stubborn (ignores SIGTERM and stdin; only SIGKILL stops it) · ignore-term (ignores SIGTERM)
import { appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

const mode = process.env.FAKE_MODE ?? 'ok'
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

if (mode === 'hang') setInterval(() => undefined, 1000)
else {
  const born = Date.now()
  const slowMs = Number(process.env.FAKE_SLOW_MS ?? 400)
  const server = createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    if (req.headers.host !== `127.0.0.1:${port}`) return send(403, { detail: 'forbidden_host' })
    if (req.headers['x-bismuth-token'] !== token) return send(401, { detail: 'token_required' })
    if (req.url === '/api/health') {
      const starting = mode === 'slow' && Date.now() - born < slowMs
      return send(200, {
        ok: !starting,
        state: starting ? 'starting' : 'running',
        error: null,
        uptime_seconds: (Date.now() - born) / 1000,
        ...(starting ? {} : { loop: { state: 'ok' } })
      })
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
