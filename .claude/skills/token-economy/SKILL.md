---
name: token-economy
description: Ajan dağıtırken ve uzun işlerde token harcamasını düşürme kuralları — model seçimi, kısa görev metni, dosyaya rapor, tek tam test koşusu, graphify ile arama, caveman yalnız ajanlar arası. /parallel-build, /qa ve her Agent çağrısından önce uygula.
---

# Token ekonomisi

## Model ve çaba (ajan dosyalarında sabit)
- Kod yazan: `feature-builder` sonnet/medium; küçük/mekanik iş `feature-builder-lite` haiku/medium.
- Muhakeme gerektiren kontrol: `decision-auditor`, `flow-tester`, `db-reviewer`, `ui-reviewer` opus/medium;
  `bug-hunter`, `security-reviewer` sonnet/high.
- Tarama/metin: `requirements-tracer`, `turkish-ui-copy`, `researcher` haiku/medium.
- Tek dosya bulmak için ajan açma; `rg`/`code-graph` yeter.

## Görev metni
- Ortak bilgi bir kez dosyaya (scratchpad `*-common.md`); ajana yalnız yol + kendi maddeleri (≤40 satır).
- Dosya listesini `graphify query/affected` ile ver; ajan geniş keşif yapmasın.
- Ajan raporu: ayrıntı scratchpad'e `REPORT.md`; ana oturuma dönüş ≤15 satır (durum, test sonucu, rapor yolu).

## Çalıştırma
- Tam `npm test`/`npm run check` paket başına bir kez; geliştirirken `npx vitest run <yol>`.
- Uzun çıktıları dosyaya yönlendir, `tail -30`/`grep` ile oku. Büyük dosyayı tamamen okuma; satır aralığı oku.
- Aynı anda en çok 4 kodlayan ajan (yük ve sınır için); yük >8 ise bekle.
- Başarısız ajanı baştan başlatma: worktree'deki yarım işi yeni ajana "devam et" diye ver.

## Üslup
- caveman (kısa üslup) yalnız ajanlar arası ve ajan raporlarında. Sahibe giden metin, belgeler, i18n metinleri
  ve commit mesajları normal, tam cümleli yazılır.
