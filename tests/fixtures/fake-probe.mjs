// Node stand-in for otel-kamera/probe_camera.py (Faz 20 P20g): the same contract (address in BISMUTH_PROBE_SOURCE, one JSON
// line out), answers decided by the address so a test can pick the outcome. Used by src/main/camera/probe.test.ts and the
// setup/Ayarlar e2e (BISMUTH_CAMERA_PYTHON = node, BISMUTH_CAMERA_PROBE_SCRIPT = this file). Values are invented.
//   host …64 with user "kamera" and password "gizli" → a picture      host …64 with other credentials → auth
//   …65 → auth   …66 → timeout   …67 → unreachable   …68 → path   …69 → noFrame   …99 → never answers
//   channel in the path (/Streaming/Channels/<n>01) other than 1 or 2 → path
const JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCABIAIADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDHoorSd4ba3gJt0cuuST+H+NakGbRV37bD/wA+cf6f4UfbYf8Anzj/AE/woApUVd+2w/8APnH+n+FH22H/AJ84/wBP8KAKVFXftsP/AD5x/p/hR9th/wCfOP8AT/CgClRV37bD/wA+cf6f4UfbYf8Anzj/AE/woApUVd+2w/8APnH+n+FH22H/AJ84/wBP8KAKVFWntpLpWjNsi/LnIx/hWZQAVdvv+Pa0/wBz+gqlV2+/49rT/c/oKAKVFFFABRRRQAVLHbzSruihkcZxlVJq5pOnC9kLyZEKHn/aPpmunVQqhVAAAwAO1Q5WLjG5x0tpcQhjJBIoU4LFTj86gruK57WdNW3/ANIgGIycMoH3T6/ShSuOULGRRRRVmYUUUUAXdK/4+W/3D/MVSq7pX/Hy3+4f5iqVABV2+/49rT/c/oKpVdvv+Pa0/wBz+goApUUUUAFFFFAHSeHsfYGwST5hzx04FalnOaJqCWzNBMcRucht2U+/6V0dZS3N4vQKpaxj+zJ9xIGB0Ge4q7WHrmoIym0iOTn94R047UluEnZGHRRRWxgFFFFAF3Sv+Plv9w/zFUqu6V/x8t/uH+YqlQAVdvv+Pa0/3P6CqVacts11bW/lsvypzk+w/wAKAMyirv8AZk396P8AM/4Uf2ZN/ej/ADP+FAFKirv9mTf3o/zP+FH9mTf3o/zP+FAFKrcOpXkEYSOdgo6AgHH5072zJv70f5n/AAo/syb+9H+Z/wAKQXFl1a9lDAzFQT0UAY+h61Rq7/Zk396P8z/hR/Zk396P8z/hRYLspUVd/syb+9H+Z/wo/syb+9H+Z/wpgUqKu/2ZN/ej/M/4Uf2ZN/ej/M/4UAGlf8fLf7h/mKpVq2do9rI0kjJt2kcGsqgAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/2Q=='

const fail = (reason) => ({ ok: false, reason, image: null, width: 0, height: 0 })

function answer(source) {
  let url
  try {
    url = new URL(source)
  } catch {
    return fail('badAddress')
  }
  const last = Number(url.hostname.split('.')[3])
  const channel = /\/Streaming\/Channels\/(\d+)01$/.exec(url.pathname)?.[1]
  if (last === 65) return fail('auth')
  if (last === 66) return fail('timeout')
  if (last === 67) return fail('unreachable')
  if (last === 68) return fail('path')
  if (last === 69) return fail('noFrame')
  if (last !== 64) return fail('unreachable')
  if (channel !== '1' && channel !== '2') return fail('path')
  if (decodeURIComponent(url.username) !== 'kamera' || decodeURIComponent(url.password) !== 'gizli')
    return fail('auth')
  return { ok: true, reason: null, image: JPEG, width: 128, height: 72 }
}

const source = process.env.BISMUTH_PROBE_SOURCE ?? ''
if (/@?192\.168\.1\.99[:/]/.test(source)) {
  setTimeout(() => undefined, 60_000)
} else {
  process.stdout.write(JSON.stringify(answer(source)) + '\n')
}
