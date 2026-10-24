// ========================================
// 🌱 농사 가이드
// 📸 재배 일지 사진 API
// ========================================

// ========================================
// 1. 모듈 불러오기
// ========================================

const express = require("express");

const multer = require("multer");

const createDiaryPhotoRepository = require("../repositories/diary-photo.repository");

const {
  savePhoto,
  getPhoto,
  deletePhotoFile,
} = require("../services/storage/storage.service");

// ========================================
// 📸 사진 중복 검사 서비스
// ========================================

const {
  filterDuplicatePhotos,
} = require("../services/diary-photo-duplicate.service");

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

  const MAX_PHOTOS = 10;

  const photoUpload = multer({
    storage: multer.memoryStorage(),

    limits: {
      fileSize: 3 * 1024 * 1024,

      files: MAX_PHOTOS,
    },
  });

  // ========================================
  // 5. ID 검증
  // ========================================

  function isValidId(id) {
    return Number.isSafeInteger(id) && id > 0;
  }

  // ========================================
  // 6. 이미지 파일 검증
  // ========================================

  function isValidImage(file) {
    if (!file || !file.buffer) {
      return false;
    }

    const mimeType = file.mimetype;

    const imageData = file.buffer;

    // ========================================
    // JPEG
    // ========================================

    const isJpeg =
      mimeType === "image/jpeg" &&
      imageData.length >= 3 &&
      imageData[0] === 0xff &&
      imageData[1] === 0xd8 &&
      imageData[2] === 0xff;

    // ========================================
    // PNG
    // ========================================

    const isPng =
      mimeType === "image/png" &&
      imageData.length >= 8 &&
      imageData.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));

    // ========================================
    // WebP
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
  // BLOB 및 파일 저장 방식 모두 지원
  // ========================================

  async function sendImage(res, photo) {
    let imageBuffer;

    // ========================================
    // 기존 BLOB 사진
    // ========================================

    if (photo.image_data !== null && photo.image_data !== undefined) {
      imageBuffer = Buffer.from(photo.image_data);
    } else {
      // ========================================
      // 신규 파일 저장 사진
      // ========================================

      if (!photo.storage_key) {
        throw new Error("사진 저장 위치 정보가 없습니다.");
      }

      imageBuffer = await getPhoto(
        photo.storage_key,

        photo.storage_provider || "local",
      );
    }

    // ========================================
    // 응답 헤더
    // ========================================

    res.set("Cache-Control", "no-store");

    res.set("X-Content-Type-Options", "nosniff");

    res.type(photo.mime_type);

    // ========================================
    // 이미지 반환
    // ========================================

    return res.send(imageBuffer);
  }

  // ========================================
  // 8. 사진 업로드 공통 처리
  // ========================================

  function createUploadHandler(isSingle = false) {
    const uploadMiddleware = isSingle
      ? photoUpload.single("photo")
      : photoUpload.array("photos", MAX_PHOTOS);

    return (req, res) => {
      uploadMiddleware(req, res, async (uploadError) => {
        // ========================================
        // 업로드 오류
        // ========================================

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

          const files = isSingle
            ? req.file
              ? [req.file]
              : []
            : req.files || [];

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
          // 📸 공통 서비스에서 사진 중복 검사
          // ========================================

          const { uniqueFiles, duplicateCount } = await filterDuplicatePhotos({
            farmId,
            diaryId,
            files,
            photoRepository,
            getPhoto,
          });

          console.log("📸 사진 중복 검사:", {
            전체선택: files.length,
            신규사진: uniqueFiles.length,
            중복사진: duplicateCount,
          });

          // ========================================
          // 현재 사진 개수 확인
          // ========================================

          const existingCount = photoRepository.count(diaryId);

          // ========================================
          // 최대 10장 제한
          // ========================================

          if (existingCount + uniqueFiles.length > MAX_PHOTOS) {
            return res.status(400).json({
              success: false,

              message:
                `현재 ${existingCount}장의 사진이 등록되어 있습니다. ` +
                `재배 일지 하나에는 최대 ${MAX_PHOTOS}장까지 등록할 수 있습니다.`,
            });
          }

          // ========================================
          // 9. 사진 파일 저장
          // ========================================

          // ========================================
          // 📸 중복되지 않은 사진만 저장
          // ========================================

          const storedPhotos = [];

          let savedPhotoIds = [];

          try {
            // ========================================
            // 신규 사진만 파일 저장
            // ========================================

            for (const file of uniqueFiles) {
              const storedPhoto = await savePhoto(file, "diary");

              storedPhotos.push(storedPhoto);
            }

            // ========================================
            // 신규 사진이 있을 때만 DB 등록
            // ========================================

            if (storedPhotos.length > 0) {
              savedPhotoIds = photoRepository.saveStoredPhotos(
                diaryId,
                storedPhotos,
              );
            }

            console.log("📸 사진 저장 결과:", {
              저장완료: savedPhotoIds.length,
              중복제외: duplicateCount,
            });
          } catch (error) {
            // ========================================
            // 10. 저장 실패 복구
            //
            // 이번 요청에서 새로 저장한
            // 파일만 정리한다.
            // ========================================

            const cleanupResults = await Promise.allSettled(
              storedPhotos.map((photo) =>
                deletePhotoFile(
                  photo.storageKey,

                  photo.storageProvider,
                ),
              ),
            );

            // ========================================
            // 파일 정리 실패 로그
            // ========================================

            for (const result of cleanupResults) {
              if (result.status === "rejected") {
                console.error("사진 업로드 실패 복구 오류:", result.reason);
              }
            }

            console.error("사진 저장 오류:", error);

            // ========================================
            // 최대 사진 개수 초과
            // ========================================

            if (error.code === "PHOTO_LIMIT_EXCEEDED") {
              return res.status(400).json({
                success: false,

                message: error.message,
              });
            }

            // ========================================
            // 삭제되었거나 존재하지 않는 재배 일지
            // ========================================

            if (error.code === "DIARY_NOT_FOUND") {
              return res.status(404).json({
                success: false,

                message: "재배 일지가 존재하지 않거나 삭제되었습니다.",
              });
            }

            // ========================================
            // 일반 저장 오류
            // ========================================

            return res.status(500).json({
              success: false,

              message: "사진을 저장하지 못했습니다.",
            });
          }

          // ========================================
          // 📸 사진 업로드 결과
          // ========================================

          const uploadedCount = savedPhotoIds.length;

          const statusCode = uploadedCount > 0 ? 201 : 200;

          // ========================================
          // 기존 단일 사진 API
          // ========================================

          if (isSingle) {
            return res.status(statusCode).json({
              success: true,

              message:
                uploadedCount > 0
                  ? "사진이 저장되었습니다."
                  : "이미 등록된 사진입니다.",

              uploadedCount,

              duplicateCount,
            });
          }

          // ========================================
          // 여러 장 사진 업로드 API
          // ========================================

          return res.status(statusCode).json({
            success: true,

            message:
              `${uploadedCount}장의 사진이 저장되었습니다. ` +
              `${duplicateCount}장의 중복 사진은 제외했습니다.`,

            diaryId,

            uploadedCount,

            duplicateCount,

            photoIds: savedPhotoIds,
          });
        } catch (error) {
          console.error("사진 업로드 처리 오류:", error);

          return res.status(500).json({
            success: false,

            message: "사진 업로드 처리 중 오류가 발생했습니다.",
          });
        }
      });
    };
  }

  // ========================================
  // 13. 사진 여러 장 업로드
  // ========================================

  router.post("/:farmId/diaries/:diaryId/photos", createUploadHandler(false));

  // ========================================
  // 14. 기존 단일 사진 업로드
  // 호환성 유지
  // ========================================

  router.post("/:farmId/diaries/:diaryId/photo", createUploadHandler(true));

  // ========================================
  // 15. 사진 목록 조회
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
  // 16. 사진 개별 조회
  // ========================================

  router.get("/:farmId/diaries/:diaryId/photos/:photoId", async (req, res) => {
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

      return await sendImage(res, photo);
    } catch (error) {
      console.error("사진 개별 조회 오류:", error);

      return res.status(500).json({
        success: false,

        message: "사진을 불러오지 못했습니다.",
      });
    }
  });

  // ========================================
  // 17. 기존 단일 사진 조회
  // 가장 최근 사진 반환
  // ========================================

  router.get("/:farmId/diaries/:diaryId/photo", async (req, res) => {
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

      return await sendImage(res, photo);
    } catch (error) {
      console.error("사진 조회 오류:", error);

      return res.status(500).json({
        success: false,

        message: "사진을 불러오지 못했습니다.",
      });
    }
  });

  // ========================================
  // 18. 사진 개별 논리 삭제
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

      // ========================================
      // DB 논리 삭제
      // 실제 파일은 유지
      // ========================================

      const deleted = photoRepository.remove(photoId, diaryId);

      if (!deleted) {
        return res.status(404).json({
          success: false,

          message: "삭제할 사진이 없습니다.",
        });
      }

      console.log("🗑 사진 논리 삭제 완료:", photoId);

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
  // 19. 기존 사진 전체 삭제 API
  // 논리 삭제 방식
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

      // ========================================
      // 사진 전체 논리 삭제
      // ========================================

      const deleted = photoRepository.removeAll(diaryId);

      if (!deleted) {
        return res.status(404).json({
          success: false,

          message: "삭제할 사진이 없습니다.",
        });
      }

      console.log("🗑 사진 전체 논리 삭제 완료:", diaryId);

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
  // 20. 라우터 반환
  // ========================================

  return router;
}

// ========================================
// 21. 모듈 내보내기
// ========================================

module.exports = createDiaryPhotoRouter;
