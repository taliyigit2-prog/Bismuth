---
paths:
  - "src/main/db/**"
  - "src/main/services/**"
  - "drizzle/**"
---
# Veritabanı kuralları (03-mimari.md §4, §6)

- Erişim yalnızca `src/main/db/client.ts`; Drizzle sorguları veya `db.prepare()` parametreli; SQL string birleştirme yasak.
- Şema `src/main/db/schema/*.ts`; migrasyonlar `drizzle/NNNN_slug.sql` yalnızca eklenir (commit edilmiş dosya değişmez).
- Her tablo: `id` (ULID metin), `created_at`, `updated_at`; silme yerine `voided_at`/`status`; `audit_log` her yazmada doldurulur (`before_json`, `after_json`, `reason`).
- Para: `amount_minor INTEGER` + `currency TEXT`; tarih: `TEXT 'YYYY-MM-DD'`; zaman: ISO 8601 UTC metin.
- `room_nights` UNIQUE(room_id, date, slot); `charges.room_night_id` UNIQUE; `fx_rates` UNIQUE(ts, base, quote, source) (`ts` = kurun gözlendiği an).
- Yazmalar `db.transaction(...)` içinde; servis `ctx` ile yetki kontrolü yapmadan sorgu çalıştırmaz.
- WAL + `synchronous=FULL` (otel PC'si çökebiliyor; yazma hacmi küçük) + `foreign_keys=ON` + `busy_timeout=5000` açılışta; `integrity_check` açılışta; yedek `db.backup()` / `VACUUM INTO`.
- Test: servisler `:memory:` veritabanıyla; her test kendi fabrikasını kurar; gerçek `hotel.db` asla okunmaz.
