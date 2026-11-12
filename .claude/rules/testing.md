---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "tests/**"
---
# Test kuralları

- Birim: Vitest; dosya adı `x.test.ts` kaynağın yanında; iş kuralları `src/shared/domain/*.test.ts`, servisler `src/main/services/*.test.ts` (`:memory:` SQLite fabrikası `tests/factories/db.ts`).
- Test adı davranışı anlatır: `it('ödeme 2000 ise ilk gece ödendi, diğerleri ödenmedi')`.
- Excel'den doğrulanmış sayılar değişmez test verisidir (`03-mimari.md` §6): 31.500, 2.328, 6.667, 5.333, 37.300.
- Yetki testleri: her yeni servis metodu için en az bir "yetkisiz rol → PermissionDenied" testi.
- E2E: Playwright `_electron.launch`; senaryolar `tests/e2e/*.spec.ts`; temiz `userData` klasörüyle başlar; CI'da `xvfb-run`.
- Ağ kapalı testi: `network.enabled=false` iken istek sayacı 0 (Faz 11).
- Sahte veri: `scripts/seed-demo.ts`; gerçek isim/para içermez.
