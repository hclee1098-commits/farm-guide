// ========================================
// 🌱 농사 가이드
// 농장 소프트 삭제 복구 데이터 무결성 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const Database = require("better-sqlite3");

const createFarmRepository = require("../repositories/farm.repository");

// ========================================
// 테스트 전용 DB 생성
// ========================================

function createTestDatabase() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE farms (
      id INTEGER PRIMARY KEY,
      name TEXT,
      crop TEXT,
      area REAL,
      latitude REAL,
      longitude REAL,
      address TEXT,
      pnu TEXT,
      farm_uid TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    );

    CREATE UNIQUE INDEX
      idx_farms_active_uid_unique

    ON farms (
      TRIM(farm_uid)
    )

    WHERE is_deleted = 0
      AND farm_uid IS NOT NULL
      AND TRIM(farm_uid) <> '';

    CREATE TABLE farm_diaries (
      id INTEGER PRIMARY KEY,
      farm_id INTEGER NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY,
      diary_id INTEGER NOT NULL,
      image_data BLOB,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );
  `);

  return db;
}

// ========================================
// 1. 농장 복구 및 하위 데이터 보존
// ========================================

test("삭제된 농장 복구 후 데이터 무결성 유지", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createFarmRepository(db);

  // ========================================
  // 테스트 데이터 생성
  // ========================================

  db.exec(`
    INSERT INTO farms (
      id,
      name,
      farm_uid,
      is_deleted,
      deleted_at
    )

    VALUES (
      1,
      '복구 테스트 농장',
      'FARM-001',
      1,
      CURRENT_TIMESTAMP
    );

    INSERT INTO farm_diaries (
      id,
      farm_id
    )

    VALUES (1, 1);

    INSERT INTO diary_photos (
      id,
      diary_id,
      image_data
    )

    VALUES (1, 1, X'01020304');
  `);

  // ========================================
  // 농장 복구 실행
  // ========================================

  const result = repository.restore(1);

  assert.equal(result.status, "restored");

  console.log("✅ 삭제된 농장 복구 성공");

  // ========================================
  // 농장 삭제 상태 확인
  // ========================================

  const farm = db
    .prepare(
      `
    SELECT *

    FROM farms

    WHERE id = 1
  `,
    )
    .get();

  assert.equal(farm.is_deleted, 0);

  assert.equal(farm.deleted_at, null);

  console.log("✅ 농장 삭제 상태 초기화 성공");

  // ========================================
  // 기존 재배 일지 보존 확인
  // ========================================

  const diary = db
    .prepare(
      `
    SELECT *

    FROM farm_diaries

    WHERE id = 1
  `,
    )
    .get();

  assert.equal(diary.farm_id, 1);

  assert.equal(diary.is_deleted, 0);

  console.log("✅ 기존 재배 일지 데이터 보존");

  // ========================================
  // 기존 사진 데이터 보존 확인
  // ========================================

  const photo = db
    .prepare(
      `
    SELECT *

    FROM diary_photos

    WHERE id = 1
  `,
    )
    .get();

  assert.deepEqual(photo.image_data, Buffer.from([1, 2, 3, 4]));

  assert.equal(photo.is_deleted, 0);

  console.log("✅ 기존 사진 원본 데이터 보존");

  // ========================================
  // 복구된 농장 조회 확인
  // ========================================

  const restoredFarm = repository.findById(1);

  assert.equal(restoredFarm.id, 1);

  console.log("✅ 복구된 농장 정상 조회");

  // ========================================
  // 중복 복구 차단
  // ========================================

  const duplicateRestore = repository.restore(1);

  assert.equal(duplicateRestore.status, "not_found");

  console.log("✅ 이미 복구된 농장 중복 복구 차단");
});

// ========================================
// 2. 동일 UID 농장 복구 차단
// ========================================

test("활성 농장 UID 중복 시 복구 차단", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createFarmRepository(db);

  db.exec(`
    INSERT INTO farms (
      id,
      name,
      farm_uid,
      is_deleted
    )

    VALUES
      (1, '삭제된 농장', ' FARM-001 ', 1),
      (2, '활성 농장', 'FARM-001', 0);
  `);

  // ========================================
  // UID 충돌 복구 시도
  // ========================================

  const result = repository.restore(1);

  assert.equal(result.status, "uid_conflict");

  console.log("✅ 동일 UID 농장 복구 차단");

  // ========================================
  // 삭제 상태 유지 확인
  // ========================================

  const deletedFarm = db
    .prepare(
      `
    SELECT is_deleted

    FROM farms

    WHERE id = 1
  `,
    )
    .get();

  assert.equal(deletedFarm.is_deleted, 1);

  console.log("✅ 복구 실패 농장 삭제 상태 유지");

  // ========================================
  // 기존 활성 농장 보존 확인
  // ========================================

  const activeFarm = repository.findById(2);

  assert.equal(activeFarm.id, 2);

  console.log("✅ 기존 활성 농장 데이터 보존");
});

// ========================================
// 3. 존재하지 않는 농장 복구 차단
// ========================================

test("존재하지 않는 농장 복구 차단", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createFarmRepository(db);

  const result = repository.restore(999);

  assert.equal(result.status, "not_found");

  console.log("✅ 존재하지 않는 농장 복구 차단");
});

// ========================================
// 4. UID 없는 농장 복구
// ========================================

test("UID 없는 삭제 농장 복구 허용", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createFarmRepository(db);

  db.exec(`
    INSERT INTO farms (
      id,
      name,
      farm_uid,
      is_deleted
    )

    VALUES
      (1, 'UID NULL 농장', NULL, 1),
      (2, 'UID 공백 농장', '   ', 1);
  `);

  assert.equal(repository.restore(1).status, "restored");

  assert.equal(repository.restore(2).status, "restored");

  console.log("✅ UID 없는 농장 복구 성공");
});
