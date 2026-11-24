#!/usr/bin/env node
// PreToolUse on shell commands (`gh *` and `git tag *`): GitHub Actions minutes are scarce and
// every workflow is started by hand by the owner (docs/analiz/07-kurulum-ve-dagitim.md §6, ANTIGRAVITY.md yasak 15).
// Blocks (exit 2):
//   - gh workflow run|enable|disable, gh run rerun|cancel|delete (read-only watch/list/view stay allowed)
//   - gh release create|upload|edit|delete|delete-asset
//   - gh api with -X/--method POST|PUT|PATCH|DELETE or .../dispatches
//   - git tag v* (release.yml triggers on `v*` tags)
// Text that merely mentions these words (echo, heredoc, comments) is not a command.
import { readFileSync } from 'node:fs'

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  process.exit(0)
}
const command = String(input.tool_input?.command ?? '')
const segments = command.split(/&&|\|\||;|\n|\|/).map((s) => s.trim())

const block = (why) => {
  process.stderr.write(
    `Engellendi: ${why}. GitHub Actions iş akışlarını ve sürüm etiketlerini yalnız sahip elle başlatır; tüm kontroller yerel ortamda koşar (npm run check, npm run build, e2e).\n`
  )
  process.exit(2)
}

for (const seg of segments) {
  const words = seg
    .replace(/\d*[<>]+&?\s*\S+/g, ' ')
    .trim()
    .split(/\s+/)
  // strip leading VAR=x assignments
  while (words.length && /^\w+=/.test(words[0])) words.shift()
  const [cmd, ...rest] = words
  if (cmd === 'gh') {
    const [group, action] = rest.filter((a) => !a.startsWith('-'))
    if (group === 'workflow' && ['run', 'enable', 'disable'].includes(action)) block(`gh workflow ${action}`)
    if (group === 'run' && ['rerun', 'cancel', 'delete'].includes(action)) block(`gh run ${action}`)
    if (group === 'release' && ['create', 'upload', 'edit', 'delete', 'delete-asset'].includes(action))
      block(`gh release ${action}`)
    if (group === 'api') {
      const idx = rest.findIndex((a) => a === '-X' || a === '--method')
      const method = idx > -1 ? rest[idx + 1] : rest.find((a) => /^--method=/.test(a))?.split('=')[1]
      if (method && /^(POST|PUT|PATCH|DELETE)$/i.test(method)) block(`gh api ${method.toUpperCase()}`)
      if (rest.some((a) => /\/dispatches$/.test(a))) block('gh api …/dispatches')
    }
  }
  if (cmd === 'git') {
    const args = rest.filter((a) => !/^-C$/.test(a))
    const i = args.indexOf('tag')
    if (i > -1) {
      const positional = args.slice(i + 1).filter((a) => !a.startsWith('-'))
      const flags = args.slice(i + 1).filter((a) => a.startsWith('-'))
      const listing =
        flags.some((a) => a === '-l' || a === '--list') ||
        (positional.length === 0 && !flags.some((a) => a === '-a' || a === '-s'))
      const deleting = flags.some((a) => a === '-d' || a === '--delete')
      if (!listing && !deleting && positional.some((p) => /^v\d/.test(p)))
        block(`git tag ${positional[0]} (sürüm etiketi release.yml'i tetikler)`)
    }
  }
}
process.exit(0)
