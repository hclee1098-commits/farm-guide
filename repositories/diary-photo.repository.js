// ========================================
// 🌱 농사 가이드
// 📸 재배 일지 사진 Repository
// ========================================

// ========================================
// 📸 사진 SHA-256 해시 생성
// ========================================

const crypto = require("node:crypto");

// ========================================
// 1. Repository 생성
// ========================================

function createDiaryPhotoRepository(db) {
  // ========================================
  // 2. 기본 설정
  // ========================================

  const MAX_PHOTOS = 10;

  const MAX_FILE_SIZE = 3 * 1024 * 1024;

  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

  // ========================================
  // 3. 활성 재배 일지 존재 여부 확인
  //
  // 농장과 재배 일지가 모두
  // 삭제되지 않은 상태여야 한다.
  // ========================================

  const selectDiary = db.prepare(`
    SELECT d.id

    FROM farm_diaries d

    JOIN farms f
      ON d.farm_id = f.id

    WHERE d.id = ?
      AND d.farm_id = ?
      AND d.is_deleted = 0
      AND f.is_deleted = 0
  `);

  // ========================================
  // 4. 사진 목록 조회
  //
  // 삭제된 사진 제외
  // 삭제된 재배 일지 제외
  // 삭제된 농장 제외
  // ========================================

  const selectPhotos = db.prepare(`
    SELECT
      p.id,
      p.mime_type,
      p.storage_provider,
      p.storage_key,
      p.file_size,
      p.created_at,
      p.content_hash

    FROM diary_photos p

    JOIN farm_diaries d
      ON p.diary_id = d.id

    JOIN farms f
      ON d.farm_id = f.id

    WHERE p.diary_id = ?
      AND p.is_deleted = 0
      AND d.is_deleted = 0
      AND f.is_deleted = 0

    ORDER BY p.id DESC
  `);

  // ========================================
  // 5. 사진 개수 조회
  //
  // 활성 사진만 계산
  // 최대 10장 제한에 사용
  // ========================================

  const countPhotos = db.prepare(`
    SELECT COUNT(*) AS count

    FROM diary_photos p

    JOIN farm_diaries d
      ON p.diary_id = d.id

    JOIN farms f
      ON d.farm_id = f.id

    WHERE p.diary_id = ?
      AND p.is_deleted = 0
      AND d.is_deleted = 0
      AND f.is_deleted = 0
  `);

  // ========================================
  // 6. 사진 개별 조회
  //
  // 기존 BLOB 방식 지원
  // 신규 파일 저장 방식 지원
  // ========================================

  const selectPhoto = db.prepare(`
    SELECT
      p.id,
      p.mime_type,
      p.image_data,
      p.storage_provider,
      p.storage_key,
      p.file_size

    FROM diary_photos p

    JOIN farm_diaries d
      ON p.diary_id = d.id

    JOIN farms f
      ON d.farm_id = f.id

    WHERE p.id = ?
      AND p.diary_id = ?
      AND d.farm_id = ?
      AND p.is_deleted = 0
      AND d.is_deleted = 0
      AND f.is_deleted = 0
  `);

  // ========================================
  // 7. 가장 최근 사진 조회
  //
  // 기존 단일 사진 API 호환
  // ========================================

  const selectLatestPhoto = db.prepare(`
    SELECT
      p.id,
      p.mime_type,
      p.image_data,
      p.storage_provider,
      p.storage_key,
      p.file_size

    FROM diary_photos p

    JOIN farm_diaries d
      ON p.diary_id = d.id

    JOIN farms f
      ON d.farm_id = f.id

    WHERE d.id = ?
      AND d.farm_id = ?
      AND p.is_deleted = 0
      AND d.is_deleted = 0
      AND f.is_deleted = 0

    ORDER BY p.id DESC

    LIMIT 1
  `);

  // ========================================
  // 8. 기존 BLOB 사진 등록 SQL
  //
  // 기존 API 호환을 위해 유지
  // ========================================

  const insertLegacyPhoto = db.prepare(`
  INSERT INTO diary_photos (
    diary_id,
    mime_type,
    image_data,
    file_size,
    content_hash
  )

  VALUES (?, ?, ?, ?, ?)
`);

  // ========================================
  // 📸 활성 사진 SHA-256 중복 검사 SQL
  // ========================================

  const selectActivePhotoByHash = db.prepare(`
    SELECT id

    FROM diary_photos

    WHERE diary_id = ?
      AND content_hash = ?
      AND is_deleted = 0

    LIMIT 1
  `);

  // ========================================
  // 9. 신규 파일 사진 등록 SQL
  //
  // DB에는 사진 저장 위치만 기록
  // ========================================

  const insertStoredPhoto = db.prepare(`
  INSERT INTO diary_photos (
    diary_id,
    mime_type,
    storage_provider,
    storage_key,
    file_size,
    content_hash
  )

  VALUES (?, ?, ?, ?, ?, ?)
`);

  // ========================================
  // 10. 사진 개별 소프트 삭제
  //
  // 실제 파일은 삭제하지 않는다.
  // ========================================

  const softDeletePhoto = db.prepare(`
    UPDATE diary_photos

    SET
      is_deleted = 1,
      deleted_at = CURRENT_TIMESTAMP

    WHERE id = ?
      AND diary_id = ?
      AND is_deleted = 0

      AND EXISTS (
        SELECT 1

        FROM farm_diaries d

        JOIN farms f
          ON d.farm_id = f.id

        WHERE d.id = diary_photos.diary_id
          AND d.is_deleted = 0
          AND f.is_deleted = 0
      )
  `);

  // ========================================
  // 11. 사진 전체 소프트 삭제
  // ========================================

  const softDeleteAllPhotos = db.prepare(`
    UPDATE diary_photos

    SET
      is_deleted = 1,
      deleted_at = CURRENT_TIMESTAMP

    WHERE diary_id = ?
      AND is_deleted = 0

      AND EXISTS (
        SELECT 1

        FROM farm_diaries d

        JOIN farms f
          ON d.farm_id = f.id

        WHERE d.id = diary_photos.diary_id
          AND d.is_deleted = 0
          AND f.is_deleted = 0
      )
  `);

  // ========================================
  // 📸 삭제된 사진 조회 SQL
  // ========================================

  const selectDeletedPhoto = db.prepare(`
    SELECT
      p.id

    FROM diary_photos p

    JOIN farm_diaries d
      ON p.diary_id = d.id

    JOIN farms f
      ON d.farm_id = f.id

    WHERE p.id = ?
      AND p.diary_id = ?
      AND d.farm_id = ?
      AND p.is_deleted = 1
      AND d.is_deleted = 0
      AND f.is_deleted = 0
  `);

  // ========================================
  // 📸 사진 소프트 삭제 복구 SQL
  // ========================================

  const restorePhoto = db.prepare(`
    UPDATE diary_photos

    SET
      is_deleted = 0,
      deleted_at = NULL

    WHERE id = ?
      AND diary_id = ?
      AND is_deleted = 1

      AND EXISTS (
        SELECT 1

        FROM farm_diaries d

        JOIN farms f
          ON d.farm_id = f.id

        WHERE d.id = diary_photos.diary_id
          AND d.id = ?
          AND d.farm_id = ?
          AND d.is_deleted = 0
          AND f.is_deleted = 0
      )

      AND (
        SELECT COUNT(*)

        FROM diary_photos p

        WHERE p.diary_id = diary_photos.diary_id
          AND p.is_deleted = 0
      ) < 10

      AND NOT EXISTS (
        SELECT 1

        FROM diary_photos active_photo

        WHERE active_photo.diary_id = diary_photos.diary_id
          AND active_photo.is_deleted = 0
          AND diary_photos.content_hash IS NOT NULL
          AND active_photo.content_hash = diary_photos.content_hash
      )
  `);

  // ========================================
  // 12. 공통 트랜잭션 처리
  // ========================================

  function runTransaction(callback) {
    db.exec("BEGIN IMMEDIATE");

    try {
      const result = callback();

      db.exec("COMMIT");

      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackError) {
        console.error("📸 사진 트랜잭션 롤백 오류:", rollbackError);
      }

      throw error;
    }
  }

  // ========================================
  // 13. 활성 재배 일지 존재 여부 확인
  // ========================================

  function diaryExists(diaryId, farmId) {
    return Boolean(selectDiary.get(diaryId, farmId));
  }

  // ========================================
  // 14. 사진 목록 조회
  // ========================================

  function findAll(diaryId) {
    return selectPhotos.all(diaryId);
  }

  // ========================================
  // 15. 활성 사진 개수 조회
  // ========================================

  function count(diaryId) {
    const result = countPhotos.get(diaryId);

    return Number(result.count);
  }

  // ========================================
  // 16. 사진 개별 조회
  // ========================================

  function findById(photoId, diaryId, farmId) {
    return selectPhoto.get(photoId, diaryId, farmId);
  }

  // ========================================
  // 17. 가장 최근 사진 조회
  // ========================================

  function findLatest(diaryId, farmId) {
    return selectLatestPhoto.get(diaryId, farmId);
  }

  // ========================================
  // 18. 활성 재배 일지 검증
  //
  // 사진 저장 시 반드시 확인
  // ========================================

  function ensureActiveDiary(diaryId) {
    const diary = db
      .prepare(
        `
      SELECT d.id

      FROM farm_diaries d

      JOIN farms f
        ON d.farm_id = f.id

      WHERE d.id = ?
        AND d.is_deleted = 0
        AND f.is_deleted = 0
    `,
      )
      .get(diaryId);

    if (!diary) {
      const error = new Error("존재하지 않거나 삭제된 재배 일지입니다.");

      error.code = "DIARY_NOT_FOUND";

      throw error;
    }
  }

  // ========================================
  // 19. 사진 최대 10장 제한 검사
  // ========================================

  function checkPhotoLimit(diaryId, newCount) {
    const existingCount = count(diaryId);

    if (existingCount + newCount > MAX_PHOTOS) {
      const error = new Error(
        `현재 ${existingCount}장의 사진이 등록되어 있습니다. ` +
          `재배 일지 하나에는 최대 ${MAX_PHOTOS}장까지 등록할 수 있습니다.`,
      );

      error.code = "PHOTO_LIMIT_EXCEEDED";

      throw error;
    }
  }

  // ========================================
  // 20. 기존 단일 사진 저장
  //
  // 기존 BLOB 방식 유지
  // SHA-256 해시값 함께 저장
  // ========================================

  function saveSingle(diaryId, file) {
    return runTransaction(() => {
      // ========================================
      // 활성 재배 일지 확인
      // ========================================

      ensureActiveDiary(diaryId);

      // ========================================
      // 최대 10장 제한
      // ========================================

      checkPhotoLimit(diaryId, 1);

      // ========================================
      // 사진 해시 생성
      // ========================================

      const contentHash = crypto
        .createHash("sha256")
        .update(file.buffer)
        .digest("hex");

      // ========================================
      // 기존 BLOB 및 해시 저장
      // ========================================

      const result = insertLegacyPhoto.run(
        diaryId,
        file.mimetype,
        file.buffer,
        file.buffer.length,
        contentHash,
      );

      return Number(result.lastInsertRowid);
    });
  }

  // ========================================
  // 21. 기존 사진 여러 장 저장
  //
  // 기존 BLOB 방식 유지
  // 사진별 SHA-256 해시 저장
  // ========================================

  function saveMultiple(diaryId, files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("저장할 사진이 없습니다.");
    }

    return runTransaction(() => {
      // ========================================
      // 활성 재배 일지 확인
      // ========================================

      ensureActiveDiary(diaryId);

      // ========================================
      // 최대 10장 제한
      // ========================================

      checkPhotoLimit(diaryId, files.length);

      const savedPhotoIds = [];

      // ========================================
      // 사진별 저장
      // ========================================

      for (const file of files) {
        // ========================================
        // 사진 해시 생성
        // ========================================

        const contentHash = crypto
          .createHash("sha256")
          .update(file.buffer)
          .digest("hex");

        // ========================================
        // BLOB 및 해시 저장
        // ========================================

        const result = insertLegacyPhoto.run(
          diaryId,
          file.mimetype,
          file.buffer,
          file.buffer.length,
          contentHash,
        );

        savedPhotoIds.push(Number(result.lastInsertRowid));
      }

      return savedPhotoIds;
    });
  }

  // ========================================
  // 22. 신규 파일 사진 저장 정보 등록
  //
  // 실제 파일은 storage.service.js에서 저장
  // DB에는 저장 위치 정보만 기록
  // ========================================

  function saveStoredPhotos(diaryId, storedPhotos) {
    if (!Array.isArray(storedPhotos) || storedPhotos.length === 0) {
      throw new Error("저장할 사진 정보가 없습니다.");
    }

    // ========================================
    // 저장 정보 검증
    // ========================================

    for (const photo of storedPhotos) {
      if (
        !photo ||
        !["local", "cloud"].includes(photo.storageProvider) ||
        typeof photo.storageKey !== "string" ||
        !photo.storageKey.trim() ||
        !ALLOWED_MIME_TYPES.includes(photo.mimeType) ||
        !Number.isSafeInteger(photo.size) ||
        photo.size <= 0 ||
        photo.size > MAX_FILE_SIZE ||
        typeof photo.contentHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(photo.contentHash)
      ) {
        throw new Error("올바르지 않은 사진 저장 정보입니다.");
      }
    }

    // ========================================
    // DB 트랜잭션
    // ========================================

    return runTransaction(() => {
      // 활성 재배 일지 확인
      ensureActiveDiary(diaryId);

      // 최대 10장 제한
      checkPhotoLimit(diaryId, storedPhotos.length);

      const savedPhotoIds = [];

      // ========================================
      // 사진 메타데이터 저장
      // ========================================

      for (const photo of storedPhotos) {
        // ========================================
        // 활성 사진 SHA-256 중복 검사
        //
        // BEGIN IMMEDIATE 트랜잭션 내부에서
        // 검사하여 동시 업로드 중복을 방지한다.
        // ========================================

        const existingPhoto = selectActivePhotoByHash.get(
          diaryId,
          photo.contentHash,
        );

        if (existingPhoto) {
          const error = new Error("이미 등록된 사진입니다.");

          error.code = "PHOTO_DUPLICATE";

          throw error;
        }

        // ========================================
        // 신규 사진 메타데이터 저장
        // ========================================

        const result = insertStoredPhoto.run(
          diaryId,
          photo.mimeType,
          photo.storageProvider,
          photo.storageKey,
          photo.size,
          photo.contentHash,
        );

        savedPhotoIds.push(Number(result.lastInsertRowid));
      }

      return savedPhotoIds;
    });
  }

  // ========================================
  // 23. 사진 개별 소프트 삭제
  // ========================================

  function remove(photoId, diaryId) {
    const result = softDeletePhoto.run(photoId, diaryId);

    return result.changes > 0;
  }

  // ========================================
  // 24. 사진 전체 소프트 삭제
  // ========================================

  function removeAll(diaryId) {
    const result = softDeleteAllPhotos.run(diaryId);

    return result.changes > 0;
  }

  // ========================================
  // 📸 삭제된 사진 조회
  // ========================================

  function findDeletedById(photoId, diaryId, farmId) {
    return selectDeletedPhoto.get(photoId, diaryId, farmId) ?? null;
  }

  // ========================================
  // 📸 사진 소프트 삭제 복구
  // ========================================

  function restore(photoId, diaryId, farmId) {
    const result = restorePhoto.run(photoId, diaryId, diaryId, farmId);

    if (result.changes > 0) {
      console.log("📸 사진 복구 완료:", photoId);
    }

    return result.changes > 0;
  }

  // ========================================
  // 25. 외부에서 사용할 함수
  // ========================================

  return {
    diaryExists,

    findAll,

    count,

    findById,

    findLatest,

    saveSingle,

    saveMultiple,

    saveStoredPhotos,

    remove,

    removeAll,

    findDeletedById,

    restore,
  };
}

// ========================================
// 26. 모듈 내보내기
// ========================================

module.exports = createDiaryPhotoRepository;
