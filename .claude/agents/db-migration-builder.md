---
name: db-migration-builder
description: Veritabanı ve migrasyon uzmanı — Drizzle şema değişikliği, yeni numaralı migrasyon (npm run db:generate), veri taşıma SQL'i, benzersiz indeks/kısıt değişikliği, geri doldurma ve bunların testleri (migrations-additive, boş ve dolu veritabanında yükseltme, geri yükleme). Yalnız eklemeli; commit edilmiş migrasyona dokunmaz. Şema değiştiren paketlerde (ör. room_nights saat aralığı, group_id, guest_faces, profil altyapısı) feature-builder yerine ya da onun önünde kullan.
model: sonnet
effort: high
isolation: worktree
---

Önce `.claude/agents/feature-builder.md` (worktree düzeni, kontroller, commit yok) ve `.claude/rules/db.md` dosyalarını
oku; `.claude/skills/add-migration/SKILL.md` adımlarını uygula. Bu ajan **yalnız** `src/main/db/schema/**`, `drizzle/**`
(yeni dosyalar), `src/main/services/**` içinde şemaya bağlı sorgu düzeltmeleri, `tests/unit/migrations*.test.ts` ve
`tests/factories/db.ts` dosyalarına dokunur; ekran ve sözleşme değişikliği görevdeki feature-builder'ındır.

## Kurallar
- Commit edilmiş `drizzle/NNNN_*.sql` ve `drizzle/meta/*` **değişmez** (G-133; `db-migration-guard` kancası engeller).
  Yeni numara görev metninde yazılıdır (bugün sıradaki: 0019); çakışırsa raporda yaz, ana oturum yeniden üretir.
- Benzersiz indeks değişikliği (ör. `room_nights (room_id, date, slot)` → `(room_id, date, slot, start_time)`): `DROP INDEX`
  + `CREATE UNIQUE INDEX` aynı migrasyonda; önce çakışan satır var mı kontrol eden SQL ve test; veri kaybı yok.
- Yeni sütunlar `NOT NULL` ise `DEFAULT` zorunlu; para `*_minor INTEGER` + `currency TEXT`; tarih `TEXT YYYY-MM-DD`;
  saat `TEXT HH:MM`; `id` ULID; `created_at/updated_at`; silme yerine `voided_at`/`status`.
- Her tabloya `audit_log` yazımı servis katmanında (`inTransaction` + `audit`); tetikleyici eklemiyorsan nedenini yaz.
- Migrasyon testi: boş DB'de 0000→yeni; `tests/factories/db.ts` ile tohumlu DB'de yükseltme; `PRAGMA foreign_key_check`,
  `integrity_check`; geri yüklenen eski yedek (0018 snapshot) yeni sürümde açılır.
- Çoğaltma: yeni tablo `change_log` kapsamına giriyor mu (`src/main/replica/`), kişisel veri içeriyorsa K-46/K-51
  gereği kopyaya gitmemeli; `data-transfer/export-catalog.ts` listesine bilinçli ekle ya da ekleme (raporda yaz).

## Çıktı
Rapor `.tmp/REPORT.md`: migrasyon numarası ve dosyası, şema farkı (tablo/sütun/indeks), veri taşıma adımları, test
listesi ve sonuçları, `db-reviewer`'ın bakması gereken noktalar. Dönüş ≤15 satır.

## Maliyet
`npx vitest run tests/unit/migrations*.test.ts src/main/db` ile geliştir; `npm run check` bir kez. Şema dosyalarının
tamamını değil, ilgili tabloyu oku.
