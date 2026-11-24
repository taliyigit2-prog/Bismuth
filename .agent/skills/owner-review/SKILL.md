---
name: owner-review
description: >-
  Sahibin ekran onayı için üç dilli, açık/koyu temalı, masaüstü/telefon ekran görüntülü
  inceleme galerisi (index.html + WebP) üretir ve onay kayıtlarını docs/plan/taslak-onay/
  altına işler. Ekran onay paketi hazırlanırken kullanın.
---

# Sahip Ekran Onayı Rehberi (`owner-review`)

## 1. Ekran Listesi

`.tmp/owner-review/review.json` dosyasını hazırla (`mkdir -p .tmp/owner-review`, gitignore'da):
`title` ("Bismuth ... onayı"), `eyebrow`, `date` (`YYYY-MM-DD`), `lede` (sade Türkçe özet), `groups: [{group, items: [{key, title, desc, req}]}]`.
`key`, `ui:shot` dosya adıdır (`setup?step=4` → `setup-step-4`, `settings?tab=users` → `settings-tab-users`).

## 2. Ekran Görüntüleri

Her dil (`tr`, `en`, `ru`) için görüntüleri **sırayla** üret (düşük bellekli Mac nedeniyle aynı anda tek koşu):

```bash
for l in tr en ru; do npm run ui:shot -- \
  --routes <virgülle-anahtarlar> --out .tmp/owner-review/shots/$l --lang $l --port 47370 --full --wait 800; done
```

Görüntüleri kontrol et: boş, yarım yüklenmiş veya kişisel veri içeren kare varsa düzelt ve yeniden çek.

## 3. İnceleme Sayfasını Üret

```bash
node .agent/skills/owner-review/build.mjs .tmp/owner-review/review.json .tmp/owner-review/shots .tmp/owner-review/review-out
```

Çıktı `.tmp/owner-review/review-out/index.html` ve `img/<lang>/*.webp` olarak üretilir (ImageMagick gerekir).

## 4. Kayıt

Onay kararlarını ve notları `docs/plan/taslak-onay/<tarih>-<konu>.md` dosyasına yazıp sahibe sade Türkçe ile sun.
