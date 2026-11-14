"""Bismuth kapanınca (ya da çökünce) yan süreç de ölür: Electron süreci stdin borusu ile başlatır; boru kapanınca
(EOF) süreç çıkar. İşletim sistemi bağımsızdır, Electron'un kendi kapanışından bağımsız çalışır."""

import os
import sys
import threading
from typing import Callable, Optional

WATCH_ENV = "BISMUTH_CAMERA_WATCH_STDIN"


def _block_until_eof(stream) -> None:
    while True:
        chunk = stream.read(1024)
        if not chunk:
            return


def start_parent_watch(
    on_parent_gone: Callable[[], None],
    stream=None,
) -> Optional[threading.Thread]:
    source = stream if stream is not None else getattr(sys.stdin, "buffer", None)
    if source is None:
        return None

    def run() -> None:
        try:
            _block_until_eof(source)
        except (OSError, ValueError):
            pass
        on_parent_gone()

    thread = threading.Thread(target=run, name="parent-watch", daemon=True)
    thread.start()
    return thread


def hard_exit() -> None:  # pragma: no cover - süreci sonlandırır
    os._exit(0)
