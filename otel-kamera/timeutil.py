"""Tek zaman kuralı (kod bulgusu 21): her zaman damgası bilgisayarın YEREL saatidir, "YYYY-MM-DDTHH:MM:SS" biçiminde.

`datetime.now()` (saf, yerel) tek kaynaktır; `CURRENT_TIMESTAMP` (UTC) kullanılmaz. Metin karşılaştırması bu biçimde
sıralamayla uyumludur. Çıkış tarihi serbest metin olamaz: `parse_local` doğrulamayı yapar (kod bulgusu 17).
"""

from datetime import datetime, timedelta
from typing import Callable, Optional

LOCAL_FORMAT = "%Y-%m-%dT%H:%M:%S"

_ACCEPTED = (
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
)


def now_local() -> datetime:
    return datetime.now()


def fmt(moment: datetime) -> str:
    return moment.strftime(LOCAL_FORMAT)


def now_str(clock: Callable[[], datetime] = now_local) -> str:
    return fmt(clock())


def parse_local(text: str) -> datetime:
    """'YYYY-MM-DD' (günün sonu, 23:59:59) ya da saatli yerel zaman. Başka her şey ValueError."""
    clean = (text or "").strip()
    if len(clean) == 10:
        day = datetime.strptime(clean, "%Y-%m-%d")
        return day.replace(hour=23, minute=59, second=59)
    for pattern in _ACCEPTED:
        try:
            return datetime.strptime(clean, pattern)
        except ValueError:
            continue
    raise ValueError(f"geçersiz tarih: {clean[:32]!r}")


def checkout_deadline(
    days: int,
    custom: Optional[str] = None,
    clock: Callable[[], datetime] = now_local,
) -> str:
    """Çıkış anı: verilen tarih (doğrulanır) ya da şimdi + gün sayısı."""
    if custom and custom.strip():
        return fmt(parse_local(custom))
    clamped = min(max(1, int(days)), 3650)
    return fmt(clock() + timedelta(days=clamped))
