import os
import sqlite3
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime, timedelta
import numpy as np
from config import config


class GuestDatabase:
    def __init__(self, db_path: str = "hotel_guests.db"):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=20.0)
        # Elektrik kesintisinde veritabanı bozulmasını ve kilitlenmeyi önleyen WAL modu
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS guests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    room_number TEXT NOT NULL,
                    check_in_date TEXT NOT NULL,
                    check_out_date TEXT NOT NULL,
                    embedding BLOB NOT NULL,
                    photo_path TEXT DEFAULT '',
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("PRAGMA table_info(guests)")
            guest_cols = [row[1] for row in cursor.fetchall()]
            if "photo_path" not in guest_cols:
                cursor.execute("ALTER TABLE guests ADD COLUMN photo_path TEXT DEFAULT ''")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS alert_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alert_time TEXT NOT NULL,
                    image_path TEXT,
                    face_crop_path TEXT DEFAULT '',
                    embedding BLOB,
                    details TEXT
                )
            """)
            cursor.execute("PRAGMA table_info(alert_logs)")
            alert_cols = [row[1] for row in cursor.fetchall()]
            if "face_crop_path" not in alert_cols:
                cursor.execute("ALTER TABLE alert_logs ADD COLUMN face_crop_path TEXT DEFAULT ''")
            if "embedding" not in alert_cols:
                cursor.execute("ALTER TABLE alert_logs ADD COLUMN embedding BLOB")

            conn.commit()

    @staticmethod
    def _safe_remove_file(path: Optional[str]):
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

    def add_guest(
        self,
        name: str,
        room_number: str,
        embedding: np.ndarray,
        check_out_date: str,
        photo_path: str = "",
    ) -> int:
        """Yeni KBS kayıtlı misafir ekler. 512-D embedding float32 BLOB olarak saklanır."""
        emb_bytes = embedding.astype(np.float32).tobytes()
        check_in_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO guests (name, room_number, check_in_date, check_out_date, embedding, photo_path, is_active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            """, (name.strip(), room_number.strip(), check_in_date, check_out_date, emb_bytes, photo_path))
            conn.commit()
            return int(cursor.lastrowid)

    def update_guest_photo(self, guest_id: int, photo_path: str):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE guests SET photo_path = ? WHERE id = ?", (photo_path, guest_id))
            conn.commit()

    def get_guest_by_id(self, guest_id: int) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, room_number, check_in_date, check_out_date, photo_path, is_active
                FROM guests WHERE id = ?
            """, (guest_id,))
            row = cursor.fetchone()
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
        """
        Belirtilen ID'ye sahip misafiri ve aynı odada aynı isimle kayıtlı
        diğer yüz açısı (multi-angle) kayıtlarını tek seferde check-out (pasif) yapar.
        Çıkış yapan misafirin diskteki fotoğrafını da temizler (gereksiz yer kaplamasını önler).
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT name, room_number FROM guests WHERE id = ? AND is_active = 1",
                (guest_id,),
            )
            row = cursor.fetchone()
            if not row:
                return False
            name, room = row[0], row[1]

            cursor.execute(
                """
                SELECT photo_path FROM guests
                WHERE is_active = 1
                  AND (id = ? OR (LOWER(TRIM(name)) = LOWER(TRIM(?)) AND TRIM(room_number) = TRIM(?)))
                """,
                (guest_id, name, room),
            )
            photos = [r[0] for r in cursor.fetchall() if r[0]]

            cursor.execute(
                """
                UPDATE guests
                SET is_active = 0
                WHERE is_active = 1
                  AND (id = ? OR (LOWER(TRIM(name)) = LOWER(TRIM(?)) AND TRIM(room_number) = TRIM(?)))
                """,
                (guest_id, name, room),
            )
            updated = cursor.rowcount > 0
            conn.commit()

        for p in photos:
            self._safe_remove_file(p)
        return updated

    def cleanup_expired_guests(self) -> int:
        """Çıkış tarihi (check_out_date) geçmiş misafirleri otomatik pasife çeker ve fotoğraflarını siler."""
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT photo_path FROM guests
                WHERE is_active = 1 AND check_out_date < ?
            """, (now_str,))
            expired_photos = [r[0] for r in cursor.fetchall() if r[0]]

            cursor.execute("""
                UPDATE guests
                SET is_active = 0
                WHERE is_active = 1 AND check_out_date < ?
            """, (now_str,))
            count = cursor.rowcount
            conn.commit()

        for p in expired_photos:
            self._safe_remove_file(p)
        return count

    def get_active_guests(self) -> List[Tuple[int, str, str, np.ndarray]]:
        """
        Aktif misafirleri ve 512-D yüz vektörlerini döner.
        Dönüş: [(guest_id, name, room_number, embedding_array), ...]
        """
        self.cleanup_expired_guests()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, room_number, embedding 
                FROM guests 
                WHERE is_active = 1
            """)
            rows = cursor.fetchall()

            result = []
            for gid, name, room, emb_blob in rows:
                emb = np.frombuffer(emb_blob, dtype=np.float32)
                result.append((gid, name, room, emb))
            return result

    def list_active_guests_info(self) -> List[Dict[str, Any]]:
        """
        Aktif misafirlerin özet bilgilerini döner.
        Aynı misafire ait birden fazla açı (cepheden + yandan yüz kaydı) varsa
        bunları tek kartta birleştirir ve 'angle_count' alanında kaç açı tanımlı olduğunu belirtir.
        """
        self.cleanup_expired_guests()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, room_number, check_in_date, check_out_date, photo_path
                FROM guests
                WHERE is_active = 1
                ORDER BY room_number ASC, id DESC
            """)
            rows = cursor.fetchall()
            grouped: Dict[Tuple[str, str], Dict[str, Any]] = {}
            for r in rows:
                gid, name, room, cin, cout, photo = r[0], r[1], r[2], r[3], r[4], r[5] or ""
                key = (name.strip().lower(), room.strip().lower())
                if key not in grouped:
                    grouped[key] = {
                        "id": gid,
                        "name": name,
                        "room_number": room,
                        "check_in_date": cin,
                        "check_out_date": cout,
                        "photo_path": photo,
                        "angle_count": 1,
                    }
                else:
                    grouped[key]["angle_count"] += 1
                    if not grouped[key]["photo_path"] and photo:
                        grouped[key]["photo_path"] = photo
            return list(grouped.values())

    def log_alert(
        self,
        image_path: str,
        details: str = "Yetkisiz / KBS Dışı Giriş",
        face_crop_path: str = "",
        embedding: Optional[np.ndarray] = None,
    ) -> int:
        """
        Yakalanan tanımsız kişinin tam boy alarm karesini, yakınlaştırılmış yüz fotoğrafını
        ve 512-D embedding vektörünü kaydeder.
        AKILLI TEKİLLEŞTİRME: Aynı tanımsız kişi son DEDUP_WINDOW_HOURS saat içinde zaten
        kaydedilmişse, eski mükerrer fotoğraflarını diskten silip sadece bu en güncel kaydı tutar!
        """
        now_dt = datetime.now()
        alert_time = now_dt.strftime("%Y-%m-%d %H:%M:%S")
        emb_bytes = embedding.astype(np.float32).tobytes() if embedding is not None else None

        files_to_remove: List[str] = []

        with self._get_connection() as conn:
            cursor = conn.cursor()

            if embedding is not None:
                cutoff_str = (now_dt - timedelta(hours=config.DEDUP_WINDOW_HOURS)).strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute(
                    """
                    SELECT id, image_path, face_crop_path, embedding
                    FROM alert_logs
                    WHERE alert_time >= ? AND embedding IS NOT NULL
                    """,
                    (cutoff_str,),
                )
                dup_ids = []
                for old_id, old_img, old_crop, old_emb_blob in cursor.fetchall():
                    old_emb = np.frombuffer(old_emb_blob, dtype=np.float32)
                    if old_emb.shape == embedding.shape:
                        sim = self._cosine_sim(embedding, old_emb)
                        if sim >= config.DEDUP_SIMILARITY_THRESHOLD:
                            dup_ids.append(old_id)
                            if old_img and old_img != image_path:
                                files_to_remove.append(old_img)
                            if old_crop and old_crop != face_crop_path:
                                files_to_remove.append(old_crop)

                for did in dup_ids:
                    cursor.execute("DELETE FROM alert_logs WHERE id = ?", (did,))

            cursor.execute("""
                INSERT INTO alert_logs (alert_time, image_path, face_crop_path, embedding, details)
                VALUES (?, ?, ?, ?, ?)
            """, (alert_time, image_path, face_crop_path, emb_bytes, details))
            new_id = int(cursor.lastrowid)
            conn.commit()

        for fpath in files_to_remove:
            self._safe_remove_file(fpath)

        return new_id

    def run_storage_maintenance(self, retention_days: Optional[int] = None) -> Dict[str, int]:
        """
        30 GÜNLÜK OTOMATİK HAFIZA VE GEREKSİZ FOTOĞRAF TEMİZLİK MOTORU:
        1. Süresi dolmuş misafirleri pasife çeker ve30 günü geçmiş pasif misafir kayıtlarını siler.
        2. 30 günden eski tüm alarm kayıtlarını ve fotoğraflarını siler (otel kamerasıyla senkron).
        3. Aynı kişiye ait mükerrer (tekrar eden) eski alarm fotoğraflarını tekilleştirir.
        4. Maksimum alarm sınırı (MAX_ALERT_COUNT) aşılmışsa en eskileri temizler.
        5. Veritabanında karşılığı olmayan (sahipsiz/orphan) tüm .jpg dosyalarını diskten siler.
        """
        days = retention_days if retention_days is not None else config.ALERT_RETENTION_DAYS
        cutoff_str = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")

        self.cleanup_expired_guests()

        removed_old_alerts = 0
        removed_dup_alerts = 0
        removed_orphan_files = 0
        files_to_delete: List[str] = []

        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 1. 30 günden eski pasif misafir kayıtlarını tamamen temizle
            cursor.execute(
                "SELECT photo_path FROM guests WHERE is_active = 0 AND check_out_date < ?",
                (cutoff_str,),
            )
            for (p,) in cursor.fetchall():
                if p:
                    files_to_delete.append(p)
            cursor.execute(
                "DELETE FROM guests WHERE is_active = 0 AND check_out_date < ?",
                (cutoff_str,),
            )

            # 2. 30 günden eski alarmları bul ve sil
            cursor.execute(
                "SELECT id, image_path, face_crop_path FROM alert_logs WHERE alert_time < ?",
                (cutoff_str,),
            )
            for aid, img_p, crop_p in cursor.fetchall():
                if img_p:
                    files_to_delete.append(img_p)
                if crop_p:
                    files_to_delete.append(crop_p)
                removed_old_alerts += 1
            cursor.execute("DELETE FROM alert_logs WHERE alert_time < ?", (cutoff_str,))

            # 3. Mevcut alarmlar içinde aynı yüze ait mükerrer kayıtları tekilleştir (en yenisini tut)
            cursor.execute(
                "SELECT id, image_path, face_crop_path, embedding FROM alert_logs ORDER BY id DESC"
            )
            all_rows = cursor.fetchall()
            kept_embeddings: List[np.ndarray] = []
            dup_ids: List[int] = []

            for aid, img_p, crop_p, emb_b in all_rows:
                # Dosyası diskte olmayan bozuk kayıtları temizle
                if not img_p or not os.path.exists(img_p):
                    dup_ids.append(aid)
                    if crop_p:
                        files_to_delete.append(crop_p)
                    continue

                if emb_b is not None:
                    emb = np.frombuffer(emb_b, dtype=np.float32)
                    is_dup = False
                    for k_emb in kept_embeddings:
                        if emb.shape == k_emb.shape and self._cosine_sim(emb, k_emb) >= config.DEDUP_SIMILARITY_THRESHOLD:
                            is_dup = True
                            break
                    if is_dup:
                        dup_ids.append(aid)
                        files_to_delete.append(img_p)
                        if crop_p:
                            files_to_delete.append(crop_p)
                        removed_dup_alerts += 1
                    else:
                        kept_embeddings.append(emb)

            for did in dup_ids:
                cursor.execute("DELETE FROM alert_logs WHERE id = ?", (did,))

            # 4. Maksimum alarm kotası kontrolü (MAX_ALERT_COUNT)
            cursor.execute(
                "SELECT id, image_path, face_crop_path FROM alert_logs ORDER BY id DESC LIMIT -1 OFFSET ?",
                (config.MAX_ALERT_COUNT,),
            )
            overflow_rows = cursor.fetchall()
            for aid, img_p, crop_p in overflow_rows:
                if img_p:
                    files_to_delete.append(img_p)
                if crop_p:
                    files_to_delete.append(crop_p)
                cursor.execute("DELETE FROM alert_logs WHERE id = ?", (aid,))
                removed_old_alerts += 1

            # 5. Aktif kullanılan tüm dosya yollarını topla (Orphan kontrolü için)
            valid_files = set()
            cursor.execute("SELECT photo_path FROM guests WHERE is_active = 1")
            for (p,) in cursor.fetchall():
                if p:
                    valid_files.add(os.path.normpath(p))

            cursor.execute("SELECT image_path, face_crop_path FROM alert_logs")
            for img_p, crop_p in cursor.fetchall():
                if img_p:
                    valid_files.add(os.path.normpath(img_p))
                if crop_p:
                    valid_files.add(os.path.normpath(crop_p))
                elif img_p:
                    valid_files.add(os.path.normpath(img_p.replace("alert_", "face_")))

            conn.commit()

        # Silinmesi gereken dosyaları kaldır
        for fpath in files_to_delete:
            self._safe_remove_file(fpath)

        # Klasörlerdeki sahipsiz (veritabanında olmayan) görüntü dosyalarını temizle
        for folder in (config.ALERTS_DIR, config.GUEST_PHOTOS_DIR):
            if not os.path.exists(folder):
                continue
            for fname in os.listdir(folder):
                if not fname.lower().endswith((".jpg", ".jpeg", ".png")):
                    continue
                full_p = os.path.normpath(os.path.join(folder, fname))
                if full_p not in valid_files:
                    self._safe_remove_file(full_p)
                    removed_orphan_files += 1

        return {
            "removed_old_alerts": removed_old_alerts,
            "removed_duplicate_alerts": removed_dup_alerts,
            "removed_orphan_files": removed_orphan_files,
        }

    def get_alert_by_id(self, alert_id: int) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, alert_time, image_path, face_crop_path, embedding, details
                FROM alert_logs
                WHERE id = ?
            """, (alert_id,))
            row = cursor.fetchone()
            if not row:
                return None
            emb = np.frombuffer(row[4], dtype=np.float32) if row[4] is not None else None
            return {
                "id": row[0],
                "alert_time": row[1],
                "image_path": row[2] or "",
                "face_crop_path": row[3] or "",
                "embedding": emb,
                "details": row[5] or "",
            }

    def get_recent_alerts(self, limit: int = 24) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, alert_time, image_path, face_crop_path, embedding, details
                FROM alert_logs
                ORDER BY id DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
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
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT image_path, face_crop_path FROM alert_logs WHERE id = ?", (alert_id,))
            row = cursor.fetchone()
            img_path = row[0] if row else None
            crop_path = row[1] if row else None
            cursor.execute("DELETE FROM alert_logs WHERE id = ?", (alert_id,))
            conn.commit()
            return img_path, crop_path

    def clear_alerts(self) -> List[str]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT image_path, face_crop_path FROM alert_logs")
            paths = []
            for r in cursor.fetchall():
                if r[0]:
                    paths.append(r[0])
                if r[1]:
                    paths.append(r[1])
            cursor.execute("DELETE FROM alert_logs")
            conn.commit()
            return paths
