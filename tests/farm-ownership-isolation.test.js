const test = require("node:test");

const assert = require("node:assert/strict");

const { DatabaseSync } = require("node:sqlite");

const createFarmRepository = require(
  "../repositories/farm.repository"
);

// ========================================
// 테스트 전용 메모리 데이터베이스
// 실제 farm-guide.db 사용하지 않음
// ========================================

function createTestDatabase() {

  const db = new DatabaseSync(":memory:");

  db.exec(`
    CREATE TABLE farms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      crop TEXT,
      area REAL,
      latitude REAL,
      longitude REAL,
      address TEXT,
      pnu TEXT,
      farm_uid TEXT,
      owner_user_id INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    );

    CREATE UNIQUE INDEX idx_farms_active_uid_unique
    ON farms(TRIM(farm_uid))
    WHERE is_deleted = 0
      AND farm_uid IS NOT NULL
      AND TRIM(farm_uid) <> '';
  `);

  return db;
}

function farmData(name, uid) {
  return {
    name,
    crop: "테스트 작물",
    area: 100,
    latitude: 37,
    longitude: 127,
    address: "테스트 주소",
    pnu: null,
    farm_uid: uid
  };
}

// ========================================
// 사용자별 소유권 격리 테스트
// ========================================

test("사용자별 농장 접근 격리", () => {

  const db = createTestDatabase();

  try {

    const repository = createFarmRepository(db);

    const userA = repository.forUser(1);
    const userB = repository.forUser(2);

    const farmA = userA.create(
      farmData("A 농장", "UID-A")
    );

    const farmB = userB.create(
      farmData("B 농장", "UID-B")
    );

    // ========================================
    // 소유자 저장 확인
    // ========================================

    const owners = db.prepare(`
      SELECT id, owner_user_id
      FROM farms
      ORDER BY id
    `).all();

    assert.deepEqual(
      owners.map(row => row.owner_user_id),
      [1, 2]
    );

    // ========================================
    // 목록 격리
    // ========================================

    assert.equal(userA.findAll().length, 1);
    assert.equal(userB.findAll().length, 1);

    // ========================================
    // 상세 조회 격리
    // ========================================

    assert.equal(
      userA.findById(farmB),
      undefined
    );

    assert.equal(
      userB.findById(farmA),
      undefined
    );

    // ========================================
    // 존재 여부 격리
    // ========================================

    assert.equal(userA.exists(farmB), false);
    assert.equal(userB.exists(farmA), false);

    // ========================================
    // 수정 격리
    // ========================================

    assert.equal(
      userB.update(
        farmA,
        {
          name: "침입 수정",
          crop: "침입",
          area: 999
        }
      ),
      false
    );

    // ========================================
    // 삭제 격리
    // ========================================

    assert.equal(
      userB.remove(farmA),
      false
    );

    // ========================================
    // 본인 삭제 가능
    // ========================================

    assert.equal(
      userA.remove(farmA),
      true
    );

    // ========================================
    // 다른 사용자 복구 차단
    // ========================================

    assert.deepEqual(
      userB.restore(farmA),
      {
        status: "not_found"
      }
    );

    // ========================================
    // 본인 복구 가능
    // ========================================

    assert.deepEqual(
      userA.restore(farmA),
      {
        status: "restored"
      }
    );

    // ========================================
    // 최종 데이터 확인
    // ========================================

    assert.equal(
      userA.findById(farmA).name,
      "A 농장"
    );

    assert.equal(
      userB.findById(farmB).name,
      "B 농장"
    );

  } finally {
    db.close();
  }

});

// ========================================
// UID 충돌 복구 테스트
// ========================================

test("사용자별 복구 시 전역 UID 충돌 방지", () => {

  const db = createTestDatabase();

  try {

    const repository = createFarmRepository(db);

    const userA = repository.forUser(1);
    const userB = repository.forUser(2);

    const farmA = userA.create(
      farmData("A 농장", "SAME-UID")
    );

    assert.equal(
      userA.remove(farmA),
      true
    );

    userB.create(
      farmData("B 농장", "SAME-UID")
    );

    assert.deepEqual(
      userA.restore(farmA),
      {
        status: "uid_conflict"
      }
    );

  } finally {
    db.close();
  }

});

// ========================================
// 잘못된 사용자 ID 차단
// ========================================

test("유효하지 않은 사용자 ID 차단", () => {

  const db = createTestDatabase();

  try {

    const repository = createFarmRepository(db);

    assert.throws(() => {
      repository.forUser(0);
    });

    assert.throws(() => {
      repository.forUser(-1);
    });

    assert.throws(() => {
      repository.forUser("1");
    });

    assert.throws(() => {
      repository.forUser(null);
    });

  } finally {
    db.close();
  }

});