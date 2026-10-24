// ========================================
// 🌱 농사 가이드 - 재배 일지 Repository
// ========================================

// ========================================
// 1. 재배 일지 Repository 생성
// ========================================

function createDiaryRepository(db) {
  // ========================================
  // 2. 활성 농장 존재 여부 확인
  // ========================================

  const selectFarm = db.prepare(`
    SELECT id

    FROM farms

    WHERE id = ?
      AND is_deleted = 0
  `);

  // ========================================
  // 3. 농장별 재배 일지 목록 조회 SQL
  // 삭제되지 않은 사진의 첨부 여부 포함
  // ========================================

  const selectDiaries = db.prepare(`
  SELECT
    d.*,

    EXISTS (
      SELECT 1

      FROM diary_photos p

      WHERE p.diary_id = d.id
        AND p.is_deleted = 0
    ) AS has_photo

  FROM farm_diaries d

  WHERE d.farm_id = ?
  AND d.is_deleted = 0

  ORDER BY
    d.work_date DESC,
    d.id DESC
`);

  // ========================================
  // 4. 재배 일지 상세 조회
  // ========================================

  const selectDiary = db.prepare(`
    SELECT d.*

    FROM farm_diaries d

    JOIN farms f
      ON d.farm_id = f.id

    WHERE d.id = ?
      AND d.farm_id = ?
      AND d.is_deleted = 0
      AND f.is_deleted = 0
  `);

  // ========================================
  // 5. 재배 일지 등록 SQL
  // ========================================

  const insertDiary = db.prepare(`
    INSERT INTO farm_diaries (
      farm_id,
      work_date,
      work_type,
      memo
    )

    VALUES (?, ?, ?, ?)
  `);

  // ========================================
  // 6. 재배 일지 수정 SQL
  // 삭제된 일지는 수정 불가
  // ========================================

  const updateDiary = db.prepare(`
    UPDATE farm_diaries

    SET
      work_date = ?,
      work_type = ?,
      memo = ?

    WHERE id = ?
      AND farm_id = ?
      AND is_deleted = 0

      AND EXISTS (
        SELECT 1

        FROM farms f

        WHERE f.id = farm_diaries.farm_id
          AND f.is_deleted = 0
      )
  `);

  // ========================================
  // 7. 재배 일지 소프트 삭제 SQL
  // ========================================

  const deleteDiary = db.prepare(`
    UPDATE farm_diaries

    SET
      is_deleted = 1,
      deleted_at = CURRENT_TIMESTAMP

    WHERE id = ?
      AND farm_id = ?
      AND is_deleted = 0

      AND EXISTS (
        SELECT 1

        FROM farms f

        WHERE f.id = farm_diaries.farm_id
          AND f.is_deleted = 0
      )
  `);

  // ========================================
  // 8. 농장 존재 여부 확인
  // ========================================

  function farmExists(farmId) {
    const farm = selectFarm.get(farmId);

    return Boolean(farm);
  }

  // ========================================
  // 9. 농장별 재배 일지 목록 조회
  // ========================================

  function findAllByFarmId(farmId) {
    return selectDiaries.all(farmId);
  }

  // ========================================
  // 10. 재배 일지 상세 조회
  // ========================================

  function findById(diaryId, farmId) {
    return selectDiary.get(diaryId, farmId);
  }

  // ========================================
  // 11. 재배 일지 등록
  // ========================================

  function create(farmId, diary) {
    // ========================================
    // 삭제된 농장에는 일지 등록 불가
    // ========================================

    if (!farmExists(farmId)) {
      const error = new Error("존재하지 않거나 삭제된 농장입니다.");

      error.code = "FARM_NOT_FOUND";

      throw error;
    }

    const result = insertDiary.run(
      farmId,
      diary.work_date,
      diary.work_type,
      diary.memo,
    );

    return Number(result.lastInsertRowid);
  }

  // ========================================
  // 12. 재배 일지 수정
  // ========================================

  function update(diaryId, farmId, diary) {
    const result = updateDiary.run(
      diary.work_date,
      diary.work_type,
      diary.memo,
      diaryId,
      farmId,
    );

    return result.changes > 0;
  }

  // ========================================
  // 13. 재배 일지 소프트 삭제
  // ========================================

  function remove(diaryId, farmId) {
    const result = deleteDiary.run(diaryId, farmId);

    return result.changes > 0;
  }

  // ========================================
  // 14. 외부에서 사용할 함수
  // ========================================

  return {
    farmExists,
    findAllByFarmId,
    findById,
    create,
    update,
    remove,
  };
}

// ========================================
// 15. 모듈 내보내기
// ========================================

module.exports = createDiaryRepository;
