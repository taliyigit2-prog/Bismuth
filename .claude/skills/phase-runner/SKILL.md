---
name: phase-runner
description: Plan fazını (docs/plan/fazlar/faz-NN-*.md) sorular → görev listesi → kod+test → kabul ölçütleri → Sonuç ritüeliyle uygular. "Faz 5'i uygula", "run phase 5", "/phase-runner 05" için.
argument-hint: "[faz-no]"
arguments: [faz]
disable-model-invocation: true
allowed-tools: Bash(npm run *) Bash(npm test *) Bash(npx vitest *) Bash(git status *) Bash(git diff *) Bash(git log *)
---

## Durum

!`cat docs/plan/fazlar/DURUM.md 2>/dev/null | head -30`
!`git status --short | head -20`

## Kurallar (tüm çalışma boyunca geçerli)

1. `docs/plan/fazlar/` altında `faz-$faz-*.md` dosyasını **tamamen** oku. Atıf yapılan her `G-xx` satırını `docs/plan/01-gereksinimler.md` içinde, her `K-xx` kararını `docs/plan/06-kararlar.md` içinde, ilgili `03-mimari.md` bölümlerini oku.
2. Fazın "Sorular" satırındaki `S-xx` sorularını `docs/plan/05-sorular.md`'den al; `06-kararlar.md` "Sahip cevapları" bölümünde cevabı yoksa sahibe **basit Türkçe ile, tek seferde, numaralı** sor. Cevapları oraya yaz. Cevap gelmezse varsayılanı uygula ve "(varsayılan)" işaretle.
3. Teslimatlardan görev listesi çıkar (her kabul ölçütü en az bir göreve bağlanır). Kapsam ekleme.
4. Koda başlamadan önce: dokunulacak dosyalar ve geçerli yasaklar (CLAUDE.md) bir paragrafla yazılır.
   Ortak altyapıyı (kontrat, şema/migrasyon, paylaşılan bileşen) önce kendin yap ve commit et; sonra bağımsız
   paketleri `parallel-build` becerisiyle `feature-builder` ajanlarına **aynı anda** dağıt (model seçimi oradaki
   tabloda). Alan bilgisi gerekiyorsa `researcher` ajanını paketlerle birlikte başlat. Beklerken belgeleri ve
   sonraki paketi hazırla.
5. Her görev: kod + test → `npm run typecheck` → `npm run lint` → ilgili testler. Üçü geçmeden görev kapanmaz.
6. UI değişen görevlerden sonra `turkish-ui-copy` ve `ui-reviewer` ajanlarını, servis/şema değiştiyse `db-reviewer`, main/preload/sunucu değiştiyse `security-reviewer` ajanını **tek mesajda paralel** çalıştır; bulguları paketleyip aynı yolla düzelt. Uzun kontrol çıktısı için `/qa` (ayrı bağlam).
7. Tüm kabul ölçütleri geçince: faz dosyasında kutuları işaretle, sonuna "## Sonuç" ekle (yapılanlar, karşılanan G-xx, açık sorular, ölçümler), `DURUM.md` güncelle, `requirements-tracer` ajanını çalıştır, commit + push. Ekranı olan fazlarda `owner-review` becerisiyle sahibe onay sayfası hazırla; faz, sahip onaylayınca ✅ olur.
8. Bir madde bir `G-xx` ile çelişiyorsa dur ve sahibe sor; sessizce yorumlama.
