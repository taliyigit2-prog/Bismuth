#!/usr/bin/env node
// PreToolUse on shell commands (`git push *`): work is pushed only to a work branch (`antigravity/…`,
// ANTIGRAVITY.md > Git) and history on the remote is never rewritten. Blocks (exit 2):
//   - a push whose target branch does not start with `antigravity/` (main, master, release branches, tags with --tags);
//   - --force / -f / +refspec (--force-with-lease stays allowed: it cannot drop someone else's commits).
// The target is the last refspec's destination, or the current branch when no refspec is given.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  process.exit(0)
}
const command = String(input.tool_input?.command ?? '')
// Only segments whose command word is git (optionally `VAR=x git -C dir push`): a heredoc, echo or script that merely
// mentions the words is not a push. Pipes and redirections end the push's own arguments (`… 2>&1 | tail -1`).
const segments = command
  .split(/&&|\|\||;|\n|\|/)
  .filter((s) => /^\s*(?:\w+=\S*\s+)*git(?:\s+-C\s+\S+)?\s+push\b/.test(s))
if (segments.length === 0) process.exit(0)

const block = (why) => {
  process.stderr.write(`Engellendi: ${why} (ANTIGRAVITY.md > Git: yalnızca antigravity/… dalına push).\n`)
  process.exit(2)
}

for (const segment of segments) {
  const words = segment
    .replace(/\d*[<>]+&?\s*\S+/g, ' ') // `2>&1`, `> log.txt`, `< in`
    .trim()
    .split(/\s+/)
  const args = words.slice(words.indexOf('push') + 1).filter((a) => !/[<>]/.test(a))
  if (args.some((a) => a === '--force' || a === '-f' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a)))
    block('--force ile push (gerekirse --force-with-lease)')
  if (args.some((a) => a === '--tags' || a === '--all' || a === '--mirror' || a === '--delete' || a === '-d'))
    block(`git push ${args.find((a) => a.startsWith('-'))}`)
  const positional = args.filter((a) => !a.startsWith('-'))
  const current = () => {
    try {
      return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: input.cwd || process.env.BISMUTH_PROJECT_DIR || process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    } catch {
      return null
    }
  }
  let target
  if (positional.length >= 2) {
    const refspec = positional.at(-1)
    if (refspec.startsWith('+')) block('+refspec ile zorla push')
    target = refspec.includes(':') ? refspec.split(':')[1] : refspec
  }
  if (!target || target === 'HEAD') target = current()
  if (!target) process.exit(0) // outside git: nothing to judge
  target = target.replace(/^refs\/heads\//, '')
  if (!target.startsWith('antigravity/')) block(`'${target}' dalına push`)
}
process.exit(0)
