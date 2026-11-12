import time
import numpy as np
import supervision as sv
from typing import Dict, List, Optional, Tuple
from config import config


class SecurityTracker:
    def __init__(self, polygon: Optional[np.ndarray] = None):
        """
        Kişi takibi, bölge (PolygonZone) filtreleme, kimlik kilitleme (Identity Locking),
        yüz imzası tabanlı spam koruma (Embedding Cooldown) ve yanlış alarm önleme sınıfı.
        """
        self.polygon = polygon if polygon is not None else self._parse_polygon(config.ZONE_POLYGON_STR)
        self.zone: Optional[sv.PolygonZone] = None

        if self.polygon is not None:
            self.zone = sv.PolygonZone(polygon=self.polygon)

        # Yedek hafif merkez-noktası takipçisi (1080p çözünürlüğe uyumlu)
        self._next_id: int = 1
        self._prev_centroids: Dict[int, Tuple[float, float, float]] = {}

        # Yakın çekim yüzler (YOLO kutusu dışında kalanlar) için ayrı takipçi
        self._next_face_id: int = 1000
        self._prev_face_centroids: Dict[int, Tuple[float, float, float]] = {}

        # {tracker_id: son_alarm_zamani}
        self.alert_history: Dict[int, float] = {}
        # [(embedding_vec, alarm_zamani)] -> Takip ID değişse bile aynı yüze 60 sn içinde tekrar alarm üretmez
        self.recent_alert_embeddings: List[Tuple[np.ndarray, float]] = []

        # {tracker_id: (guest_id, name, room, score)} -> Doğrulanmış misafir hafızası
        self.verified_tracks: Dict[int, Tuple[int, str, str, float]] = {}
        # {tracker_id: ust_uste_tanimsiz_sayisi} -> Anlık açı değişiminde yanlış alarmı önler
        self.unknown_counts: Dict[int, int] = {}

    @staticmethod
    def _parse_polygon(poly_str: str) -> Optional[np.ndarray]:
        if not poly_str or not poly_str.strip():
            return None
        try:
            points = []
            for pair in poly_str.split(";"):
                x_s, y_s = pair.strip().split(",")
                points.append([int(x_s), int(y_s)])
            if len(points) >= 3:
                return np.array(points, dtype=np.int32)
        except Exception as e:
            print(f"[Tracker] Poligon ayrıştırma hatası ({poly_str}): {e}")
        return None

    def update_tracks(self, detections: sv.Detections) -> sv.Detections:
        """
        Eğer YOLO ByteTrack üzerinden tracker_id geldiyse doğrudan kullanır;
        gelmediyse merkez noktası yakınlığına (Centroid Tracking) göre kararlı ID atar.
        """
        if len(detections) == 0:
            return detections

        if detections.tracker_id is not None:
            return detections

        now = time.time()
        # Eski izleri temizle (> 6 sn görünmeyenler)
        self._prev_centroids = {
            tid: (cx, cy, ts) for tid, (cx, cy, ts) in self._prev_centroids.items() if now - ts < 6.0
        }

        assigned_ids = []
        for xyxy in detections.xyxy:
            cx = float((xyxy[0] + xyxy[2]) / 2.0)
            cy = float((xyxy[1] + xyxy[3]) / 2.0)

            best_id = None
            best_dist = 380.0 ** 2  # 1080p ekranda yürüyüş adımlarına uyumlu yarıçap

            for tid, (px, py, _) in self._prev_centroids.items():
                dist = (cx - px) ** 2 + (cy - py) ** 2
                if dist < best_dist and tid not in assigned_ids:
                    best_dist = dist
                    best_id = tid

            if best_id is None:
                best_id = self._next_id
                self._next_id += 1

            self._prev_centroids[best_id] = (cx, cy, now)
            assigned_ids.append(best_id)

        detections.tracker_id = np.array(assigned_ids, dtype=int)
        return detections

    def filter_by_zone(self, detections: sv.Detections) -> sv.Detections:
        if self.zone is None or len(detections) == 0:
            return detections
        is_inside = self.zone.trigger(detections=detections)
        return detections[is_inside]

    def assign_face_to_tracker_id(
        self, face_bbox: np.ndarray, person_detections: sv.Detections
    ) -> int:
        """
        Tespit edilen yüzün hangi insan kutusu (person bbox) içinde kaldığını bulur.
        - İnsan başı vücut kutusunun üst/orta kısmında yer alır (üstten %30 taşma toleransı tanır).
        - Vücut kutusunun en alt kısmındaki (masa/ekran seviyesindeki) küçük sahte yüzleri reddeder.
        - Eğer yakın çekimde YOLO kutusu yoksa, yüze kendi kararlı takip ID'sini (1000+) atar.
        """
        fx1, fy1, fx2, fy2 = face_bbox
        fcx = float((fx1 + fx2) / 2.0)
        fcy = float((fy1 + fy2) / 2.0)
        fw = float(fx2 - fx1)
        fh = float(fy2 - fy1)

        best_tid = None
        min_dist = float("inf")

        if len(person_detections) > 0 and person_detections.tracker_id is not None:
            for xyxy, tid in zip(person_detections.xyxy, person_detections.tracker_id):
                px1, py1, px2, py2 = xyxy
                pw = float(px2 - px1)
                ph = float(py2 - py1)

                # Yatayda %15, üstten %30 tolerans; alttan ise masa/monitör yüzlerini elemek için %75 sınırı
                x_ok = (px1 - 0.15 * pw) <= fcx <= (px2 + 0.15 * pw)
                y_ok = (py1 - 0.30 * ph) <= fcy <= (py1 + 0.75 * ph)

                # Eğer yüz kutusu çok büyükse (kameraya çok yakın çekim), dikey sınırı esnet
                if fh > 160 or fw > 160:
                    y_ok = (py1 - 0.35 * ph) <= fcy <= (py2 + 0.10 * ph)

                if x_ok and y_ok:
                    pcx = float((px1 + px2) / 2.0)
                    head_anchor_y = float(py1 + 0.22 * ph)
                    dist = (fcx - pcx) ** 2 + (fcy - head_anchor_y) ** 2
                    if dist < min_dist:
                        min_dist = dist
                        best_tid = int(tid)

        if best_tid is not None:
            return best_tid

        # Eğer yüz herhangi bir insan kutusunun üst kısmına düşmediyse:
        # Çok küçük bir arka plan/monitör yüzüyse (< 95px) ve insan kutusuyla eşleşmediyse -1 döner (yoksayılır)
        if fw < 95 and fh < 95 and len(person_detections) > 0:
            return -1

        # Yakın çekim yüz için merkez noktası takibi (1000+ ID)
        now = time.time()
        self._prev_face_centroids = {
            fid: (cx, cy, ts) for fid, (cx, cy, ts) in self._prev_face_centroids.items() if now - ts < 6.0
        }
        best_fid = None
        best_fdist = 280.0 ** 2
        for fid, (px, py, _) in self._prev_face_centroids.items():
            d = (fcx - px) ** 2 + (fcy - py) ** 2
            if d < best_fdist:
                best_fdist = d
                best_fid = fid

        if best_fid is None:
            best_fid = self._next_face_id
            self._next_face_id += 1

        self._prev_face_centroids[best_fid] = (fcx, fcy, now)
        return best_fid

    def register_verified(self, tracker_id: int, match_info: Tuple[int, str, str, float]):
        """Kişi KBS misafiri olarak doğrulandığında takip süresince hafızaya alır."""
        if tracker_id < 0:
            return
        self.verified_tracks[tracker_id] = match_info
        self.unknown_counts[tracker_id] = 0

    def get_verified(self, tracker_id: int) -> Optional[Tuple[int, str, str, float]]:
        if tracker_id < 0:
            return None
        return self.verified_tracks.get(tracker_id)

    @staticmethod
    def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
        na = float(np.linalg.norm(a))
        nb = float(np.linalg.norm(b))
        if na == 0.0 or nb == 0.0:
            return 0.0
        return float(np.dot(a, b)) / (na * nb)

    def record_unknown_and_check_alarm(
        self, tracker_id: int, embedding: Optional[np.ndarray] = None
    ) -> bool:
        """
        Tanımsız yüz görüldüğünde sayacı artırır.
        1. Kişi daha önce doğrulanmış bir misafirse False döner.
        2. CONFIRMATION_FRAMES kadar üst üste tanımsız çıkmadıysa False döner.
        3. Hem tracker_id bazında hem de 512-D yüz embedding benzerliği bazında
           ALARM_COOLDOWN_SECONDS (60 sn) içinde bildirim atılmışsa False döner (çift alarmı önler).
        """
        if tracker_id < 0 or tracker_id in self.verified_tracks:
            return False

        count = self.unknown_counts.get(tracker_id, 0) + 1
        self.unknown_counts[tracker_id] = count

        if count < config.CONFIRMATION_FRAMES:
            return False

        now = time.time()
        # Eski embedding geçmişini temizle
        self.recent_alert_embeddings = [
            (emb, ts)
            for emb, ts in self.recent_alert_embeddings
            if now - ts < config.ALARM_COOLDOWN_SECONDS
        ]

        # 1. Tracker ID bazlı cooldown kontrolü
        last_time = self.alert_history.get(tracker_id, 0.0)
        if now - last_time < config.ALARM_COOLDOWN_SECONDS:
            return False

        # 2. Yüz imzası (Embedding) bazlı cooldown kontrolü (Takip ID değişse bile aynı kişiye tekrar alarm atma)
        if embedding is not None:
            for prev_emb, prev_ts in self.recent_alert_embeddings:
                if self._cosine_sim(embedding, prev_emb) >= 0.40:
                    # Aynı yüz için zaten yakın zamanda alarm gönderildi, bu tracker_id'yi de sustur
                    self.alert_history[tracker_id] = prev_ts
                    return False

        self.alert_history[tracker_id] = now
        if embedding is not None:
            self.recent_alert_embeddings.append((embedding.copy(), now))
        return True

    def clear_memory(self):
        """Misafir listesi güncellendiğinde takip hafızasını sıfırlar."""
        self.verified_tracks.clear()
        self.unknown_counts.clear()
        self.alert_history.clear()
        self.recent_alert_embeddings.clear()
