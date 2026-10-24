// ========================================
// 🌱 농사 가이드 - 재배 일지 사진 Repository
// ========================================

// ========================================
// 1. Repository 생성
// ========================================

function createDiaryPhotoRepository(db) {
  // ========================================
  // 2. 재배 일지 존재 여부 확인
  // ========================================

  const selectDiary = db.prepare(`
    SELECT id

    FROM farm_diaries

    WHERE id = ?
      AND farm_id = ?
  `);

  // ========================================
  // 3. 사진 목록 조회
  // ========================================

  const selectPhotos = db.prepare(`
    SELECT
      id,
      mime_type,
      created_at

    FROM diary_photos

    WHERE diary_id = ?

    ORDER BY id DESC
  `);

  // ========================================
  // 4. 사진 개수 조회
  // ========================================

  const countPhotos = db.prepare(`
    SELECT COUNT(*) AS count

    FROM diary_photos

    WHERE diary_id = ?
  `);

  // ========================================
  // 5. 사진 개별 조회
  // ========================================

  const selectPhoto = db.prepare(`
    SELECT
      p.id,
      p.mime_type,
      p.image_data

    FROM diary_photos p

    JOIN farm_diaries d
      ON p.diary_id = d.id

    WHERE p.id = ?
      AND p.diary_id = ?
      AND d.farm_id = ?
  `);

  // ========================================
  // 6. 가장 최근 사진 조회
  // 기존 단일 사진 API 호환
  // ========================================

  const selectLatestPhoto = db.prepare(`
    SELECT
      p.mime_type,
      p.image_data

    FROM diary_photos p

    JOIN farm_diaries d
      ON p.diary_id = d.id

    WHERE d.id = ?
      AND d.farm_id = ?

    ORDER BY p.id DESC

    LIMIT 1
  `);

  // ========================================
  // 7. 최근 사진 ID 조회
  // ========================================

  const selectLatestPhotoId = db.prepare(`
    SELECT id

    FROM diary_photos

    WHERE diary_id = ?

    ORDER BY id DESC

    LIMIT 1
  `);

  // ========================================
  // 8. 사진 등록 SQL
  // ========================================

  const insertPhoto = db.prepare(`
    INSERT INTO diary_photos (
      diary_id,
      mime_type,
      image_data
    )

    VALUES (?, ?, ?)
  `);

  // ========================================
  // 9. 기존 사진 교체 SQL
  // ========================================

  const updatePhoto = db.prepare(`
    UPDATE diary_photos

    SET
      mime_type = ?,
      image_data = ?

    WHERE id = ?
  `);

  // ========================================
  // 10. 사진 개별 삭제 SQL
  // ========================================

  const deletePhoto = db.prepare(`
    DELETE FROM diary_photos

    WHERE id = ?
      AND diary_id = ?
  `);

  // ========================================
  // 11. 재배 일지 사진 전체 삭제 SQL
  // ========================================

  const deleteAllPhotos = db.prepare(`
    DELETE FROM diary_photos

    WHERE diary_id = ?
  `);

  // ========================================
  // 12. 재배 일지 존재 여부 확인
  // ========================================

  function diaryExists(diaryId, farmId) {
    return Boolean(selectDiary.get(diaryId, farmId));
  }

  // ========================================
  // 13. 사진 목록 조회
  // ========================================

  function findAll(diaryId) {
    return selectPhotos.all(diaryId);
  }

  // ========================================
  // 14. 사진 개수 조회
  // ========================================

  function count(diaryId) {
    const result = countPhotos.get(diaryId);

    return Number(result.count);
  }

  // ========================================
  // 15. 사진 개별 조회
  // ========================================

  function findById(photoId, diaryId, farmId) {
    return selectPhoto.get(photoId, diaryId, farmId);
  }

  // ========================================
  // 16. 최근 사진 조회
  // ========================================

  function findLatest(diaryId, farmId) {
    return selectLatestPhoto.get(diaryId, farmId);
  }

  // ========================================
  // 17. 기존 단일 사진 저장 방식
  // 가장 최근 사진 교체
  // ========================================

  function saveSingle(diaryId, file) {
    const existingPhoto = selectLatestPhotoId.get(diaryId);

    if (existingPhoto) {
      updatePhoto.run(file.mimetype, file.buffer, existingPhoto.id);

      return existingPhoto.id;
    }

    const result = insertPhoto.run(diaryId, file.mimetype, file.buffer);

    return Number(result.lastInsertRowid);
  }

  // ========================================
  // 18. 사진 여러 장 저장
  // 트랜잭션 및 최대 10장 제한
  // ========================================

  function saveMultiple(diaryId, files) {
    let transactionStarted = false;

    try {
      // ========================================
      // 트랜잭션 시작
      // ========================================

      db.exec("BEGIN IMMEDIATE");

      transactionStarted = true;

      // ========================================
      // 기존 사진 개수 확인
      // ========================================

      const existingCount = count(diaryId);

      // ========================================
      // 최대 10장 제한
      // ========================================

      if (existingCount + files.length > 10) {
        const error = new Error(
          `현재 ${existingCount}장의 사진이 등록되어 있습니다. ` +
            "재배 일지 하나에는 최대 10장까지 등록할 수 있습니다.",
        );

        error.code = "PHOTO_LIMIT_EXCEEDED";

        throw error;
      }

      // ========================================
      // 사진 여러 장 저장
      // ========================================

      const savedPhotoIds = [];

      for (const file of files) {
        const result = insertPhoto.run(diaryId, file.mimetype, file.buffer);

        savedPhotoIds.push(Number(result.lastInsertRowid));
      }

      // ========================================
      // 트랜잭션 완료
      // ========================================

      db.exec("COMMIT");

      transactionStarted = false;

      return savedPhotoIds;
    } catch (error) {
      // ========================================
      // 오류 발생 시 롤백
      // ========================================

      if (transactionStarted) {
        try {
          db.exec("ROLLBACK");
        } catch (rollbackError) {
          console.error("사진 저장 롤백 오류:", rollbackError);
        }
      }

      throw error;
    }
  }

  // ========================================
  // 19. 사진 개별 삭제
  // ========================================

  function remove(photoId, diaryId) {
    const result = deletePhoto.run(photoId, diaryId);

    return result.changes > 0;
  }

  // ========================================
  // 20. 사진 전체 삭제
  // ========================================

  function removeAll(diaryId) {
    const result = deleteAllPhotos.run(diaryId);

    return result.changes > 0;
  }

  // ========================================
  // 21. 외부에서 사용할 함수
  // ========================================

  return {
    diaryExists,
    findAll,
    count,
    findById,
    findLatest,
    saveSingle,
    saveMultiple,
    remove,
    removeAll,
  };
}

// ========================================
// 22. 모듈 내보내기
// ========================================

module.exports = createDiaryPhotoRepository;
