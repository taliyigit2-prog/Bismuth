# fix-flow (akis testi duzeltmeleri)
B1: drive.ts realProbe home = BISMUTH_DRIVE_HOME || homedir(). Set in electron fixtures, setup.spec, mobile harness server.ts (temp dir), ui-shot, guide-shots, perf-measure. seed-demo launches no app (untouched). Test: tests/unit/drive-home-override.test.ts. ~/Library/CloudStorage untouched (136 stale test backups remain; owner cleans).
Specs: shell (testid hotel-save), wrap (long-text.ts: handover uses contract limit; phone fields 17 digits - the overflow tour now really runs, both pass), setup/languages/full-day (hourly + camera steps), guide (count derived from sidebar sections), backup passes. quick-actions uses Meta on darwin; window F11 + light-mode "mode off" skipped on darwin with reason.
fees: real bug - print CSS let table cells stay nowrap in 2-col night report; added wrap rule in print.css (reports/print.css). Note: macOS Electron window cannot go below 960px, so test measures 960 not 703.
B2: fees-panel LateDialog empty amount -> field error form.required.
B3: reservations.grid/calendar.bounds/day-list/week-list gated on can('calendar'); staff.panel in StaffView gated on can('staff'). (Source of the reported 403s not provable by reading; Today's own card was already gated.)
B4: guest dialog phone/idDoc clamped to 40, expense description suggest prefix clamped to 100 (blacklist page already clamped).
B5: not changed - Switch already has a 46px ::after hit area on mobile (shell spec asserts it) and lists/users/shifts switches already have aria-label; report measured the visual box.
B6: login: submit button no longer disabled when empty; empty submit marks field aria-invalid + "Bu alani doldurun" (auth.validation.required). login-page.test updated.
B7: room type dialog: name and price errors split; new keys settings.rooms.typeNameOnly / typePriceNegative (typeNameRequired now unused).
Passing: vitest drive-home, auth, rooms-section, guests, staff, calendar, ledger, layouts; mobile shell/today/guests/calendar/ledger/admin/wrap; electron setup/languages/full-day/guide/backup/fees/quick-actions/window/light-mode. typecheck, lint, i18n-check clean.
Left: no unit test for B2/B4/B7 (covered only by existing suites).
