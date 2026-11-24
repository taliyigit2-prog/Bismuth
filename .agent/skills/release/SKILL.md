---
name: release
description: >-
  Bismuth sürümü için hazırlık ve doğrulama rehberi — G-07 denetimi, sürüm numarası
  artışı, sürüm notu ve tüm yerel kontroller. Sürüm hazırlarken kullanın (etiket
  basma ve GitHub Actions tetikleme yalnızca sahip tarafından yapılır).
---

# Sürüm Hazırlık Rehberi (`release`)

## Kurallar

- **GitHub Actions ajanlar tarafından tetiklenmez** (`ANTIGRAVITY.md` Yasak 15): `gh workflow run`, `gh release create`, `git tag v*` kesinlikle çalıştırılmaz. Ajan yalnız sürüm numarası, sürüm notu, lisans bildirimi ve yerel doğrulamaları hazırlar; sürümü sahip GitHub Actions UI'dan başlatır.
- **Güncelleme sunucusu yok** (G-07, Yasak 4): `publish` ayarı eklenmez, `electron-updater` eklenmez, Release'e `latest.yml` konmaz.
- Sürüm biçimi `X.Y.Z` ve mevcut sürümden büyük olmalıdır.

## Adımlar

1. **Ön koşullar**: çalışma ağacı temiz olmalı, çalışma dalı (`antigravity/...`) güncel olmalı.
2. **G-07 denetimi**:
   - `electron-builder.yml` içinde `publish: null` korunuyor ve komutlarda `--publish never` var.
   - `package.json` bağımlılıklarında telemetri/otomatik güncelleme paketi yok; tüm sürümler sabit (`save-exact=true`).
   - Ağ kodu yalnızca izinli 5 klasörde (`src/main/network/`, `src/main/server/`, `src/main/discovery/`, `src/main/camera/`, `src/renderer/lib/transport/`).
3. **Sürüm ve notlar**:
   - `package.json` `version` alanını (ve `npm version X.Y.Z --no-git-tag-version` ile kilit dosyasını) yalnızca sahip onayladığında artır.
   - `docs/surum-notlari/vX.Y.Z.md` dosyasını sade Türkçe ile yaz.
   - Bağımlılık değiştiyse `npm run notices` çalıştır ve `docs/plan/bagimliliklar.md` tablosunu güncelle.
4. **Yerel kontroller**: `npm run check`, `node scripts/guards/test-guards.mjs`, `npm run i18n:check`, `npm run build` ve değişen ekranların e2e testlerini (tek tek) çalıştır.
5. **Sahibe teslim**: sürüm numarası, değişenler ve test sonuçlarını sahibe bildir. Sahip `main`'e aldıktan sonra GitHub → **Actions** → **release** → **Run workflow** (`publish`) üzerinden yayını kendisi başlatır.
