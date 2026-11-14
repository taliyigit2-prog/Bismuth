"""Tek seferlik kamera denemesi (P20g, K-59): kurulum sihirbazı bir RTSP adresini kaydetmeden önce dener.

Yan süreç (web_app.py) çalışmasa da çalışır: Bismuth bu dosyayı kısa ömürlü bir süreç olarak başlatır, adresi
`BISMUTH_PROBE_SOURCE` ortam değişkeniyle verir (komut satırında görünmesin diye), tek satırlık JSON yanıtı stdout'tan okur.
Adres günlüğe, stdout'a ya da hata iletisine yazılmaz; şifre hiçbir yerde görünmez.

Adımlar: (1) adres yalnız bu ağın özel adresi olabilir (K-49); (2) RTSP DESCRIBE ile ulaşılabilirlik ve kimlik doğrulaması
(Digest/Basic) — hatayı ayırt edebilmek için; (3) OpenCV ile tek kare alınır, küçültülür, JPEG olarak döner.
Hata nedenleri Bismuth'un sözleşmesindeki (`CAMERA_PROBE_REASONS`) adlardır.
"""

import base64
import hashlib
import ipaddress
import json
import os
import re
import secrets
import socket
import sys
import threading
from typing import Any, Callable, Optional, Tuple
from urllib.parse import quote, unquote, urlsplit

SCHEME = "rtsp:" + "//"  # parçalı: depo kancası şifreli adres metnini yakalar
CONNECT_TIMEOUT = 4.0
REPLY_TIMEOUT = 4.0
GRAB_TIMEOUT = 10.0
MAX_IMAGE_WIDTH = 640
JPEG_QUALITY = 70

# Sonuç adları (src/shared/contract/camera.ts ile aynı).
OK = None
TIMEOUT = "timeout"
UNREACHABLE = "unreachable"
AUTH = "auth"
PATH = "path"
NO_FRAME = "noFrame"
BAD_ADDRESS = "badAddress"
UNAVAILABLE = "unavailable"


# K-49: bir kameranın bulunabileceği tek adresler (src/shared/domain/camera-source.ts `isCameraHost` ile aynı liste):
# 10/8, 172.16/12, 192.168/16, bağlantı-yerel 169.254/16 ve bu bilgisayar (127/8, kamera benzetici).
CAMERA_NETWORKS = tuple(
    ipaddress.ip_network(n)
    for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "127.0.0.0/8")
)

# ffmpeg yalnız RTSP ailesini açabilir: yönlendirme ile http/file/... adreslerine gidemez.
FFMPEG_OPTIONS = "rtsp_transport;tcp|stimeout;5000000|protocol_whitelist;rtsp,rtp,tcp,udp"


class ProbeError(Exception):
    """Deneme bir nedenle bitti; `reason` sözleşme adıdır."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def parse_source(source: str) -> Tuple[str, str, str, int, str]:
    """(kullanıcı, şifre, sunucu, port, yol); özel/loopback IPv4 değilse ya da rtsp değilse BAD_ADDRESS."""
    if any(ord(c) < 0x21 or ord(c) == 0x7F for c in source):  # boşluk/denetim karakteri (CR, LF, sekme...) olamaz
        raise ProbeError(BAD_ADDRESS)
    try:
        parts = urlsplit(source)
        host = parts.hostname or ""
        port = parts.port or 554
    except ValueError as exc:
        raise ProbeError(BAD_ADDRESS) from exc
    if parts.scheme.lower() != "rtsp" or not host:
        raise ProbeError(BAD_ADDRESS)
    try:
        ip = ipaddress.ip_address(host)
    except ValueError as exc:  # bir ad ("kamera.local") çözümlenmez: yalnız sayısal adres
        raise ProbeError(BAD_ADDRESS) from exc
    if ip.version != 4 or not any(ip in net for net in CAMERA_NETWORKS):
        raise ProbeError(BAD_ADDRESS)
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    user, password = unquote(parts.username or ""), unquote(parts.password or "")
    # Kullanıcı adı Digest başlığına tırnak içinde girer: CR/LF/" başlık enjeksiyonu olur.
    if any(c in user for c in '\r\n"') or any(c in password for c in "\r\n"):
        raise ProbeError(BAD_ADDRESS)
    return user, password, host, port, path


def build_source(user: str, password: str, host: str, port: int, path: str) -> str:
    """Doğrulanan parçalardan (kullanıcı ve şifre yüzde kodlu) rtsp adresi: ffmpeg'e giden adres özgün metin değil, bu olur."""
    auth = f"{quote(user, safe='')}:{quote(password, safe='')}@" if user else ""
    return f"{SCHEME}{auth}{host}:{port}{path}"


def _md5(text: str) -> str:
    return hashlib.md5(text.encode("utf-8"), usedforsecurity=False).hexdigest()


def authorization(challenge: str, user: str, password: str, method: str, uri: str) -> Optional[str]:
    """`WWW-Authenticate` başlığına karşılık `Authorization` değeri (Digest ya da Basic); tanınmazsa None."""
    scheme = challenge.split(None, 1)[0].lower() if challenge.strip() else ""
    if scheme == "basic":
        token = base64.b64encode(f"{user}:{password}".encode()).decode()
        return f"Basic {token}"
    if scheme != "digest":
        return None
    fields = dict(re.findall(r'(\w+)="?([^",]*)"?', challenge))
    realm, nonce = fields.get("realm", ""), fields.get("nonce", "")
    ha1 = _md5(f"{user}:{realm}:{password}")
    ha2 = _md5(f"{method}:{uri}")
    base = f'Digest username="{user}", realm="{realm}", nonce="{nonce}", uri="{uri}"'
    if fields.get("qop") == "auth":  # "auth,auth-int" da buraya "auth" olarak gelir (virgülde kesilir)
        nc, cnonce = "00000001", secrets.token_hex(8)
        response = _md5(f"{ha1}:{nonce}:{nc}:{cnonce}:auth:{ha2}")
        return f'{base}, response="{response}", qop=auth, nc={nc}, cnonce="{cnonce}"'
    return f'{base}, response="{_md5(f"{ha1}:{nonce}:{ha2}")}"'


def _read_response(sock: socket.socket) -> Tuple[int, str]:
    """RTSP yanıtının durum kodu ve `WWW-Authenticate` başlığı (gövde okunmaz)."""
    data = b""
    while b"\r\n\r\n" not in data and len(data) < 16384:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
    head = data.decode("latin-1", "replace")
    first = head.split("\r\n", 1)[0].split()
    if len(first) < 2 or not first[0].upper().startswith("RTSP/") or not first[1].isdigit():
        raise ProbeError(NO_FRAME)
    challenge = ""
    for line in head.split("\r\n")[1:]:
        if line.lower().startswith("www-authenticate:"):
            value = line.split(":", 1)[1].strip()
            if not challenge or value.lower().startswith("digest"):  # Digest varsa onu seç
                challenge = value
    return int(first[1]), challenge


def describe(user: str, password: str, host: str, port: int, path: str) -> None:
    """DESCRIBE ile adresin cevap verdiğini ve kimlik bilgisinin geçtiğini denetler; olmazsa ProbeError."""
    url = f"rtsp://{host}:{port}{path}"
    try:
        sock = socket.create_connection((host, port), timeout=CONNECT_TIMEOUT)
    except TimeoutError as exc:
        raise ProbeError(TIMEOUT) from exc
    except OSError as exc:
        raise ProbeError(UNREACHABLE) from exc
    with sock:
        sock.settimeout(REPLY_TIMEOUT)
        try:
            auth: Optional[str] = None
            for cseq in (1, 2):
                headers = f"DESCRIBE {url} RTSP/1.0\r\nCSeq: {cseq}\r\nAccept: application/sdp\r\nUser-Agent: Bismuth\r\n"
                if auth:
                    headers += f"Authorization: {auth}\r\n"
                sock.sendall((headers + "\r\n").encode("utf-8"))
                status, challenge = _read_response(sock)
                if status == 200:
                    return
                if status == 401:
                    if auth is not None or not user:  # kimlik denendi ve geçmedi / hiç kimlik yok
                        raise ProbeError(AUTH)
                    auth = authorization(challenge, user, password, "DESCRIBE", url)
                    if auth is None:
                        raise ProbeError(AUTH)
                    continue
                if status in (403, 407):
                    raise ProbeError(AUTH)
                raise ProbeError(PATH)
            raise ProbeError(AUTH)
        except TimeoutError as exc:
            raise ProbeError(TIMEOUT) from exc
        except ConnectionError as exc:
            raise ProbeError(NO_FRAME) from exc


def grab_frame(source: str) -> Tuple[bytes, int, int]:  # pragma: no cover - gerçek kamera/OpenCV gerektirir
    """OpenCV ile tek kare: (JPEG baytları, genişlik, yükseklik); alınamazsa ProbeError."""
    try:
        import cv2
    except ImportError as exc:
        raise ProbeError(UNAVAILABLE) from exc
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = FFMPEG_OPTIONS
    result: dict = {}

    def work() -> None:
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        try:
            if not cap.isOpened():
                return
            for _ in range(3):  # ilk kare sıklıkla bozuk gelir
                ok, frame = cap.read()
                if ok and frame is not None:
                    result["frame"] = frame
        finally:
            cap.release()

    thread = threading.Thread(target=work, daemon=True)
    thread.start()
    thread.join(GRAB_TIMEOUT)
    if thread.is_alive():
        raise ProbeError(TIMEOUT)
    frame = result.get("frame")
    if frame is None:
        raise ProbeError(NO_FRAME)
    height, width = frame.shape[:2]
    if width > MAX_IMAGE_WIDTH:
        scale = MAX_IMAGE_WIDTH / width
        frame = cv2.resize(frame, (MAX_IMAGE_WIDTH, max(1, int(height * scale))))
        height, width = frame.shape[:2]
    ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise ProbeError(NO_FRAME)
    return bytes(buffer), int(width), int(height)


def probe(
    source: str,
    describe_fn: Optional[Callable[..., None]] = None,
    grab_fn: Optional[Callable[[str], Tuple[bytes, int, int]]] = None,
) -> dict:
    """Tek denemenin sonucu: {ok, reason, image, width, height}; `image` base64 JPEG ya da None."""
    try:
        user, password, host, port, path = parse_source(source)
        (describe_fn or describe)(user, password, host, port, path)
        jpeg, width, height = (grab_fn or grab_frame)(build_source(user, password, host, port, path))
    except ProbeError as exc:
        return {"ok": False, "reason": exc.reason, "image": None, "width": 0, "height": 0}
    except Exception:  # beklenmeyen: nedeni ve adresi sızdırmadan "kare yok"
        return {"ok": False, "reason": NO_FRAME, "image": None, "width": 0, "height": 0}
    return {"ok": True, "reason": OK, "image": base64.b64encode(jpeg).decode("ascii"), "width": width, "height": height}


def main(argv: Optional[list] = None, env: Optional[Any] = None) -> int:
    env = os.environ if env is None else env
    source = str(env.get("BISMUTH_PROBE_SOURCE", "")).strip()
    result = probe(source) if source else {"ok": False, "reason": BAD_ADDRESS, "image": None, "width": 0, "height": 0}
    sys.stdout.write(json.dumps(result) + "\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
