import cv2
import numpy as np
from typing import List, Tuple, Optional
from insightface.app import FaceAnalysis
from config import config

class FaceEngine:
    def __init__(self, model_name: Optional[str] = None):
        model = model_name or config.INSIGHTFACE_MODEL_NAME
        print(f"[FaceEngine] InsightFace '{model}' CPU sağlayıcısıyla yükleniyor...")

        self.app = FaceAnalysis(name=model, providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        print("[FaceEngine] Model hazır.")

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
        score_thresh = min_score if min_score is not None else config.MIN_FACE_DET_SCORE
        size_thresh = min_size if min_size is not None else config.MIN_FACE_SIZE_PX

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
            padded = cv2.copyMakeBorder(
                frame, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(20, 20, 20)
            )
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

    def match_face(
        self,
        face_embedding: np.ndarray,
        active_guests: List[Tuple[int, str, str, np.ndarray]],
        threshold: Optional[float] = None,
    ) -> Optional[Tuple[int, str, str, float]]:
        """
        Gelen yüz embedding'ini aktif misafirlerin embedding'leri ile kıyaslar.
        Eşleşirse: (guest_id, name, room_number, similarity_score) döner.
        Eşleşmezse: None döner (Kayıtsız / Yabancı kişi).
        """
        min_thresh = threshold if threshold is not None else config.FACE_SIMILARITY_THRESHOLD
        best_match = None
        best_score = -1.0

        for gid, name, room, guest_emb in active_guests:
            score = self.cosine_similarity(face_embedding, guest_emb)
            if score > best_score:
                best_score = score
                best_match = (gid, name, room, score)

        if best_match and best_score >= min_thresh:
            return best_match
        return None
