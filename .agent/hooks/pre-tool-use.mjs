#!/usr/bin/env node
// Antigravity PreToolUse hook: adapts native tool payloads to Bismuth's guard scripts in scripts/guards/.
// Always exits 0 with a JSON decision (`{"decision":"allow"}` or `{"decision":"deny","reason":"..."}`).
// Fails open on unexpected/malformed input so a hook issue never locks the workspace.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const allow = () => {
  process.stdout.write(JSON.stringify({ decision: 'allow' }) + '\n')
  process.exit(0)
}

const deny = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'deny', reason }) + '\n')
  process.exit(0)
}

try {
  const raw = readFileSync(0, 'utf8')
  const input = JSON.parse(raw || '{}')
  const toolName = String(input.toolCall?.name ?? '')
  const args = input.toolCall?.args ?? {}
  const selfRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const repoRoot = input.cwd || input.workspacePaths?.[0] || selfRoot
  const guardsDir = join(selfRoot, 'scripts', 'guards')

  const runGuard = (script, payload) => {
    const res = spawnSync(process.execPath, [join(guardsDir, script)], {
      input: JSON.stringify(payload),
      cwd: repoRoot,
      env: { ...process.env, BISMUTH_PROJECT_DIR: repoRoot },
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true
    })
    if (res.status === 2) {
      const reason = (res.stderr ?? '').trim() || `Blocked by Bismuth guard (${script})`
      deny(reason)
    }
  }

  if (toolName === 'run_command') {
    const payload = {
      cwd: repoRoot,
      tool_name: 'Bash',
      tool_input: { command: String(args.CommandLine ?? '') }
    }
    for (const guard of [
      'workflow-guard.mjs',
      'push-guard.mjs',
      'deps-guard.mjs',
      'kbs-data-guard.mjs',
      'camera-data-guard.mjs'
    ]) {
      runGuard(guard, payload)
    }
  } else if (toolName === 'edit_file' || toolName === 'write_file') {
    const payload = {
      cwd: repoRoot,
      tool_name: toolName === 'write_file' ? 'Write' : 'Edit',
      tool_input: {
        file_path: String(args.Path ?? ''),
        content: typeof args.Content === 'string' ? args.Content : undefined,
        new_string: typeof args.Replacement === 'string' ? args.Replacement : undefined
      }
    }
    for (const guard of ['protect-files.mjs', 'db-migration-guard.mjs', 'no-network-guard.mjs']) {
      runGuard(guard, payload)
    }
  }

  allow()
} catch {
  allow()
}
