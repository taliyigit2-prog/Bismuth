"""Köprü güvenliği (K-49, K-53): yan süreç yalnız 127.0.0.1'e bağlanır; her istek `X-Bismuth-Token` taşır;
`Host` ve `Origin` denetlenir; CORS yoktur. Canlı yayın `<img>` başlık gönderemediği için yalnız `/api/stream`
kısa ömürlü imzalı `st` parametresini de kabul eder (Bismuth üretir, belirteç kendisi URL'ye girmez).
"""

import hashlib
import hmac
import json
import re
import time
from typing import Callable, Optional
from urllib.parse import parse_qs

TOKEN_HEADER = b"x-bismuth-token"
STREAM_PATH = "/api/stream"
STREAM_PARAM = "st"


def make_stream_token(secret: str, expires_at: int) -> str:
    """`<bitiş_epoch>.<hex imza>`; imza belirteçten türer, belirteç sızmaz."""
    sig = hmac.new(secret.encode(), f"stream:{expires_at}".encode(), hashlib.sha256).hexdigest()
    return f"{expires_at}.{sig}"


def verify_stream_token(secret: str, value: str, now: Optional[float] = None) -> bool:
    try:
        exp_text, sig = value.split(".", 1)
        expires_at = int(exp_text)
    except ValueError:
        return False
    if expires_at < (now if now is not None else time.time()):
        return False
    expected = make_stream_token(secret, expires_at).split(".", 1)[1]
    return hmac.compare_digest(expected, sig)


# Son `@` işaretine kadar: elle yazılan şifre `/`, `:` ya da `@` içerebilir.
_URL_CREDENTIALS = re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)\S*@")


def redact(text: str) -> str:
    """Günlüğe giden metinde URL'nin başındaki `kullanıcı:şifre@` bölümü `***:***@` olur (kod bulgusu 9, K-49)."""
    return _URL_CREDENTIALS.sub(r"\1***:***@", text)


class BridgeGuard:
    """Saf ASGI ara katmanı. Sıra: Host (DNS rebinding) → Origin (CSRF) → belirteç."""

    def __init__(self, app, token: str, port: int, clock: Callable[[], float] = time.time):
        self.app = app
        self.token = token
        self.hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        self.origins = {f"http://{h}" for h in self.hosts}
        self.clock = clock

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
            return
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        host = headers.get(b"host", b"").decode("latin-1").lower()
        if host not in self.hosts:
            await self._reject(send, 403, "forbidden_host")
            return
        origin = headers.get(b"origin")
        if origin is not None and origin.decode("latin-1").lower() not in self.origins:
            await self._reject(send, 403, "forbidden_origin")
            return
        if not self._token_ok(scope, headers):
            await self._reject(send, 401, "token_required")
            return
        await self.app(scope, receive, send)

    def _token_ok(self, scope, headers) -> bool:
        given = headers.get(TOKEN_HEADER, b"")
        if given and hmac.compare_digest(given, self.token.encode()):
            return True
        if scope["method"] == "GET" and scope["path"] == STREAM_PATH:
            query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
            for candidate in query.get(STREAM_PARAM, []):
                if verify_stream_token(self.token, candidate, self.clock()):
                    return True
        return False

    @staticmethod
    async def _reject(send, status: int, code: str) -> None:
        body = json.dumps({"detail": code}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"cache-control", b"no-store"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
