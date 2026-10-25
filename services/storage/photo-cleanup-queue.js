// ========================================
// 🌱 농사 가이드
// 📸 사진 파일 정리 작업 영속 관리
// ========================================

function createPhotoCleanupQueue(db) {
  // ========================================
  // 1. 정리 작업 테이블 생성
  // ========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS photo_cleanup_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      storage_provider TEXT NOT NULL,

      storage_key TEXT NOT NULL,

      attempts INTEGER NOT NULL DEFAULT 0,

      last_error TEXT,

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      UNIQUE(storage_provider, storage_key)
    )
  `);

  // ========================================
  // 2. 정리 작업 등록
  // ========================================

  const insertJob = db.prepare(`
    INSERT INTO photo_cleanup_jobs (
      storage_provider,
      storage_key
    )
    VALUES (?, ?)

    ON CONFLICT(storage_provider, storage_key)
    DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP
  `);

  // ========================================
  // 3. 정리 대기 작업 조회
  //
  // 최근 24시간 이내 등록된 작업은 제외한다.
  //
  // 목적:
  // 1. 진행 중인 사진 업로드 보호
  // 2. DB 저장 중인 사진 보호
  // 3. 서버 재시작 직후 파일 오삭제 방지
  // ========================================

  const selectJobs = db.prepare(`
  SELECT *
  FROM photo_cleanup_jobs

  WHERE updated_at <= datetime('now', '-24 hours')

  ORDER BY id ASC

  LIMIT ?
`);

  // ========================================
  // 4. 사진 DB 참조 확인
  //
  // 소프트 삭제된 사진도 포함한다.
  // ========================================

  const selectPhotoReference = db.prepare(`
    SELECT 1
    FROM diary_photos
    WHERE storage_provider = ?
      AND storage_key = ?
    LIMIT 1
  `);

  // ========================================
  // 5. 완료 작업 제거
  // ========================================

  const deleteJob = db.prepare(`
    DELETE FROM photo_cleanup_jobs
    WHERE storage_provider = ?
      AND storage_key = ?
  `);

  // ========================================
  // 6. 실패 횟수 기록
  // ========================================

  const updateFailure = db.prepare(`
    UPDATE photo_cleanup_jobs
    SET
      attempts = attempts + 1,
      last_error = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE storage_provider = ?
      AND storage_key = ?
  `);

  // ========================================
  // 7. 작업 등록
  // ========================================

  function enqueue(photo) {
    insertJob.run(photo.storageProvider, photo.storageKey);
  }

  // ========================================
  // 8. DB 참조 여부
  // ========================================

  function isReferenced(photo) {
    return Boolean(
      selectPhotoReference.get(photo.storageProvider, photo.storageKey),
    );
  }

  // ========================================
  // 9. 작업 완료
  // ========================================

  function remove(photo) {
    deleteJob.run(photo.storageProvider, photo.storageKey);
  }

  // ========================================
  // 10. 실패 기록
  // ========================================

  function recordFailure(photo, error) {
    enqueue(photo);

    updateFailure.run(String(error), photo.storageProvider, photo.storageKey);
  }

  // ========================================
  // 11. 미완료 작업 재처리
  // ========================================

  async function retryPending(deletePhotoFile, limit = 100) {
    const jobs = selectJobs.all(limit);

    const result = {
      cleaned: 0,
      protected: 0,
      failed: 0,
    };

    for (const job of jobs) {
      const photo = {
        storageProvider: job.storage_provider,
        storageKey: job.storage_key,
      };

      // ========================================
      // DB에 연결된 사진은 삭제 금지
      // ========================================

      if (isReferenced(photo)) {
        remove(photo);

        result.protected++;

        continue;
      }

      // ========================================
      // 실제 파일 삭제
      // ========================================

      try {
        await deletePhotoFile(photo.storageKey, photo.storageProvider);

        remove(photo);

        result.cleaned++;
      } catch (error) {
        recordFailure(photo, error.message);

        result.failed++;

        console.error("📸 미완료 사진 정리 실패:", photo.storageKey, error);
      }
    }

    return result;
  }

  // ========================================
  // 12. 외부 사용 함수
  // ========================================

  return {
    enqueue,
    remove,
    recordFailure,
    isReferenced,
    retryPending,
  };
}

module.exports = createPhotoCleanupQueue;
