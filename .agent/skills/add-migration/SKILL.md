---
name: add-migration
description: >-
  Yeni bir veritabanı migrasyonu açar — Drizzle şemasını değiştirir, drizzle-kit ile
  numaralı SQL üretir, yalnızca eklemeli olduğunu doğrular ve testini ekler. Şema veya
  veritabanı tablosu değiştirirken kullanın.
---

# Yeni Migrasyon Rehberi (`add-migration`)

## Kurallar (tüm çalışma boyunca geçerli)

- **Commit edilmiş migrasyon değişmez** (`ANTIGRAVITY.md` Yasak 9, G-133): müşteri makinesinde çalışmış olabilir. `db-migration-guard` commit edilmiş `drizzle/NNNN_*.sql` dosyasına yazmayı engeller. Düzeltme = yeni migrasyon.
- `drizzle/meta/*` dosyalarını **elle düzenleme**; yalnızca `drizzle-kit` yazar. `meta/_journal.json` yalnızca sona ekleme alır.
- **Yalnızca eklemeli**: tablo/sütun silme ya da yeniden adlandırma yok; `DELETE FROM` yok. Eski ad kalır, yeni sütun eklenir.
- Slug: küçük harf ASCII + alt çizgi (`room_types`, `guest_tags`).

## Adımlar

1. **Bağlam**: `.agent/rules/db.md`'yi, `docs/plan/03-mimari.md` §4'teki tablo tanımını ve `drizzle/` ile `src/main/db/schema/` altındaki son durumu kontrol et.
2. **Temiz başlangıç**: `git status --short drizzle` boş olmalı. Commit edilmemiş (hiçbir makinede çalışmamış) bir önceki migrasyonu yeniden üretmek gerekirse yalnızca `git ls-files drizzle` onu göstermiyorsa: SQL dosyası, `meta/NNNN_snapshot.json` ve `_journal.json`'daki son girdi birlikte geri alınır, sonra yeniden üretilir.
3. **Şema** (`src/main/db/schema/<alan>.ts`, sonra `schema/index.ts` dışa aktarımı):
   - `id`: ULID metin birincil anahtar (`src/shared/ids.ts`).
   - `created_at`, `updated_at` (ISO 8601 UTC metin); çoğu tabloda `created_by` → `users.id`.
   - Para: `amount_minor` `integer` + `currency` `text` (kayan sayı yok). Yerel gün: `text` `YYYY-MM-DD`.
   - Silme yerine `voided_at` / durum sütunu. Yabancı anahtarlar `.references(...)`; aralık sorguları için dizin; tekillik kuralları tablo ek tanımında.
   - Var olan tabloya eklenen `NOT NULL` sütun **mutlaka `DEFAULT`** alır (eski satırlar için).
   - Otele özgü değerler koda değil tohum/ayar tablolarına (`ANTIGRAVITY.md` Yasak 10).
4. **Üret**: `npm run db:generate -- --name <slug>`. Beklenen: yeni `drizzle/NNNN_<slug>.sql`, yeni `drizzle/meta/NNNN_snapshot.json`, değişmiş `drizzle/meta/_journal.json` (`git status --short drizzle`). `drizzle-kit` "created or renamed?" diye etkileşimli soru sorarsa dur; şemayı yalnızca eklemeli hale getirip yeniden üret.
5. **SQL'i oku** ve denetle: `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, `CREATE INDEX`, `CREATE UNIQUE INDEX` beklenir. `DROP TABLE`, `DROP COLUMN`, `RENAME`, `DELETE FROM` ya da SQLite tablo yeniden kurma deseni (`__new_<tablo>` + `INSERT INTO ... SELECT` + `DROP` + `RENAME`) görürsen dur ve sahibe sor; onay gelirse `tests/unit/migrations-additive.test.ts` içindeki `ALLOWED` listesine dosya adı + gerekçe + onay tarihi yazılır ve veri kopyalama testi eklenir.
6. **Test**:
   - `tests/unit/migrations-additive.test.ts` her migrasyonu otomatik tarar.
   - Yeni tablo/sütun/dizin için migrasyon sonrası şema ve yükseltme denetimini (`tests/unit/db.test.ts` / `tests/unit/migrations-upgrade.test.ts`) ekle veya genişlet.
   - Çalıştır: `npx vitest run tests/unit`, `npm run typecheck`, `npm run lint`.
7. **Commit**: şema + SQL + meta + test açık dosya yollarıyla aynı commit'te: `feat(db): add <slug> migration`.
