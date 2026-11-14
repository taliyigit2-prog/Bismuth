"""Tek zaman kuralı (kod bulgusu 21): her zaman damgası bilgisayarın YEREL saatidir, "YYYY-MM-DDTHH:MM:SS" biçiminde.

`datetime.now()` (saf, yerel) tek kaynaktır; `CURRENT_TIMESTAMP` (UTC) kullanılmaz. Bismuth bu metni kendi yerel saati
olarak okur. (P20c: çıkış tarihi/misafir süresi artık yan süreçte yoktur; tek kaynak Bismuth.)
"""

from datetime import datetime
from typing import Callable

LOCAL_FORMAT = "%Y-%m-%dT%H:%M:%S"


def now_local() -> datetime:
    return datetime.now()


def fmt(moment: datetime) -> str:
    return moment.strftime(LOCAL_FORMAT)


def now_str(clock: Callable[[], datetime] = now_local) -> str:
    return fmt(clock())
