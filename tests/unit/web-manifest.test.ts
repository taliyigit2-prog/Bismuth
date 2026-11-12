// The phone's "Add to home screen" manifest (Faz 13): its only text cannot follow the person's language, so it stays
// a short name of what the program is (copy review G3).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(
  readFileSync(join(__dirname, '../../src/renderer/public/manifest.webmanifest'), 'utf8')
) as Record<string, unknown>

describe('ana ekran bildirimi (manifest)', () => {
  it('açıklama yalnız "Otel yönetimi"; ad Bismuth, tek başına açılır', () => {
    expect(manifest).toMatchObject({ name: 'Bismuth', short_name: 'Bismuth', description: 'Otel yönetimi' })
    expect(manifest.display).toBe('standalone')
  })
})
