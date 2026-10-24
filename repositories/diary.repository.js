// ========================================
// 🌱 농사 가이드 - 재배 일지 Repository
// ========================================

// ========================================
// 1. 재배 일지 Repository 생성
// ========================================

function createDiaryRepository(db) {
  // ========================================
  // 2. 농장 존재 여부 확인 SQL
  // ========================================

  const selectFarm = db.prepare(`
    SELECT id

    FROM farms

    WHERE id = ?
  `);

  // ========================================
  // 3. 농장별 재배 일지 목록 조회 SQL
  // 사진 첨부 여부 포함
  // ========================================

  const selectDiaries = db.prepare(`
    SELECT
      d.*,

      EXISTS (
        SELECT 1

        FROM diary_photos p

        WHERE p.diary_id = d.id
      ) AS has_photo

    FROM farm_diaries d

    WHERE d.farm_id = ?

    ORDER BY
      d.work_date DESC,
      d.id DESC
  `);

  // ========================================
  // 4. 재배 일지 상세 조회 SQL
  // ========================================

  const selectDiary = db.prepare(`
    SELECT *

    FROM farm_diaries

    WHERE id = ?
      AND farm_id = ?
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
  // ========================================

  const updateDiary = db.prepare(`
    UPDATE farm_diaries

    SET
      work_date = ?,
      work_type = ?,
      memo = ?

    WHERE id = ?
      AND farm_id = ?
  `);

  // ========================================
  // 7. 재배 일지 삭제 SQL
  // ========================================

  // 현재는 기존 기능 유지
  // 추후 소프트 삭제 방식으로 변경 예정

  const deleteDiary = db.prepare(`
    DELETE FROM farm_diaries

    WHERE id = ?
      AND farm_id = ?
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
  // 13. 재배 일지 삭제
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
