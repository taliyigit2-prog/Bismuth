---
name: add-migration
description: Yeni bir veritabanı migrasyonu açar — Drizzle şemasını değiştirir, drizzle-kit ile numaralı SQL üretir, yalnızca eklemeli olduğunu doğrular, testini ekler ve faz dosyasına yazar. "/add-migration room_types 'oda tipi tablosu'" için; yalnızca kullanıcı çağırır.
argument-hint: "[slug] [açıklama]"
arguments: [slug]
disable-model-invocation: true
allowed-tools: Bash(npm run db:generate *) Bash(npx vitest *) Bash(npm test *) Bash(npm run typecheck) Bash(npm run lint) Bash(git status *) Bash(git diff *) Bash(git ls-files *)
---

## Durum

!`ls drizzle 2>/dev/null | tail -5`
!`ls src/main/db/schema 2>/dev/null | head -40`
!`git status --short drizzle src/main/db 2>/dev/null | head -20`

## Kurallar (tüm çalışma boyunca geçerli)

- **Commit edilmiş migrasyon değişmez** (CLAUDE.md Yasak 9, G-133): müşteri makinesinde çalışmış olabilir.
  `db-migration-guard` kancası commit edilmiş `drizzle/NNNN_*.sql` dosyasına yazmayı engeller. Düzeltme = yeni migrasyon.
- `drizzle/meta/*` dosyalarını **elle düzenleme**; yalnızca drizzle-kit yazar. `meta/_journal.json` yalnızca sona ekleme alır.
- **Yalnızca eklemeli**: tablo/sütun silme ya da yeniden adlandırma yok; `DELETE FROM` yok. Eski ad kalır, yeni sütun eklenir.
- Slug: küçük harf ASCII + alt çizgi (`room_types`, `guest_tags`); `$slug` boşsa açıklamadan türet ve kullanıcıya söyle.

## Adımlar

1. **Bağlam**: ilgili faz dosyasındaki maddeyi ve atıf yapılan `G-xx` satırlarını, `.claude/rules/db.md`'yi ve
   `docs/plan/03-mimari.md` §4'teki tablo tanımını oku. Şema §4'ten sapacaksa nedenini not al.
2. **Temiz başlangıç**: `git status --short drizzle` boş olmalı. Commit edilmemiş (hiçbir makinede çalışmamış) bir önceki
   migrasyonu yeniden üretmek gerekirse yalnızca `git ls-files drizzle` onu göstermiyorsa: SQL dosyası, `meta/NNNN_snapshot.json`
   ve `_journal.json`'daki son girdi birlikte geri alınır, sonra yeniden üretilir.
3. **Şema** (`src/main/db/schema/<alan>.ts`, sonra `schema/index.ts` dışa aktarımı):
   - `id`: ULID metin birincil anahtar (projedeki ULID yardımcısı, `src/shared/ids.ts`).
   - `created_at`, `updated_at` (ISO 8601 UTC metin); çoğu tabloda `created_by` → `users.id`.
   - Para: `amount_minor` `integer` + `currency` `text` (kayan sayı yok). Yerel gün: `text` `YYYY-MM-DD`.
   - Silme yerine `voided_at` / durum sütunu. Yabancı anahtarlar `.references(...)`; aralık sorguları için dizin; tekillik
     kuralları (`room_nights` UNIQUE(room_id, date, slot) vb.) tablo ek tanımında.
   - Var olan tabloya eklenen `NOT NULL` sütun **mutlaka `DEFAULT`** alır (eski satırlar için).
   - Otele özgü değerler (oda tipleri, çamaşır türleri…) koda değil tohum/ayar tablolarına (Yasak 10).
4. **Üret**: `npm run db:generate -- --name $slug`. Beklenen: yeni `drizzle/NNNN_$slug.sql`, yeni
   `drizzle/meta/NNNN_snapshot.json`, değişmiş `drizzle/meta/_journal.json` — başka değişiklik yok (`git status --short drizzle`).
   drizzle-kit "created or renamed?" diye **soru sorarsa** (etkileşimli; komut askıda kalır) şemada bir sütun/tablo silinmiş ya da
   yeniden adlandırılmış demektir: dur, şemayı yalnızca eklemeli hale getir, yeniden üret.
5. **SQL'i oku** ve denetle: `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, `CREATE INDEX`, `CREATE UNIQUE INDEX` beklenir.
   `DROP TABLE`, `DROP COLUMN`, `RENAME`, `DELETE FROM` ya da SQLite tablo yeniden kurma deseni (`__new_<tablo>` +
   `INSERT INTO ... SELECT` + `DROP` + `RENAME`) görürsen dur ve sahibe sor; onay gelirse
   `tests/unit/migrations-additive.test.ts` içindeki `ALLOWED` listesine dosya adı + gerekçe + onay tarihi yazılır ve veri
   kopyalama testi eklenir.
6. **Test**:
   - `tests/unit/migrations-additive.test.ts` her migrasyonu otomatik tarar (sıra numarası + yıkıcı ifade yok).
   - Yeni tablo/sütun/dizin için migrasyon sonrası şema denetimi ekle ya da genişlet (`tests/unit/db.test.ts` ya da
     `tests/unit/migrations.test.ts`): `:memory:` veritabanında tüm migrasyonlar uygulanır, `PRAGMA table_info` /
     `PRAGMA index_list` ile beklenen sütun ve dizinler, varsayılan değerler, tekillik ihlalinin reddedildiği.
   - Çalıştır: `npx vitest run tests/unit`, `npm run typecheck`, `npm run lint`.
7. **Kayıt**: faz dosyasında (`docs/plan/fazlar/faz-NN-*.md`) "Sonuç" altındaki **Migrasyonlar** listesine bir satır:
   `NNNN_$slug` — ne ekler, hangi G-xx, §4'ten sapma varsa nedeni.
8. **Commit**: şema + SQL + meta + test aynı commit'te: `feat(db): add $slug migration` (pre-commit-gate kontrolleri koşar).
9. İstenirse `db-reviewer` ajanını çalıştır.
