"""Yerel misafir/alarm veritabanı (P20c'de Bismuth DB'sine taşınır; K-51: o zamana dek bu dosya depoya girmez).

P20a düzeltmeleri: tek yazıcı kilidi + her çağrıda kapanan bağlantı (22), okuma yolunda yazma yok (16),
tarih doğrulaması ve tek zaman kuralı (17, 21), aynı kişi/aynı konaklama kapsamı (18), atomik kayıt ve çift tıklama
koruması (19), pencereli tekilleştirme (7), yeni dosyaya dokunmayan sahipsiz temizliği (8).
"""

import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

import numpy as np

from config import Config
from config import config as default_config
from timeutil import fmt, now_local, parse_local

DOUBLE_CLICK_SECONDS = 5
DOUBLE_CLICK_SIMILARITY = 0.95


def face_sibling(image_path: str) -> str:
    """`.../alert_X.jpg` → `.../face_X.jpg`; yalnız dosya adındaki ön ek değişir (kod bulgusu: yol kısmı bozulmaz)."""
    folder, name = os.path.split(image_path)
    if name.startswith("alert_"):
        name = "face_" + name[len("alert_") :]
    return os.path.join(folder, name)


class GuestDatabase:
    def __init__(
        self,
        db_path: str = "hotel_guests.db",
        settings: Config = default_config,
        clock: Callable[[], datetime] = now_local,
    ):
        self.db_path = db_path
        self.settings = settings
        self.clock = clock
        self._lock = threading.RLock()
        self._init_db()

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        """Tek yazıcı: kilit + işlem. Bağlantı her zaman kapanır (GC'ye bırakılmaz)."""
        with self._lock:
            conn = sqlite3.connect(self.db_path, timeout=20.0)
            try:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                yield conn
                conn.commit()
            except BaseException:
                conn.rollback()
                raise
            finally:
                conn.close()

    def _now(self) -> datetime:
        return self.clock()

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS guests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    room_number TEXT NOT NULL,
                    check_in_date TEXT NOT NULL,
                    check_out_date TEXT NOT NULL,
                    embedding BLOB NOT NULL,
                    photo_path TEXT DEFAULT '',
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT ''
                )
            """)
            guest_cols = [row[1] for row in conn.execute("PRAGMA table_info(guests)").fetchall()]
            if "photo_path" not in guest_cols:
                conn.execute("ALTER TABLE guests ADD COLUMN photo_path TEXT DEFAULT ''")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS alert_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alert_time TEXT NOT NULL,
                    image_path TEXT,
                    face_crop_path TEXT DEFAULT '',
                    embedding BLOB,
                    details TEXT
                )
            """)
            alert_cols = [row[1] for row in conn.execute("PRAGMA table_info(alert_logs)").fetchall()]
            if "face_crop_path" not in alert_cols:
                conn.execute("ALTER TABLE alert_logs ADD COLUMN face_crop_path TEXT DEFAULT ''")
            if "embedding" not in alert_cols:
                conn.execute("ALTER TABLE alert_logs ADD COLUMN embedding BLOB")
            # Eski satırlar "YYYY-MM-DD HH:MM:SS" idi: tek biçime ("T") getirilir (kod bulgusu 21).
            for table, column in (
                ("guests", "check_in_date"),
                ("guests", "check_out_date"),
                ("alert_logs", "alert_time"),
            ):
                conn.execute(f"UPDATE {table} SET {column} = REPLACE({column}, ' ', 'T') WHERE {column} LIKE '% %'")

    @staticmethod
    def _safe_remove_file(path: Optional[str]) -> None:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass

    @staticmethod
    def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
        na = float(np.linalg.norm(a))
        nb = float(np.linalg.norm(b))
        if na == 0.0 or nb == 0.0:
            return 0.0
        return float(np.dot(a, b)) / (na * nb)

    # ------------------------------------------------------------------ misafirler

    def add_guest(
        self,
        name: str,
        room_number: str,
        embedding: np.ndarray,
        check_out_date: str,
        photo_path: str = "",
    ) -> int:
        """Yeni misafir ekler (512-D float32 BLOB). Aynı kişi birkaç saniye içinde yeniden gelirse (çift tıklama)
        yeni satır açılmaz, mevcut kimlik döner (kod bulgusu 19). Fotoğraf yolu aynı işlemle yazılır."""
        emb = embedding.astype(np.float32)
        now = self._now()
        recent_cutoff = fmt(now - timedelta(seconds=DOUBLE_CLICK_SECONDS))
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT id, embedding FROM guests
                WHERE is_active = 1 AND created_at >= ?
                  AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND TRIM(room_number) = TRIM(?)
                """,
                (recent_cutoff, name, room_number),
            ).fetchall()
            for gid, blob in rows:
                old = np.frombuffer(blob, dtype=np.float32)
                if old.shape == emb.shape and self._cosine_sim(emb, old) >= DOUBLE_CLICK_SIMILARITY:
                    return int(gid)
            cursor = conn.execute(
                """
                INSERT INTO guests (name, room_number, check_in_date, check_out_date, embedding, photo_path,
                                    is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (name.strip(), room_number.strip(), fmt(now), check_out_date, emb.tobytes(), photo_path, fmt(now)),
            )
            return int(cursor.lastrowid)

    def update_guest_photo(self, guest_id: int, photo_path: str) -> None:
        with self._conn() as conn:
            conn.execute("UPDATE guests SET photo_path = ? WHERE id = ?", (photo_path, guest_id))

    def get_guest_by_id(self, guest_id: int) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            row = conn.execute(
                """
                SELECT id, name, room_number, check_in_date, check_out_date, photo_path, is_active
                FROM guests WHERE id = ?
                """,
                (guest_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "name": row[1],
            "room_number": row[2],
            "check_in_date": row[3],
            "check_out_date": row[4],
            "photo_path": row[5] or "",
            "is_active": bool(row[6]),
        }

    def deactivate_guest(self, guest_id: int) -> bool:
        """Misafiri ve AYNI KONAKLAMANIN (aynı ad + oda + çıkış tarihi) diğer yüz açılarını pasife alır (kod bulgusu 18).
        Başka bir tarihte aynı ad ve odayla kayıtlı kişi etkilenmez. Fotoğraflar diskten silinir."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT name, room_number, check_out_date FROM guests WHERE id = ? AND is_active = 1",
                (guest_id,),
            ).fetchone()
            if not row:
                return False
            name, room, out = row
            where = (
                "is_active = 1 AND (id = ? OR (LOWER(TRIM(name)) = LOWER(TRIM(?)) AND TRIM(room_number) = TRIM(?) AND check_out_date = ?))"
            )
            params = (guest_id, name, room, out)
            photos = [r[0] for r in conn.execute(f"SELECT photo_path FROM guests WHERE {where}", params) if r[0]]
            updated = conn.execute(f"UPDATE guests SET is_active = 0 WHERE {where}", params).rowcount > 0
        for p in photos:
            self._safe_remove_file(p)
        return updated

    def cleanup_expired_guests(self) -> int:
        """Çıkış anı geçmiş misafirleri pasife çeker, fotoğraflarını siler. Okuma yollarından ÇAĞRILMAZ (kod bulgusu 16)."""
        now_text = fmt(self._now())
        with self._conn() as conn:
            photos = [
                r[0] for r in conn.execute("SELECT photo_path FROM guests WHERE is_active = 1 AND check_out_date < ?", (now_text,)) if r[0]
            ]
            count = conn.execute("UPDATE guests SET is_active = 0 WHERE is_active = 1 AND check_out_date < ?", (now_text,)).rowcount
        for p in photos:
            self._safe_remove_file(p)
        return count

    def get_active_guests(self) -> List[Tuple[int, str, str, np.ndarray]]:
        """[(guest_id, ad, oda, vektör)]; süresi dolanlar yazmadan filtrelenir."""
        now_text = fmt(self._now())
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, name, room_number, embedding FROM guests WHERE is_active = 1 AND check_out_date >= ?",
                (now_text,),
            ).fetchall()
        return [(gid, name, room, np.frombuffer(blob, dtype=np.float32)) for gid, name, room, blob in rows]

    def list_active_guests_info(self) -> List[Dict[str, Any]]:
        now_text = fmt(self._now())
        with self._conn() as conn:
            rows = conn.execute(
                """
                SELECT id, name, room_number, check_in_date, check_out_date, photo_path
                FROM guests WHERE is_active = 1 AND check_out_date >= ?
                ORDER BY room_number ASC, id DESC
                """,
                (now_text,),
            ).fetchall()
        grouped: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
        for gid, name, room, cin, cout, photo in rows:
            key = (name.strip().lower(), room.strip().lower(), cout)
            if key not in grouped:
                grouped[key] = {
                    "id": gid,
                    "name": name,
                    "room_number": room,
                    "check_in_date": cin,
                    "check_out_date": cout,
                    "photo_path": photo or "",
                    "angle_count": 1,
                }
            else:
                grouped[key]["angle_count"] += 1
                if not grouped[key]["photo_path"] and photo:
                    grouped[key]["photo_path"] = photo
        return list(grouped.values())

    # ------------------------------------------------------------------ alarmlar

    def log_alert(
        self,
        image_path: str,
        details: str = "Yetkisiz / KBS Dışı Giriş",
        face_crop_path: str = "",
        embedding: Optional[np.ndarray] = None,
    ) -> int:
        """Alarm kaydı. Aynı yüz son DEDUP_WINDOW_HOURS içinde kayıtlıysa eskisinin dosyaları silinir (pencereli)."""
        now = self._now()
        emb_bytes = embedding.astype(np.float32).tobytes() if embedding is not None else None
        files_to_remove: List[str] = []
        with self._conn() as conn:
            if embedding is not None:
                cutoff = fmt(now - timedelta(hours=self.settings.DEDUP_WINDOW_HOURS))
                dup_ids = []
                for old_id, old_img, old_crop, blob in conn.execute(
                    "SELECT id, image_path, face_crop_path, embedding FROM alert_logs WHERE alert_time >= ? AND embedding IS NOT NULL",
                    (cutoff,),
                ).fetchall():
                    old = np.frombuffer(blob, dtype=np.float32)
                    if old.shape == embedding.shape and (self._cosine_sim(embedding, old) >= self.settings.FACE_SIMILARITY_THRESHOLD):
                        dup_ids.append(old_id)
                        if old_img and old_img != image_path:
                            files_to_remove.append(old_img)
                        if old_crop and old_crop != face_crop_path:
                            files_to_remove.append(old_crop)
                for did in dup_ids:
                    conn.execute("DELETE FROM alert_logs WHERE id = ?", (did,))
            cursor = conn.execute(
                "INSERT INTO alert_logs (alert_time, image_path, face_crop_path, embedding, details) VALUES (?, ?, ?, ?, ?)",
                (fmt(now), image_path, face_crop_path, emb_bytes, details),
            )
            new_id = int(cursor.lastrowid)
        for fpath in files_to_remove:
            self._safe_remove_file(fpath)
        return new_id

    def run_storage_maintenance(self, retention_days: Optional[int] = None) -> Dict[str, int]:
        """Saklama süresi, pencereli tekilleştirme, kota ve sahipsiz dosya temizliği.

        Tek yazıcı kilidi altında çalışır; son ORPHAN_MIN_AGE_SECONDS içinde yazılmış dosyaya dokunmaz (kod bulgusu 8).
        Tekilleştirme yalnız DEDUP_WINDOW_HOURS içinde birbirine yakın alarmları birleştirir (kod bulgusu 7).
        """
        days = retention_days if retention_days is not None else self.settings.ALERT_RETENTION_DAYS
        now = self._now()
        cutoff = fmt(now - timedelta(days=days))
        window = timedelta(hours=self.settings.DEDUP_WINDOW_HOURS)
        self.cleanup_expired_guests()

        removed_old = removed_dup = removed_orphan = 0
        files_to_delete: List[str] = []
        valid_files: set = set()

        with self._conn() as conn:
            for (p,) in conn.execute("SELECT photo_path FROM guests WHERE is_active = 0 AND check_out_date < ?", (cutoff,)).fetchall():
                if p:
                    files_to_delete.append(p)
            conn.execute("DELETE FROM guests WHERE is_active = 0 AND check_out_date < ?", (cutoff,))

            for _, img_p, crop_p in conn.execute(
                "SELECT id, image_path, face_crop_path FROM alert_logs WHERE alert_time < ?", (cutoff,)
            ).fetchall():
                files_to_delete.extend(p for p in (img_p, crop_p) if p)
                removed_old += 1
            conn.execute("DELETE FROM alert_logs WHERE alert_time < ?", (cutoff,))

            kept: List[Tuple[np.ndarray, datetime]] = []
            dup_ids: List[int] = []
            for aid, at_text, img_p, crop_p, emb_b in conn.execute(
                "SELECT id, alert_time, image_path, face_crop_path, embedding FROM alert_logs ORDER BY id DESC"
            ).fetchall():
                if not img_p or not os.path.exists(img_p):
                    dup_ids.append(aid)
                    if crop_p:
                        files_to_delete.append(crop_p)
                    continue
                if emb_b is None:
                    continue
                try:
                    at = parse_local(at_text)
                except ValueError:
                    continue
                emb = np.frombuffer(emb_b, dtype=np.float32)
                is_dup = any(
                    emb.shape == k.shape
                    and abs(at - k_at) <= window
                    and self._cosine_sim(emb, k) >= self.settings.FACE_SIMILARITY_THRESHOLD
                    for k, k_at in kept
                )
                if is_dup:
                    dup_ids.append(aid)
                    files_to_delete.append(img_p)
                    if crop_p:
                        files_to_delete.append(crop_p)
                    removed_dup += 1
                else:
                    kept.append((emb, at))
            for did in dup_ids:
                conn.execute("DELETE FROM alert_logs WHERE id = ?", (did,))

            for aid, img_p, crop_p in conn.execute(
                "SELECT id, image_path, face_crop_path FROM alert_logs ORDER BY id DESC LIMIT -1 OFFSET ?",
                (self.settings.MAX_ALERT_COUNT,),
            ).fetchall():
                files_to_delete.extend(p for p in (img_p, crop_p) if p)
                conn.execute("DELETE FROM alert_logs WHERE id = ?", (aid,))
                removed_old += 1

            for (p,) in conn.execute("SELECT photo_path FROM guests WHERE is_active = 1").fetchall():
                if p:
                    valid_files.add(os.path.normpath(p))
            for img_p, crop_p in conn.execute("SELECT image_path, face_crop_path FROM alert_logs").fetchall():
                if img_p:
                    valid_files.add(os.path.normpath(img_p))
                    if not crop_p:
                        valid_files.add(os.path.normpath(face_sibling(img_p)))
                if crop_p:
                    valid_files.add(os.path.normpath(crop_p))

            for fpath in files_to_delete:
                self._safe_remove_file(fpath)

            # Sahipsiz dosyalar: yazıcı kilidi hâlâ elimizde; yeni dosyalar (yaş < sınır) korunur.
            young_limit = time.time() - self.settings.ORPHAN_MIN_AGE_SECONDS
            for folder in (self.settings.ALERTS_DIR, self.settings.GUEST_PHOTOS_DIR):
                if not os.path.isdir(folder):
                    continue
                for fname in os.listdir(folder):
                    if not fname.lower().endswith((".jpg", ".jpeg", ".png")):
                        continue
                    full = os.path.normpath(os.path.join(folder, fname))
                    if full in valid_files:
                        continue
                    try:
                        if os.path.getmtime(full) > young_limit:
                            continue
                    except OSError:
                        continue
                    self._safe_remove_file(full)
                    removed_orphan += 1

        return {
            "removed_old_alerts": removed_old,
            "removed_duplicate_alerts": removed_dup,
            "removed_orphan_files": removed_orphan,
        }

    def get_alert_by_id(self, alert_id: int) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id, alert_time, image_path, face_crop_path, embedding, details FROM alert_logs WHERE id = ?",
                (alert_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "alert_time": row[1],
            "image_path": row[2] or "",
            "face_crop_path": row[3] or "",
            "embedding": np.frombuffer(row[4], dtype=np.float32) if row[4] is not None else None,
            "details": row[5] or "",
        }

    def get_recent_alerts(self, limit: int = 24) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, alert_time, image_path, face_crop_path, embedding, details FROM alert_logs ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [
            {
                "id": r[0],
                "alert_time": r[1],
                "image_path": r[2] or "",
                "face_crop_path": r[3] or "",
                "has_embedding": r[4] is not None,
                "details": r[5] or "",
            }
            for r in rows
        ]

    def delete_alert(self, alert_id: int) -> Tuple[Optional[str], Optional[str]]:
        with self._conn() as conn:
            row = conn.execute("SELECT image_path, face_crop_path FROM alert_logs WHERE id = ?", (alert_id,)).fetchone()
            conn.execute("DELETE FROM alert_logs WHERE id = ?", (alert_id,))
        return (row[0], row[1]) if row else (None, None)

    def clear_alerts(self) -> List[str]:
        with self._conn() as conn:
            paths: List[str] = []
            for img_p, crop_p in conn.execute("SELECT image_path, face_crop_path FROM alert_logs").fetchall():
                paths.extend(p for p in (img_p, crop_p) if p)
            conn.execute("DELETE FROM alert_logs")
        return paths
