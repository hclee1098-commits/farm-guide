// ========================================
// 🌱 농사 가이드
// 📸 사진 정리 작업 영속성 및 동시성 관리
// ========================================

function createPhotoCleanupQueue(db) {
  // ========================================
  // 1. 정리 작업 테이블
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

      state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'processing')),

      UNIQUE(storage_provider, storage_key)
    )
  `);

  // ========================================
  // 2. 기존 DB 구조 호환
  // ========================================

  const columns = db.prepare("PRAGMA table_info(photo_cleanup_jobs)").all();

  if (!columns.some((column) => column.name === "state")) {
    db.exec(`
      ALTER TABLE photo_cleanup_jobs
      ADD COLUMN state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'processing'))
    `);
  }

  // ========================================
  // 3. 정리 중 사진 DB 등록 차단
  //
  // 사진 파일 삭제 중에는
  // 동일 storage_key 등록을 허용하지 않는다.
  // ========================================

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS
      prevent_photo_insert_during_cleanup

    BEFORE INSERT ON diary_photos

    WHEN NEW.storage_key IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM photo_cleanup_jobs j

        WHERE j.storage_provider = NEW.storage_provider
          AND j.storage_key = NEW.storage_key
          AND j.state = 'processing'
      )

    BEGIN
      SELECT RAISE(
        ABORT,
        'PHOTO_CLEANUP_IN_PROGRESS'
      );
    END
  `);

  // ========================================
  // 4. 사진 저장 위치 변경도 차단
  // ========================================

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS
      prevent_photo_update_during_cleanup

    BEFORE UPDATE OF storage_provider, storage_key
    ON diary_photos

    WHEN NEW.storage_key IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM photo_cleanup_jobs j

        WHERE j.storage_provider = NEW.storage_provider
          AND j.storage_key = NEW.storage_key
          AND j.state = 'processing'
      )

    BEGIN
      SELECT RAISE(
        ABORT,
        'PHOTO_CLEANUP_IN_PROGRESS'
      );
    END
  `);

  // ========================================
  // 5. 정리 작업 등록
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
  // 6. 기존 작업 시간 유지 등록
  // ========================================

  const insertJobIfAbsent = db.prepare(`
    INSERT INTO photo_cleanup_jobs (
      storage_provider,
      storage_key
    )
    VALUES (?, ?)

    ON CONFLICT(storage_provider, storage_key)
    DO NOTHING
  `);

  // ========================================
  // 7. 처리 대기 작업 조회
  // ========================================

  const selectJobs = db.prepare(`
    SELECT *
    FROM photo_cleanup_jobs

    WHERE state = 'pending'
      AND updated_at <= datetime('now', '-24 hours')

    ORDER BY id ASC

    LIMIT ?
  `);

  // ========================================
  // 8. DB 사진 참조 확인
  //
  // 소프트 삭제된 사진도 보호
  // ========================================

  const selectPhotoReference = db.prepare(`
    SELECT 1
    FROM diary_photos

    WHERE storage_provider = ?
      AND storage_key = ?

    LIMIT 1
  `);

  // ========================================
  // 9. 정리 작업 원자적 선점
  //
  // 다른 DB 연결에서 이미 선점했다면
  // changes = 0
  // ========================================

  const claimJob = db.prepare(`
    UPDATE photo_cleanup_jobs

    SET
      state = 'processing',
      updated_at = CURRENT_TIMESTAMP

    WHERE id = ?
      AND state = 'pending'
      AND updated_at <= datetime('now', '-24 hours')

      AND NOT EXISTS (
        SELECT 1
        FROM diary_photos p

        WHERE p.storage_provider =
          photo_cleanup_jobs.storage_provider

          AND p.storage_key =
          photo_cleanup_jobs.storage_key
      )
  `);

  // ========================================
  // 10. 일반 작업 제거
  // ========================================

  const deleteJob = db.prepare(`
    DELETE FROM photo_cleanup_jobs

    WHERE storage_provider = ?
      AND storage_key = ?
      AND state = 'pending'
  `);

  // ========================================
  // 11. 선점 작업 완료
  // ========================================

  const deleteClaimedJob = db.prepare(`
    DELETE FROM photo_cleanup_jobs

    WHERE id = ?
      AND state = 'processing'
  `);

  // ========================================
  // 12. 실패 기록 및 재시도 상태 복구
  // ========================================

  const updateFailure = db.prepare(`
    UPDATE photo_cleanup_jobs

    SET
      attempts = attempts + 1,
      last_error = ?,
      state = 'pending',
      updated_at = CURRENT_TIMESTAMP

    WHERE storage_provider = ?
      AND storage_key = ?
  `);

  // ========================================
  // 13. 서버 비정상 종료 작업 복구
  //
  // 24시간 이상 processing 상태인 작업만
  // 재처리 대상으로 되돌린다.
  // ========================================

  const resetStaleJobs = db.prepare(`
    UPDATE photo_cleanup_jobs

    SET
      state = 'pending',
      updated_at = datetime('now', '-25 hours')

    WHERE state = 'processing'
      AND updated_at <= datetime('now', '-24 hours')
  `);

  // ========================================
  // 14. 작업 등록
  // ========================================

  function enqueue(photo) {
    insertJob.run(photo.storageProvider, photo.storageKey);
  }

  // ========================================
  // 15. 중복 등록 방지
  // ========================================

  function enqueueIfAbsent(photo) {
    const result = insertJobIfAbsent.run(
      photo.storageProvider,
      photo.storageKey,
    );

    return result.changes > 0;
  }

  // ========================================
  // 16. DB 참조 확인
  // ========================================

  function isReferenced(photo) {
    return Boolean(
      selectPhotoReference.get(photo.storageProvider, photo.storageKey),
    );
  }

  // ========================================
  // 17. 일반 작업 제거
  // ========================================

  function remove(photo) {
    deleteJob.run(photo.storageProvider, photo.storageKey);
  }

  // ========================================
  // 18. 실패 기록
  // ========================================

  function recordFailure(photo, error) {
    enqueue(photo);

    updateFailure.run(String(error), photo.storageProvider, photo.storageKey);
  }

  // ========================================
  // 19. 미완료 작업 재처리
  // ========================================

  async function retryPending(deletePhotoFile, limit = 100) {
    // ========================================
    // 오래된 처리 중 작업 복구
    // ========================================

    resetStaleJobs.run();

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
      // DB 등록 사진 보호
      // ========================================

      if (isReferenced(photo)) {
        remove(photo);

        result.protected++;

        continue;
      }

      // ========================================
      // 정리 작업 원자적 선점
      // ========================================

      const claimed = claimJob.run(job.id);

      if (claimed.changes === 0) {
        // 선점 직전 DB에 등록된 경우
        if (isReferenced(photo)) {
          remove(photo);

          result.protected++;
        }

        continue;
      }

      // ========================================
      // 실제 사진 삭제
      //
      // processing 상태에서는
      // 동일 사진 DB 등록이 차단된다.
      // ========================================

      try {
        try {
          await deletePhotoFile(photo.storageKey, photo.storageProvider);
        } catch (error) {
          // 이미 삭제된 파일은 정리 완료로 처리
          if (error.code !== "ENOENT") {
            throw error;
          }
        }

        deleteClaimedJob.run(job.id);

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
  // 20. 외부 사용 함수
  // ========================================

  return {
    enqueue,
    enqueueIfAbsent,
    remove,
    recordFailure,
    isReferenced,
    retryPending,
  };
}

module.exports = createPhotoCleanupQueue;
