---
name: release
description: Bismuth sürümü çıkarır — temiz ağaç, G-07 denetimi, sürüm numarası, tüm kontroller, vX.Y.Z etiketi; GitHub Actions release.yml Windows (NSIS) ve macOS (DMG) kurulum dosyalarını SHA256 toplamlarıyla GitHub Release'e ekler. "/release 1.0.0" için; yalnızca kullanıcı çağırır.
argument-hint: "[X.Y.Z]"
arguments: [version]
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git describe *) Bash(git tag *) Bash(npm run *) Bash(npm test *) Bash(npm version *) Bash(gh release view *) Bash(gh run list *) Bash(gh run view *) Bash(gh run watch *)
---

## Durum

!`git status --short | head -20`
!`git describe --tags --abbrev=0 2>/dev/null || echo "henüz etiket yok"`
!`git log --oneline -10`
!`grep -m1 '"version"' package.json 2>/dev/null || echo "package.json yok"`

## Kurallar

- İlk hatada **dur** ve kullanıcıya hangi adımda, neden durduğunu söyle. Etiketi itmek geri alınamaz bir yayındır:
  `git push` öncesi kullanıcıdan açık onay al.
- **Güncelleme sunucusu yok** (G-07, Yasak 4): `publish` ayarı eklenmez, `electron-updater` eklenmez, Release'e güncelleme meta
  verisi (`latest.yml`, `latest-mac.yml`) konmaz.
- Sürüm `$version` biçimi `X.Y.Z` ve son etiketten büyük olmalı; değilse dur.

## Adımlar

1. **Ön koşullar**: çalışma ağacı temiz (`git status --porcelain` boş); sahibin belirlediği dalda; uzak dal ile eşit.
2. **G-07 denetimi** (biri bile tutmazsa dur):
   - `electron-builder.yml` / `package.json` `build` içinde `publish:` yok.
   - Paketleme komutları (`package:win`, `package:mac`, `.github/workflows/release.yml`) `--publish never` ile çağrılıyor
     (yoksa electron-builder CI'da `GH_TOKEN` görünce kendisi yayınlar ve `latest.yml` üretir).
   - `package.json` bağımlılıklarında `electron-updater`, `update-electron-app`, `@sentry/`, `posthog`, `mixpanel`, `firebase`,
     `@segment/` yok; sürümler sabit (`^`/`~` yok).
   - Ağ kodu yalnızca `src/main/network/`, `src/main/server/`, `src/renderer/lib/transport/` içinde (Grep `fetch\(|axios|WebSocket`).
3. **Sürüm**: `npm version $version --no-git-tag-version` (package.json + package-lock.json; kilit dosyasını elle düzenleme).
   `CHANGELOG.md` varsa kullanıcıya dönük, Türkçe bir giriş ekle. "Hakkında" ekranı sürümü `package.json`'dan okur.
   Lisans bildirimleri güncel mi (`npm run notices` varsa çalıştır) ve `docs/plan/bagimliliklar.md` tüm paketleri listeliyor mu.
4. **Kontroller**: `npm run check` (typecheck + lint + test), `npm run build`, `npm run e2e`, `npm run e2e:mobile`. Hepsi geçmeli.
5. **Commit ve etiket**: `chore(release): v$version` commit'i (pre-commit-gate yeniden koşar);
   `git tag -a v$version -m "Bismuth v$version"`. Kullanıcı onayından sonra `git push origin HEAD` ve `git push origin v$version`.
6. **CI izle**: `gh run list --workflow release.yml --limit 3` → `gh run watch <id>`. Başarısızsa `gh run view <id> --log-failed`
   ile nedeni bul; yayınlanmış etiketi sessizce silme ya da taşıma — düzeltme yeni yama sürümüyle, karar kullanıcının.
7. **Yapıtları doğrula**: `gh release view v$version --json assets,url --jq '.url, (.assets[] | "\(.name) \(.size)")'`
   - Windows NSIS kurulumu (`Bismuth-Setup*.exe`, x64/arm64), iki macOS DMG'si (`Bismuth-*-arm64.dmg`, `Bismuth-*-x64.dmg` ya da
     `release.yml`'deki adlar), SHA256 toplam dosyası; her kurulum dosyası toplam dosyasında listeli.
   - `latest*.yml` **olmamalı**; varsa `publish` ayarı sızmış demektir → kullanıcıya bildir.
8. **Rapor**: sürüm, etiket, iş akışı bağlantısı, yapıt listesi (ad + boyut), SHA256 satırları ve sahip için elle deneme listesi:
   Windows 10/11'de kurulum (imzasız olduğu için SmartScreen'de "Ek bilgi → Yine de çalıştır"), Mac'te açılış (ad‑hoc imzalı:
   Sistem Ayarları → Gizlilik ve Güvenlik → "Yine de aç"), "Hakkında" ekranında doğru sürüm, ağ kapalıyken açılış.
