import logging
from typing import List, Optional, Tuple

import cv2
import numpy as np

from config import Config
from config import config as default_config
from model_loader import load_insightface

log = logging.getLogger("otel-kamera.face")


class FaceEngine:
    def __init__(self, settings: Config = default_config, app=None):
        """`app`: hazır bir InsightFace uygulaması (testlerde sahtesi). Yoksa model YEREL klasörden yüklenir (indirme
        yok, dosya eksikse `ModelMissingError`; K-57). insightface yalnız `models.load_insightface` içinde içe aktarılır."""
        self.settings = settings
        self.app = app if app is not None else load_insightface(settings)

    def detect_faces(
        self,
        frame: np.ndarray,
        min_score: Optional[float] = None,
        min_size: Optional[int] = None,
    ) -> list:
        """
        Karedeki yüzleri tespit eder, kalite ve boyut filtresinden geçirir.
        Çok uzaktaki veya bulanık yüzlerin yanlış alarm üretmesini engeller.
        """
        score_thresh = min_score if min_score is not None else self.settings.MIN_FACE_DET_SCORE
        size_thresh = min_size if min_size is not None else self.settings.MIN_FACE_SIZE_PX

        raw_faces = self.app.get(frame)
        valid_faces = []

        for face in raw_faces:
            if face.det_score < score_thresh:
                continue
            bbox = face.bbox
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]
            if w < size_thresh or h < size_thresh:
                continue
            valid_faces.append(face)

        return valid_faces

    def extract_all_embeddings(
        self,
        frame: np.ndarray,
        min_score: float = 0.48,
        min_size: int = 30,
    ) -> List[Tuple[np.ndarray, np.ndarray]]:
        """
        Karedeki tüm geçerli yüzlerin (embedding, bbox) listesini büyükten küçüğe sıralı döner.
        Eğer yüz kadrajın tam kenarına (y=0 vb.) değdiği için bulunamazsa,
        kenar dolgusu (border padding) ekleyerek tekrar dener.
        """
        faces = self.detect_faces(frame, min_score=min_score, min_size=min_size)
        if not faces:
            pad = 64
            padded = cv2.copyMakeBorder(frame, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(20, 20, 20))
            padded_faces = self.detect_faces(padded, min_score=0.38, min_size=24)
            results = []
            h, w = frame.shape[:2]
            for f in sorted(
                padded_faces,
                key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]),
                reverse=True,
            ):
                bx1 = max(0, int(f.bbox[0]) - pad)
                by1 = max(0, int(f.bbox[1]) - pad)
                bx2 = min(w, int(f.bbox[2]) - pad)
                by2 = min(h, int(f.bbox[3]) - pad)
                if bx2 > bx1 and by2 > by1:
                    results.append((f.embedding, np.array([bx1, by1, bx2, by2], dtype=int)))
            return results

        sorted_faces = sorted(
            faces,
            key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
            reverse=True,
        )
        return [(f.embedding, f.bbox.astype(int)) for f in sorted_faces]

    def extract_primary_embedding(self, frame: np.ndarray) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        """
        Misafir kaydı sırasında karedeki en büyük/net yüzün (embedding, bbox) ikilisini döner.
        """
        all_faces = self.extract_all_embeddings(frame)
        if not all_faces:
            return None
        return all_faces[0]

    @staticmethod
    def cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
        """İki 512-D yüz vektörü arasındaki kosinüs benzerliğini hesaplar (-1.0 ile 1.0 arası)."""
        dot = float(np.dot(emb1, emb2))
        norm1 = float(np.linalg.norm(emb1))
        norm2 = float(np.linalg.norm(emb2))
        if norm1 == 0.0 or norm2 == 0.0:
            return 0.0
        return dot / (norm1 * norm2)

    def best_match(
        self,
        face_embedding: np.ndarray,
        active_guests: List[Tuple[str, str, str, np.ndarray]],
    ) -> Optional[Tuple[str, str, str, float]]:
        """Eşiğe bakmadan en benzer misafiri döner (misafir yoksa None). "Emin değil" bandı için de kullanılır."""
        best: Optional[Tuple[str, str, str, float]] = None
        for gid, name, room, guest_emb in active_guests:
            score = self.cosine_similarity(face_embedding, guest_emb)
            if best is None or score > best[3]:
                best = (gid, name, room, score)
        return best

    def match_face(
        self,
        face_embedding: np.ndarray,
        active_guests: List[Tuple[str, str, str, np.ndarray]],
        threshold: Optional[float] = None,
    ) -> Optional[Tuple[str, str, str, float]]:
        """
        Gelen yüz embedding'ini aktif misafirlerin embedding'leri ile kıyaslar.
        Eşleşirse: (guest_id, name, room_number, similarity_score) döner.
        Eşleşmezse: None döner (Kayıtsız / Yabancı kişi).
        """
        min_thresh = threshold if threshold is not None else self.settings.FACE_SIMILARITY_THRESHOLD
        best = self.best_match(face_embedding, active_guests)
        if best is not None and best[3] >= min_thresh:
            return best
        return None
