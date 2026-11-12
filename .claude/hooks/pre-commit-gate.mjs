#!/usr/bin/env node
// PreToolUse on Bash (settings: "if": "Bash(git commit *)"): runs `npm run typecheck`, `npm run lint`, `npm test`
// before every commit Claude makes (CLAUDE.md > Çalışma şekli: üçü geçmeden madde "bitti" sayılmaz).
// - Fail-open while the toolchain is not installed yet (no package.json, missing scripts, no node_modules):
//   a one-line note goes to stderr and the commit proceeds.
// - First failing step → last 60 lines of its output on stderr, exit 2 → the commit is cancelled and Claude sees why.
// - All green → ISO timestamp written to <root>/.claude/.checks-passed (stop-gate.mjs compares mtimes with it).
// Windows: commands run through the platform shell (cmd.exe resolves npm.cmd); no jq, no bash-only syntax.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}

// `if` filtering is best-effort for compound shell commands; confirm this really is a commit.
const command = String(input.tool_input?.command ?? "");
if (!/\bgit\b[^\n;&|]*\bcommit\b/.test(command)) process.exit(0);

// The checkout being committed: a worktree agent commits in its own worktree (its cwd, or `cd <dir> && git
// commit`), and that tree — not the main checkout — is what must pass.
const commitDir = (() => {
  const base = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const cd = /^\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*&&/.exec(command)?.[1]?.replace(/^["']|["']$/g, "");
  const start = cd ? resolve(base, cd) : base;
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: start,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
})();
const root = commitDir || process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const skip = (why) => {
  process.stderr.write(`pre-commit-gate: ${why}; kontroller atlandı.\n`);
  process.exit(0);
};

const pkgPath = join(root, "package.json");
if (!existsSync(pkgPath)) skip("package.json yok");
let scripts = {};
try {
  scripts = JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {};
} catch {
  skip("package.json okunamadı");
}
const steps = [
  { name: "typecheck", cmd: "npm run typecheck" },
  { name: "lint", cmd: "npm run lint" },
  { name: "test", cmd: "npm test" },
];
const missing = steps.filter((s) => typeof scripts[s.name] !== "string").map((s) => s.name);
if (missing.length > 0) skip(`package.json içinde ${missing.join(", ")} betiği yok`);
if (!existsSync(join(root, "node_modules"))) skip("node_modules yok (önce npm ci)");

// Docs-only commits: when nothing the toolchain looks at changed (code, tests, migrations, scripts, build config),
// typecheck/lint/test cannot change outcome, so the commit proceeds without them (a 2-core machine needs ~10 min
// for the full suite). Hook changes still run the hook self-test. Conservative: an unreadable git state runs everything.
const CODE_PATH =
  /^(src|tests|drizzle|scripts|build|resources)\/|^(package\.json|package-lock\.json|tsconfig[^/]*\.json|vitest\.config\.ts|playwright\.config\.ts|electron\.vite\.config\.ts|electron-builder\.yml|eslint\.config\.mjs|\.prettierrc\.yaml|drizzle\.config\.ts|\.npmrc)$/;
const gitLines = (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true })
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
};
const addsInCommand = /\bgit\b[^\n;&|]*\badd\b/.test(command) || /\bcommit\b[^\n;&|]*\s(-a|--all|-am|-[a-zA-Z]*a[a-zA-Z]*)\b/.test(command);
const staged = gitLines(["diff", "--cached", "--name-only"]);
const unstaged = addsInCommand ? gitLines(["diff", "--name-only"]) : [];
const untracked = addsInCommand ? gitLines(["ls-files", "--others", "--exclude-standard"]) : [];
const changed = staged && unstaged && untracked ? [...new Set([...staged, ...unstaged, ...untracked])] : null;
if (changed && changed.length > 0 && !changed.some((f) => CODE_PATH.test(f))) {
  const hooksChanged = changed.some((f) => /^\.claude\/hooks\/.*\.mjs$/.test(f));
  const selfTest = join(root, ".claude", "hooks", "test-hooks.mjs");
  if (hooksChanged && existsSync(selfTest)) {
    const res = spawnSync(process.execPath, [selfTest], { cwd: root, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0" }, timeout: 300_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    if (res.status !== 0) {
      const tail = `${res.stdout ?? ""}${res.stderr ?? ""}`.trimEnd().split(/\r?\n/).slice(-40).join("\n");
      process.stderr.write(`Commit engellendi: kanca testleri başarısız (node .claude/hooks/test-hooks.mjs).\n--- son 40 satır ---\n${tail}\n`);
      process.exit(2);
    }
  }
  process.stderr.write(`pre-commit-gate: yalnız belge/ayar dosyaları değişti (${changed.length} dosya); typecheck/lint/test atlandı${hooksChanged ? ", kanca testleri geçti" : ""}.\n`);
  process.exit(0);
}

// The hook itself has a 600 s timeout in settings.json; keep a margin so a slow run blocks instead of timing out
// (a timed-out hook is a non-blocking error and the commit would go through).
const budgetMs = 570_000;
const started = Date.now();

for (const step of steps) {
  const remaining = budgetMs - (Date.now() - started);
  const res = spawnSync(`${step.cmd} 2>&1`, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
    timeout: Math.max(remaining, 1_000),
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.status !== 0) {
    const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trimEnd();
    const tail = output.split(/\r?\n/).slice(-60).join("\n");
    const why =
      res.error?.code === "ETIMEDOUT"
        ? "zaman aşımı"
        : res.error
          ? `başlatılamadı: ${res.error.message}`
          : `çıkış kodu ${res.status ?? res.signal}`;
    process.stderr.write(
      `Commit engellendi: \`${step.cmd}\` başarısız (${why}). Hatayı düzelt, \`npm run check\` ile doğrula, sonra yeniden commit et ` +
        `(CLAUDE.md: typecheck + lint + test geçmeden commit yok).\n--- son 60 satır ---\n${tail}\n`,
    );
    process.exit(2);
  }
}

try {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", ".checks-passed"), `${new Date().toISOString()}\n`);
} catch {
  /* the marker is a convenience for stop-gate; never block a green commit over it */
}
process.exit(0);
