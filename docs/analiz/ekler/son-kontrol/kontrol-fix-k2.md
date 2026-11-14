# fix-k2
1 table-reader: done (zip central-directory <=50MB, rows<=5000, cols<=100 -> TableReadError); tests/unit/table-reader-limits.test.ts
2 mayChangeHotels fail-closed: done; hotel-list.test.ts
3 env hooks ignored when packaged: done (app.isPackaged in paths.ts; setDrivePackaged in drive.ts called from main/index.ts)
4 redact known secrets: done (registerSecretValues, fed by secrets store); camera.test.ts
5 removeCopy revalidation: done (no dedicated test)
6 undoConvert notFound: done + test (fees-ledger-fixes.test.ts)
7 purgeExpired summary audit: done (no dedicated test)
8 groupPay real status: done
9 badDate truncation 40: done
10 damage deposit note hint: done (feesPanel.noIdHint, settle dialog textarea)
11 laundry.reopen permission (owner+manager; seeded by seed.ts onConflictDoNothing for existing DBs), UI gate switched, matrix + accountant-denied tests: done
12 expense void audit before/after, day-lock check always, comment: done
13 fx.manualRateWarnPercent field in currency FxTab (WarnPercentCard): done
14 copy changes: done (+guide md, e2e/unit test strings)
15 warning icon + text-sm: done; ledger close-hint flex-wrap: done (unverified visually)
Checks: typecheck 0 errors, lint clean, i18n:check ok, targeted vitest green.
