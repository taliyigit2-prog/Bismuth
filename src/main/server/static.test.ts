import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tempDataDir } from '../../../tests/factories/runtime'
import { readStatic } from './static'

function bundle(): string {
  const root = tempDataDir()
  mkdirSync(join(root, 'icons'), { recursive: true })
  writeFileSync(join(root, 'icons', 'icon-192.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  writeFileSync(join(root, 'index.html'), '<!doctype html>')
  return root
}

describe('readStatic', () => {
  it('/favicon.ico paket içindeki uygulama simgesiyle yanıtlanır (sunucu kipinde 404 yok)', async () => {
    const icon = await readStatic(bundle(), '/favicon.ico')
    expect(icon?.type).toBe('image/png')
    expect([...(icon?.body ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('olmayan başka dosya yine bulunamaz; klasör dışına çıkılamaz', async () => {
    const root = bundle()
    expect(await readStatic(root, '/missing.png')).toBeNull()
    expect(await readStatic(root, '/../../etc/passwd')).toBeNull()
  })
})
