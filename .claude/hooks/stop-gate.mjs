#!/usr/bin/env node
// Stop: do not let a turn end while files under src/, tests/, drizzle/, scripts/, .github/ or package.json, package-lock.json,
// electron-builder.yml changed after the last successful check run
// (CLAUDE.md > Çalışma şekli: typecheck + lint + test; üçü geçmeden madde "bitti" sayılmaz).
// "Last successful check run" = mtime of <root>/.claude/.checks-passed, written by `npm run check` and by
// pre-commit-gate.mjs when all three pass. Changed files come from `git status` (modified, staged, untracked).
// - stop_hook_active → exit 0 (one reminder per stop; Claude may then explain why checks cannot pass).
// - Fail-open while the toolchain is not installed (no package.json, missing scripts, no node_modules) or outside git.
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}
if (input.stop_hook_active === true) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

let scripts;
try {
  scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {};
} catch {
  process.exit(0); // no package.json yet
}
if (!["typecheck", "lint", "test", "check"].every((s) => typeof scripts[s] === "string")) process.exit(0);
if (!existsSync(join(root, "node_modules"))) process.exit(0);

// Single files outside the watched folders that still change what ships (dependencies, the installer).
const WATCHED_FILES = ["package.json", "package-lock.json", "electron-builder.yml"];

const git = (args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });

let top;
let status;
try {
  top = git(["rev-parse", "--show-toplevel"]).trim();
  // -z: raw paths (Turkish characters are not octal-quoted); porcelain paths are relative to the repo top level.
  status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "src", "tests", "drizzle", "scripts", ".github", ...WATCHED_FILES]);
} catch {
  process.exit(0); // not a git repository, or git missing
}

const changed = [];
const entries = status.split("\0");
for (let i = 0; i < entries.length; i++) {
  const entry = entries[i];
  if (entry.length < 4) continue;
  const xy = entry.slice(0, 2);
  const abs = resolve(top, entry.slice(3));
  if (xy[0] === "R" || xy[0] === "C") i++; // the next NUL field is the rename/copy source
  const rel = relative(root, abs).replace(/\\/g, "/");
  if (/^(src|tests|drizzle|scripts|\.github)\//.test(rel) || WATCHED_FILES.includes(rel)) changed.push({ abs, rel });
}
if (changed.length === 0) process.exit(0);

// Newest change time; a deleted file counts with its nearest existing parent directory's mtime.
const mtimeOf = (p) => {
  let cur = p;
  for (let n = 0; n < 64; n++) {
    try {
      return statSync(cur).mtimeMs;
    } catch {
      const up = dirname(cur);
      if (up === cur) return 0;
      cur = up;
    }
  }
  return 0;
};
const newest = Math.max(...changed.map((c) => mtimeOf(c.abs)));

const marker = join(root, ".claude", ".checks-passed");
if (existsSync(marker)) {
  try {
    if (statSync(marker).mtimeMs >= newest) process.exit(0);
  } catch {
    /* unreadable marker = no marker */
  }
}

const list = changed.slice(0, 5).map((c) => c.rel);
if (changed.length > 5) list.push(`+${changed.length - 5} dosya`);
const reason =
  `src/, tests/, drizzle/, scripts/, .github/ altındaki dosyalar ya da package.json, package-lock.json, electron-builder.yml son başarılı kontrolden sonra değişti (${list.join(", ")}). ` +
  `Bitirmeden önce \`npm run check\` çalıştır (typecheck + lint + test); hata varsa düzelt ve yeniden çalıştır. ` +
  `CLAUDE.md: üçü geçmeden madde "bitti" sayılmaz. Kontroller bu değişiklikle ilgisiz bir nedenle geçmiyorsa ` +
  `ya da kullanıcı kontrolleri açıkça ertelediyse, bunu kullanıcıya açıkça yaz.`;
process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
