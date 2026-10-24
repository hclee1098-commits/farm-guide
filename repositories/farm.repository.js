// ========================================
// 🌱 농사 가이드 - 농장 데이터베이스 관리
// ========================================

// ========================================
// 1. 농장 Repository 생성
// ========================================

function createFarmRepository(db) {
  // ========================================
  // 2. 농장 목록 조회 SQL
  // 삭제되지 않은 농장만 조회
  // ========================================

  const selectAllFarms = db.prepare(`
    SELECT *

    FROM farms

    WHERE is_deleted = 0

    ORDER BY id DESC
  `);

  // ========================================
  // 3. 농장 상세 조회 SQL
  // ========================================

  const selectFarmById = db.prepare(`
    SELECT
      id,
      name,
      crop,
      area,
      address,
      pnu,
      farm_uid

    FROM farms

    WHERE id = ?
      AND is_deleted = 0
  `);

  // ========================================
  // 4. 농장 존재 여부 확인 SQL
  // ========================================

  const selectFarmExists = db.prepare(`
    SELECT id

    FROM farms

    WHERE id = ?
      AND is_deleted = 0
  `);

  // ========================================
  // 5. 농장 등록 SQL
  // ========================================

  const insertFarm = db.prepare(`
    INSERT INTO farms (
      name,
      crop,
      area,
      latitude,
      longitude,
      address,
      pnu,
      farm_uid
    )

    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // ========================================
  // 6. 농장 수정 SQL
  // 삭제된 농장은 수정 불가
  // ========================================

  const updateFarm = db.prepare(`
    UPDATE farms

    SET
      name = ?,
      crop = ?,
      area = ?

    WHERE id = ?
      AND is_deleted = 0
  `);

  // ========================================
  // 7. 농장 소프트 삭제 SQL
  // 실제 데이터는 삭제하지 않음
  // ========================================

  const deleteFarm = db.prepare(`
    UPDATE farms

    SET
      is_deleted = 1,
      deleted_at = CURRENT_TIMESTAMP

    WHERE id = ?
      AND is_deleted = 0
  `);

  // ========================================
  // 8. 농장 목록 조회
  // ========================================

  function findAll() {
    return selectAllFarms.all();
  }

  // ========================================
  // 9. 농장 상세 조회
  // ========================================

  function findById(farmId) {
    return selectFarmById.get(farmId);
  }

  // ========================================
  // 10. 농장 존재 여부 확인
  // ========================================

  function exists(farmId) {
    return Boolean(selectFarmExists.get(farmId));
  }

  // ========================================
  // 11. 농장 등록
  // ========================================

  function create(farm) {
    const result = insertFarm.run(
      farm.name,
      farm.crop,
      farm.area,
      farm.latitude,
      farm.longitude,
      farm.address,
      farm.pnu,
      farm.farm_uid,
    );

    return Number(result.lastInsertRowid);
  }

  // ========================================
  // 12. 농장 수정
  // ========================================

  function update(farmId, farm) {
    const result = updateFarm.run(farm.name, farm.crop, farm.area, farmId);

    return result.changes > 0;
  }

  // ========================================
  // 13. 농장 소프트 삭제
  // ========================================

  function remove(farmId) {
    const result = deleteFarm.run(farmId);

    return result.changes > 0;
  }

  // ========================================
  // 14. 외부에서 사용할 함수
  // ========================================

  return {
    findAll,
    findById,
    exists,
    create,
    update,
    remove,
  };
}

// ========================================
// 15. 모듈 내보내기
// ========================================

module.exports = createFarmRepository;
