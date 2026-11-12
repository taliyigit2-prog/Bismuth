// Screenshots of the guide (scripts/guide-shots.mjs makes them from invented demo data): img/<lang>/<name>.jpg,
// bundled with the program like every other picture (no network). A language without its own copy of a picture
// shows the Turkish one.
import type { AppLocale } from '@shared/format'

const IMAGES = import.meta.glob<string>('./img/*/*.jpg', { query: '?url', import: 'default', eager: true })

const key = (lang: string, name: string): string => `./img/${lang}/${name}.jpg`

/** The address of a picture in the language, or null when there is none. */
export function guideImage(lang: AppLocale, name: string): string | null {
  return IMAGES[key(lang, name)] ?? IMAGES[key('tr', name)] ?? null
}

/** Names of the pictures that exist in a language (tests). */
export function guideImageNames(lang: AppLocale): string[] {
  const prefix = `./img/${lang}/`
  return Object.keys(IMAGES)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length, -'.jpg'.length))
}
