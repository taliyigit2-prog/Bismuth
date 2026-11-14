"""Analiz döngüsü sağlık sayacı (kod bulguları 12, 13): döngü istisnada ölmez; sayılır ve `/api/health` ile Bismuth'a bildirilir."""

import threading
import time
from typing import Any, Callable, Dict, Optional

from bridge_security import redact

STALLED_AFTER_SECONDS = 10.0


class LoopHealth:
    def __init__(self, clock: Callable[[], float] = time.time):
        self._clock = clock
        self._lock = threading.Lock()
        self._started_at = clock()
        self._ticks = 0
        self._errors = 0
        self._consecutive = 0
        self._last_error: Optional[str] = None
        self._last_error_at: Optional[float] = None
        self._last_tick_at: Optional[float] = None

    def ok(self) -> None:
        with self._lock:
            self._ticks += 1
            self._consecutive = 0
            self._last_tick_at = self._clock()

    def error(self, exc: BaseException, where: str = "loop") -> int:
        """Hata sayar; ardışık hata sayısını döner (geri çekilme süresi için). Mesajdaki URL şifreleri maskelenir."""
        text = f"{where}: {type(exc).__name__}: {redact(str(exc))}"[:300]
        with self._lock:
            self._errors += 1
            self._consecutive += 1
            self._last_error = text
            self._last_error_at = self._clock()
            return self._consecutive

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            now = self._clock()
            idle = now - (self._last_tick_at if self._last_tick_at is not None else self._started_at)
            if self._consecutive > 0:
                state = "degraded"
            elif idle > STALLED_AFTER_SECONDS:
                state = "stalled"
            else:
                state = "ok"
            return {
                "state": state,
                "ticks": self._ticks,
                "errors": self._errors,
                "consecutive_errors": self._consecutive,
                "last_error": self._last_error,
                "seconds_since_last_error": None if self._last_error_at is None else round(now - self._last_error_at, 1),
                "seconds_since_tick": round(idle, 1),
            }
