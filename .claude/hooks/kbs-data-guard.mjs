#!/usr/bin/env node
// PreToolUse on Bash (settings: "if": "Bash(git add *)", "Bash(git commit *)"): KBS / identity data never enters the
// repository (CLAUDE.md: "KBS/kimlik verisi asla depoya girmez"). Blocks (exit 2) when the checkout's changes
// (staged, unstaged or untracked, not ignored) contain
//   - a spreadsheet or export (.xlsx .xls .xlsm .ods .csv) — the owner's KBS lists are Excel files;
//   - a valid Turkish identity number (11 digits passing the T.C. kimlik checksum) in a text file, except the
//     well-known public test number.
// Fail-open outside git. The checkout is the one the command runs in (`cd <dir> && …`, `git -C <dir>`, the tool's cwd).
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}
const command = String(input.tool_input?.command ?? "");
if (!/\bgit\b[^\n;&|]*\b(add|commit)\b/.test(command)) process.exit(0);

const base = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const unquote = (p) => p.replace(/^["']|["']$/g, "");
const dir =
  /\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/.exec(command)?.[1] ?? /^\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*&&/.exec(command)?.[1];
const start = dir ? (isAbsolute(unquote(dir)) ? unquote(dir) : resolve(base, unquote(dir))) : base;

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024, windowsHide: true });

let root;
let changed;
try {
  root = git(["rev-parse", "--show-toplevel"], start).trim();
  changed = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], root)
    .split("\0")
    .filter(Boolean)
    .filter((entry) => !entry.startsWith("D ") && !entry.startsWith(" D"))
    .map((entry) => entry.slice(3));
} catch {
  process.exit(0);
}

const PUBLIC_TEST_NUMBERS = new Set(["10000000146"]);
const isIdentityNumber = (s) => {
  if (!/^[1-9]\d{10}$/.test(s) || PUBLIC_TEST_NUMBERS.has(s)) return false;
  const d = [...s].map(Number);
  const tenth = (((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
  const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return tenth === d[9] && eleventh === d[10];
};

const problems = [];
for (const file of changed) {
  if (/\.(xlsx|xls|xlsm|ods|csv)$/i.test(file)) {
    problems.push(`${file}: tablo/dışa aktarım dosyası (KBS listeleri depoya girmez)`);
    continue;
  }
  const full = join(root, file);
  try {
    if (statSync(full).size > 2 * 1024 * 1024) continue;
    const text = readFileSync(full, "utf8");
    if (text.includes("\0")) continue; // binary
    const hit = [...text.matchAll(/(?<![\d.])\d{11}(?![\d.])/g)].find((m) => isIdentityNumber(m[0]));
    if (hit) {
      const line = text.slice(0, hit.index).split("\n").length;
      problems.push(`${file}:${line}: T.C. kimlik numarası biçiminde bir sayı`);
    }
  } catch {
    /* deleted or unreadable: nothing to scan */
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `Engellendi: kimlik/KBS verisi depoya girmez (CLAUDE.md).\n${problems.map((p) => `- ${p}`).join("\n")}\n` +
      "Dosyayı çıkarın ya da sayıyı uydurma bir örnekle (10000000146) değiştirin.\n",
  );
  process.exit(2);
}
process.exit(0);
