#!/usr/bin/env bash
# Unattended loop on the Claude subscription (claude.ai login) instead of API credit.
# Uses the official `claude` CLI in print mode and continues the same conversation turn after turn.
#
#   unset ANTHROPIC_API_KEY            # otherwise the API key wins over the subscription login
#   claude                             # once: /login with the claude.ai account, then /exit
#   bash tools/ajan/otonom-abonelik.sh            # start (reads docs/plan/fazlar/YURUTME.md, runs /orkestra)
#   bash tools/ajan/otonom-abonelik.sh --devam    # continue the last conversation
#
# Stops on the done marker <<ORKESTRA_BITTI>> (alone on a line), after 5 failed turns in a row, or after
# SAAT hours (default 12). When the plan's usage limit is hit it waits 20 minutes and tries again.
set -u
cd "$(dirname "$0")/../.."

MODEL="${MODEL:-opus}"
SAAT="${SAAT:-12}"
LOGDIR="tools/ajan/kayit"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/abonelik-$(date +%Y-%m-%d-%H-%M-%S).log"
DONE='<<ORKESTRA_BITTI>>'

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ANTHROPIC_API_KEY tanımlı: bu durumda API kredisi kullanılır. Önce şunu çalıştırın: unset ANTHROPIC_API_KEY"
  exit 1
fi

APPEND="Sahip uyuyor ve bu oturum tam otonom: tur bitince bir betik sana otomatik olarak devam et yazacak. \
Asla soru sorma, onay bekleme ya da sahibe seçenek sunma; belirsizlikte en makul varsayılanı seç, kararı \
docs/plan/06-kararlar.md veya YURUTME.md günlüğüne '(otonom varsayılan)' diye yaz ve ilerle. Tur bitince arka plan \
ajanları da durur: ajanları ön planda çalıştır ya da hepsinin sonucu gelmeden turu bitirme. Her paketi bitirince \
kontrolleri koş, commit et ve claude/fable-analiz dalına pushla. Planlanan bütün iş gerçekten bittiğinde mesajının son \
satırına tek başına $DONE yaz; bu işareti iş bitmeden hiçbir bağlamda yazma. Sahibe Türkçe yaz."

START="docs/analiz/OPUS-BASLANGIC.md ve docs/plan/fazlar/YURUTME.md dosyalarını oku; git status ve git worktree list ile \
nerede kalındığını bul, yarım işleri tamamla, sonra /orkestra ile sıradaki dalgadan devam et."
CONTINUE="Devam et (otomatik mesaj, sahip uyuyor). git status, git worktree list ve YURUTME.md ile nerede kaldığını bul; \
yarım kalan worktree işlerini tamamla ve birleştir, sonra /orkestra ile sıradaki paket ve dalgalara geç. Soru sorma. \
Her paketten sonra commit ve push. Her şey bittiyse son satıra tek başına bitiş işaretini yaz."

prompt="$START"; first_flag=()
if [ "${1:-}" = "--devam" ]; then prompt="$CONTINUE"; first_flag=(--continue); fi

end=$(( $(date +%s) + SAAT * 3600 ))
fails=0
echo "Abonelikle otonom çalışma · model $MODEL · en çok $SAAT saat · kayıt $LOG" | tee -a "$LOG"

while [ "$(date +%s)" -lt "$end" ]; do
  echo "▶ $(date '+%H:%M') tur başlıyor" | tee -a "$LOG"
  out=$(claude -p "$prompt" "${first_flag[@]}" --model "$MODEL" --dangerously-skip-permissions \
    --append-system-prompt "$APPEND" 2>&1)
  code=$?
  printf '%s\n' "$out" | tee -a "$LOG"

  if printf '%s\n' "$out" | grep -qxF "$DONE"; then
    echo "✅ Ajan işin bittiğini bildirdi." | tee -a "$LOG"; break
  fi
  if printf '%s\n' "$out" | grep -qiE "hit your .*limit|usage limit|rate limit|resets "; then
    echo "⏳ Kullanım sınırı; 20 dakika bekleniyor ($(date '+%H:%M'))." | tee -a "$LOG"
    sleep 1200
  elif [ $code -ne 0 ]; then
    fails=$((fails + 1))
    echo "⚠️  Tur hata verdi ($fails/5); 60 sn sonra yeniden." | tee -a "$LOG"
    [ $fails -ge 5 ] && break
    sleep 60
  else
    fails=0
  fi
  prompt="$CONTINUE"; first_flag=(--continue)
done
echo "Otonom çalışma durdu. Devam: bash tools/ajan/otonom-abonelik.sh --devam" | tee -a "$LOG"
