// ========================================
// 🌱 농사 가이드 - 재배 일지 사진 API
// ========================================

// ========================================
// 1. 모듈 불러오기
// ========================================

const express = require("express");

const multer = require("multer");

const createDiaryPhotoRepository = require("../repositories/diary-photo.repository");

// ========================================
// 2. 사진 라우터 생성
// ========================================

function createDiaryPhotoRouter(db) {
  const router = express.Router();

  // ========================================
  // 3. Repository 연결
  // ========================================

  const photoRepository = createDiaryPhotoRepository(db);

  // ========================================
  // 4. 사진 업로드 설정
  // ========================================

  const photoUpload = multer({
    storage: multer.memoryStorage(),

    limits: {
      fileSize: 3 * 1024 * 1024,
      files: 10,
    },
  });

  // ========================================
  // 5. ID 검증
  // ========================================

  function isValidId(id) {
    return Number.isSafeInteger(id) && id > 0;
  }

  // ========================================
  // 6. 이미지 파일 형식 검증
  // ========================================

  function isValidImage(file) {
    if (!file || !file.buffer) {
      return false;
    }

    const mimeType = file.mimetype;

    const imageData = file.buffer;

    // ========================================
    // JPEG 확인
    // ========================================

    const isJpeg =
      mimeType === "image/jpeg" &&
      imageData.length >= 3 &&
      imageData[0] === 0xff &&
      imageData[1] === 0xd8 &&
      imageData[2] === 0xff;

    // ========================================
    // PNG 확인
    // ========================================

    const isPng =
      mimeType === "image/png" &&
      imageData.length >= 8 &&
      imageData.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));

    // ========================================
    // WebP 확인
    // ========================================

    const isWebp =
      mimeType === "image/webp" &&
      imageData.length >= 12 &&
      imageData.toString("ascii", 0, 4) === "RIFF" &&
      imageData.toString("ascii", 8, 12) === "WEBP";

    return isJpeg || isPng || isWebp;
  }

  // ========================================
  // 7. 이미지 응답 공통 함수
  // ========================================

  function sendImage(res, photo) {
    res.set("Cache-Control", "no-store");

    res.set("X-Content-Type-Options", "nosniff");

    res.type(photo.mime_type);

    return res.send(Buffer.from(photo.image_data));
  }

  // ========================================
  // 8. 사진 여러 장 업로드
  // POST /:farmId/diaries/:diaryId/photos
  // ========================================

  router.post("/:farmId/diaries/:diaryId/photos", (req, res) => {
    photoUpload.array("photos", 10)(req, res, (uploadError) => {
      if (uploadError) {
        return res.status(400).json({
          success: false,
          message:
            "사진 업로드에 실패했습니다. " +
            "사진은 최대 10장, 한 장당 3MB까지 가능합니다.",
        });
      }

      try {
        // ========================================
        // 농장 및 일지 ID
        // ========================================

        const farmId = Number(req.params.farmId);

        const diaryId = Number(req.params.diaryId);

        if (!isValidId(farmId) || !isValidId(diaryId)) {
          return res.status(400).json({
            success: false,
            message: "올바른 농장 또는 재배 일지 ID가 아닙니다.",
          });
        }

        // ========================================
        // 업로드 파일 확인
        // ========================================

        const files = req.files || [];

        if (files.length === 0) {
          return res.status(400).json({
            success: false,
            message: "등록할 사진을 선택해주세요.",
          });
        }

        // ========================================
        // 재배 일지 존재 여부
        // ========================================

        if (!photoRepository.diaryExists(diaryId, farmId)) {
          return res.status(404).json({
            success: false,
            message: "해당 농장의 재배 일지를 찾을 수 없습니다.",
          });
        }

        // ========================================
        // 이미지 형식 검증
        // ========================================

        for (const file of files) {
          if (!isValidImage(file)) {
            return res.status(400).json({
              success: false,
              message: "JPG, PNG, WebP 사진만 등록할 수 있습니다.",
            });
          }
        }

        // ========================================
        // 사진 여러 장 저장
        // ========================================

        const savedPhotoIds = photoRepository.saveMultiple(diaryId, files);

        console.log(
          "📸 사진 여러 장 저장 완료:",
          diaryId,
          savedPhotoIds.length,
        );

        // ========================================
        // 저장 결과
        // ========================================

        return res.status(201).json({
          success: true,

          message: `${savedPhotoIds.length}장의 사진이 저장되었습니다.`,

          diaryId,

          uploadedCount: savedPhotoIds.length,

          photoIds: savedPhotoIds,
        });
      } catch (error) {
        console.error("사진 여러 장 저장 오류:", error);

        if (error.code === "PHOTO_LIMIT_EXCEEDED") {
          return res.status(400).json({
            success: false,
            message: error.message,
          });
        }

        return res.status(500).json({
          success: false,
          message: "사진을 저장하지 못했습니다.",
        });
      }
    });
  });

  // ========================================
  // 9. 기존 단일 사진 업로드 API
  // 호환성 유지
  // ========================================

  router.post("/:farmId/diaries/:diaryId/photo", (req, res) => {
    photoUpload.single("photo")(req, res, (uploadError) => {
      if (uploadError) {
        return res.status(400).json({
          success: false,
          message:
            "사진 업로드에 실패했습니다. 파일 크기와 형식을 확인해주세요.",
        });
      }

      try {
        const farmId = Number(req.params.farmId);

        const diaryId = Number(req.params.diaryId);

        if (!isValidId(farmId) || !isValidId(diaryId)) {
          return res.status(400).json({
            success: false,
            message: "올바른 농장 또는 일지 ID가 아닙니다.",
          });
        }

        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: "사진을 선택해주세요.",
          });
        }

        if (!isValidImage(req.file)) {
          return res.status(400).json({
            success: false,
            message: "JPG, PNG, WebP 사진만 등록할 수 있습니다.",
          });
        }

        if (!photoRepository.diaryExists(diaryId, farmId)) {
          return res.status(404).json({
            success: false,
            message: "해당 농장의 재배 일지를 찾을 수 없습니다.",
          });
        }

        photoRepository.saveSingle(diaryId, req.file);

        return res.status(201).json({
          success: true,
          message: "사진이 저장되었습니다.",
        });
      } catch (error) {
        console.error("단일 사진 저장 오류:", error);

        return res.status(500).json({
          success: false,
          message: "사진을 저장하지 못했습니다.",
        });
      }
    });
  });

  // ========================================
  // 10. 사진 여러 장 목록 조회
  // ========================================

  router.get("/:farmId/diaries/:diaryId/photos", (req, res) => {
    try {
      const farmId = Number(req.params.farmId);

      const diaryId = Number(req.params.diaryId);

      if (!isValidId(farmId) || !isValidId(diaryId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 또는 재배 일지 ID가 아닙니다.",
        });
      }

      if (!photoRepository.diaryExists(diaryId, farmId)) {
        return res.status(404).json({
          success: false,
          message: "해당 농장의 재배 일지를 찾을 수 없습니다.",
        });
      }

      const photos = photoRepository.findAll(diaryId);

      return res.json({
        success: true,
        diaryId,
        count: photos.length,
        photos,
      });
    } catch (error) {
      console.error("사진 목록 조회 오류:", error);

      return res.status(500).json({
        success: false,
        message: "사진 목록을 불러오지 못했습니다.",
      });
    }
  });

  // ========================================
  // 11. 사진 개별 조회
  // ========================================

  router.get("/:farmId/diaries/:diaryId/photos/:photoId", (req, res) => {
    try {
      const farmId = Number(req.params.farmId);

      const diaryId = Number(req.params.diaryId);

      const photoId = Number(req.params.photoId);

      if (!isValidId(farmId) || !isValidId(diaryId) || !isValidId(photoId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장, 재배 일지 또는 사진 ID가 아닙니다.",
        });
      }

      const photo = photoRepository.findById(photoId, diaryId, farmId);

      if (!photo) {
        return res.status(404).json({
          success: false,
          message: "해당 사진을 찾을 수 없습니다.",
        });
      }

      return sendImage(res, photo);
    } catch (error) {
      console.error("사진 개별 조회 오류:", error);

      return res.status(500).json({
        success: false,
        message: "사진을 불러오지 못했습니다.",
      });
    }
  });

  // ========================================
  // 12. 기존 단일 사진 조회
  // ========================================

  router.get("/:farmId/diaries/:diaryId/photo", (req, res) => {
    try {
      const farmId = Number(req.params.farmId);

      const diaryId = Number(req.params.diaryId);

      if (!isValidId(farmId) || !isValidId(diaryId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 또는 일지 ID가 아닙니다.",
        });
      }

      const photo = photoRepository.findLatest(diaryId, farmId);

      if (!photo) {
        return res.status(404).json({
          success: false,
          message: "등록된 사진이 없습니다.",
        });
      }

      return sendImage(res, photo);
    } catch (error) {
      console.error("사진 조회 오류:", error);

      return res.status(500).json({
        success: false,
        message: "사진을 불러오지 못했습니다.",
      });
    }
  });

  // ========================================
  // 13. 사진 개별 삭제
  // ========================================

  router.delete("/:farmId/diaries/:diaryId/photos/:photoId", (req, res) => {
    try {
      const farmId = Number(req.params.farmId);

      const diaryId = Number(req.params.diaryId);

      const photoId = Number(req.params.photoId);

      if (!isValidId(farmId) || !isValidId(diaryId) || !isValidId(photoId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장, 재배 일지 또는 사진 ID가 아닙니다.",
        });
      }

      const photo = photoRepository.findById(photoId, diaryId, farmId);

      if (!photo) {
        return res.status(404).json({
          success: false,
          message: "삭제할 사진을 찾을 수 없습니다.",
        });
      }

      const deleted = photoRepository.remove(photoId, diaryId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "삭제할 사진이 없습니다.",
        });
      }

      console.log("🗑 사진 개별 삭제 완료:", photoId);

      return res.json({
        success: true,
        message: "사진이 삭제되었습니다.",
        deletedPhotoId: photoId,
      });
    } catch (error) {
      console.error("사진 개별 삭제 오류:", error);

      return res.status(500).json({
        success: false,
        message: "사진을 삭제하지 못했습니다.",
      });
    }
  });

  // ========================================
  // 14. 기존 사진 전체 삭제 API
  // ========================================

  router.delete("/:farmId/diaries/:diaryId/photo", (req, res) => {
    try {
      const farmId = Number(req.params.farmId);

      const diaryId = Number(req.params.diaryId);

      if (!isValidId(farmId) || !isValidId(diaryId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 또는 일지 ID가 아닙니다.",
        });
      }

      if (!photoRepository.diaryExists(diaryId, farmId)) {
        return res.status(404).json({
          success: false,
          message: "해당 농장의 재배 일지를 찾을 수 없습니다.",
        });
      }

      const deleted = photoRepository.removeAll(diaryId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "삭제할 사진이 없습니다.",
        });
      }

      console.log("🗑 사진 전체 삭제 완료:", diaryId);

      return res.json({
        success: true,
        message: "사진이 삭제되었습니다.",
      });
    } catch (error) {
      console.error("사진 전체 삭제 오류:", error);

      return res.status(500).json({
        success: false,
        message: "사진을 삭제하지 못했습니다.",
      });
    }
  });

  // ========================================
  // 15. 라우터 반환
  // ========================================

  return router;
}

// ========================================
// 16. 모듈 내보내기
// ========================================

module.exports = createDiaryPhotoRouter;
