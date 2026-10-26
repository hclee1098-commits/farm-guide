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
  // 🌱 활성 농장 UID 중복 확인
  // 삭제된 농장은 검사 대상에서 제외
  // ========================================

  const selectActiveFarmByUid = db.prepare(`
    SELECT id

    FROM farms

    WHERE is_deleted = 0
      AND TRIM(farm_uid) = ?

    LIMIT 1
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
  // 🌱 삭제된 농장 조회
  // 복구 대상 확인
  // ========================================

  const selectDeletedFarmById = db.prepare(`
    SELECT
      id,
      farm_uid

    FROM farms

    WHERE id = ?
      AND is_deleted = 1
  `);

  // ========================================
  // 🌱 농장 소프트 삭제 복구
  //
  // 1. 삭제된 농장만 복구
  // 2. 활성 농장 UID 중복 방지
  // 3. 기존 농장 데이터 유지
  // 4. 삭제 시간 초기화
  // ========================================

  const restoreDeletedFarm = db.prepare(`
    UPDATE farms

    SET
      is_deleted = 0,
      deleted_at = NULL

    WHERE id = ?
      AND is_deleted = 1

      AND (
        farm_uid IS NULL

        OR TRIM(farm_uid) = ''

        OR NOT EXISTS (
          SELECT 1

          FROM farms AS active

          WHERE active.is_deleted = 0

            AND TRIM(active.farm_uid) =
                TRIM(farms.farm_uid)
        )
      )
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
  // 🌱 농지 UID 중복 검사
  // ========================================

  function findActiveByUid(farmUid) {
    const uid = String(farmUid ?? "").trim();

    if (!uid) {
      return null;
    }

    return selectActiveFarmByUid.get(uid) ?? null;
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
  // 🌱 농장 복구
  //
  // 복구 결과
  // restored     : 복구 성공
  // not_found    : 복구 대상 없음
  // uid_conflict : 활성 농장 UID 충돌
  // ========================================

  function restore(farmId) {
    // ========================================
    // 1. 농장 ID 검증
    // ========================================

    if (!Number.isSafeInteger(farmId) || farmId <= 0) {
      return {
        status: "not_found",
      };
    }

    // ========================================
    // 2. 삭제된 농장 확인
    // ========================================

    const deletedFarm = selectDeletedFarmById.get(farmId);

    if (!deletedFarm) {
      return {
        status: "not_found",
      };
    }

    // ========================================
    // 3. 농장 복구 실행
    // UID 충돌 여부는 SQL에서 검사
    // ========================================

    const result = restoreDeletedFarm.run(farmId);

    // ========================================
    // 4. 복구 성공
    // ========================================

    if (result.changes > 0) {
      console.log("🌱 농장 복구 완료:", farmId);

      return {
        status: "restored",
      };
    }

    // ========================================
    // 5. UID 충돌로 복구 실패
    // ========================================

    return {
      status: "uid_conflict",
    };
  }

  // ========================================

  // ========================================
  // 사용자별 농장 접근 SQL
  //
  // 기존 Repository 함수는 유지한다.
  // 인증된 API에서는 forUser()를 사용한다.
  // ========================================

  const ownedSelectAll = db.prepare(`
    SELECT *
    FROM farms
    WHERE owner_user_id = ?
      AND is_deleted = 0
    ORDER BY id DESC
  `);

  const ownedSelectById = db.prepare(`
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
      AND owner_user_id = ?
      AND is_deleted = 0
  `);

  const ownedExists = db.prepare(`
    SELECT id
    FROM farms
    WHERE id = ?
      AND owner_user_id = ?
      AND is_deleted = 0
  `);

  // ========================================
  // 사용자 소유 농장 등록
  // ========================================

  const ownedInsert = db.prepare(`
    INSERT INTO farms (
      name,
      crop,
      area,
      latitude,
      longitude,
      address,
      pnu,
      farm_uid,
      owner_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // ========================================
  // 사용자 소유 농장 수정
  // ========================================

  const ownedUpdate = db.prepare(`
    UPDATE farms
    SET
      name = ?,
      crop = ?,
      area = ?
    WHERE id = ?
      AND owner_user_id = ?
      AND is_deleted = 0
  `);

  // ========================================
  // 사용자 소유 농장 소프트 삭제
  // ========================================

  const ownedDelete = db.prepare(`
    UPDATE farms
    SET
      is_deleted = 1,
      deleted_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND owner_user_id = ?
      AND is_deleted = 0
  `);

  // ========================================
  // 사용자 소유 삭제 농장 확인
  // ========================================

  const ownedDeletedFarm = db.prepare(`
    SELECT id, farm_uid
    FROM farms
    WHERE id = ?
      AND owner_user_id = ?
      AND is_deleted = 1
  `);

  // ========================================
  // 사용자 소유 농장 복구
  //
  // 기존 UID 중복 방지 정책 유지
  // ========================================

  const ownedRestore = db.prepare(`
    UPDATE farms
    SET
      is_deleted = 0,
      deleted_at = NULL
    WHERE id = ?
      AND owner_user_id = ?
      AND is_deleted = 1

      AND (
        farm_uid IS NULL

        OR TRIM(farm_uid) = ''

        OR NOT EXISTS (
          SELECT 1
          FROM farms AS active
          WHERE active.is_deleted = 0
            AND TRIM(active.farm_uid) =
                TRIM(farms.farm_uid)
        )
      )
  `);

  // ========================================
  // 인증 사용자 전용 Repository
  // ========================================

  function forUser(userId) {

    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0
    ) {
      throw new TypeError(
        "유효한 사용자 ID가 필요합니다."
      );
    }

    return {

      // ========================================
      // 본인 농장 목록
      // ========================================

      findAll() {
        return ownedSelectAll.all(userId);
      },

      // ========================================
      // 본인 농장 상세
      // ========================================

      findById(farmId) {
        return ownedSelectById.get(
          farmId,
          userId
        );
      },

      // ========================================
      // 본인 농장 존재 여부
      // ========================================

      exists(farmId) {
        return Boolean(
          ownedExists.get(farmId, userId)
        );
      },

      // ========================================
      // 기존 전역 UID 중복 정책 유지
      //
      // 다른 사용자의 농장 ID는 반환하지 않음
      // ========================================

      findActiveByUid(farmUid) {

        const uid = String(
          farmUid ?? ""
        ).trim();

        if (!uid) {
          return false;
        }

        return Boolean(
          selectActiveFarmByUid.get(uid)
        );
      },

      // ========================================
      // 본인 소유 농장 생성
      // ========================================

      create(farm) {

        const result = ownedInsert.run(
          farm.name,
          farm.crop,
          farm.area,
          farm.latitude,
          farm.longitude,
          farm.address,
          farm.pnu,
          farm.farm_uid,
          userId
        );

        return Number(result.lastInsertRowid);
      },

      // ========================================
      // 본인 농장 수정
      // ========================================

      update(farmId, farm) {

        const result = ownedUpdate.run(
          farm.name,
          farm.crop,
          farm.area,
          farmId,
          userId
        );

        return result.changes > 0;
      },

      // ========================================
      // 본인 농장 삭제
      // ========================================

      remove(farmId) {

        const result = ownedDelete.run(
          farmId,
          userId
        );

        return result.changes > 0;
      },

      // ========================================
      // 본인 농장 복구
      // ========================================

      restore(farmId) {

        if (
          !Number.isSafeInteger(farmId) ||
          farmId <= 0
        ) {
          return {
            status: "not_found"
          };
        }

        const deletedFarm =
          ownedDeletedFarm.get(
            farmId,
            userId
          );

        if (!deletedFarm) {
          return {
            status: "not_found"
          };
        }

        const result = ownedRestore.run(
          farmId,
          userId
        );

        if (result.changes > 0) {
          return {
            status: "restored"
          };
        }

        return {
          status: "uid_conflict"
        };
      }

    };
  }
  // 14. 외부에서 사용할 함수
  // ========================================

  return {
    forUser,
    findAll,
    findById,
    exists,
    findActiveByUid,
    create,
    update,
    remove,
    restore,
  };
}

// ========================================
// 15. 모듈 내보내기
// ========================================

module.exports = createFarmRepository;
