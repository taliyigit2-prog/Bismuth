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
- **İstisna (K-52):** `guest_faces` ve `camera_events` fiziksel silinebilir (biyometrik veri; çıkışta / saklama süresi sonunda); silme yine servis katmanında `inTransaction` + `audit_log` ile, şifreli bayt audit'e yazılmaz; iki tablo yedeğe, dışa aktarmaya, kopyaya ve kutuya girmez (`src/main/backup/biometric.ts`, `replica/tables.ts` LOCAL_ONLY_TABLES).
- Para: `amount_minor INTEGER` + `currency TEXT`; tarih: `TEXT 'YYYY-MM-DD'`; zaman: ISO 8601 UTC metin.
- `room_nights`: gece = UNIQUE(room_id, date) (kısmi, slot=night); gündüz = UNIQUE(room_id, date, start_time) (kısmi) + saatsiz gündüz için UNIQUE(room_id, date) (kısmi) (0019, K-48; saat çakışması `shared/domain/stays.ts`); `charges.room_night_id` UNIQUE; `fx_rates` UNIQUE(ts, base, quote, source) (`ts` = kurun gözlendiği an).
- Yazmalar `db.transaction(...)` içinde; servis `ctx` ile yetki kontrolü yapmadan sorgu çalıştırmaz.
- WAL + `synchronous=FULL` (otel PC'si çökebiliyor; yazma hacmi küçük) + `foreign_keys=ON` + `busy_timeout=5000` açılışta; `integrity_check` açılışta; yedek `db.backup()` / `VACUUM INTO`.
- Test: servisler `:memory:` veritabanıyla; her test kendi fabrikasını kurar; gerçek `hotel.db` asla okunmaz.
