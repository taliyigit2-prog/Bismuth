// npm run guide:docs — writes docs/otel/kullanim-kilavuzu.md from the Turkish guide inside the program (K-40, Faz 16
// madde 7). Run it after changing src/renderer/guide/content/tr/; tests/unit/guide-docs.test.ts checks it was run.
import { writeFileSync } from 'node:fs'
import { DOC_FILE, readGuidePages, renderGuideDoc } from './guide-docs-lib'

writeFileSync(DOC_FILE, renderGuideDoc(readGuidePages()))
console.log(`wrote ${DOC_FILE}`)
