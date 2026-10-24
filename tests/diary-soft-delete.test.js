// ========================================
// 🌱 농사 가이드
// 🧪 재배 일지 소프트 삭제 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const Database = require("better-sqlite3");

const createDiaryRepository = require("../repositories/diary.repository");

// ========================================
// 1. 테스트 데이터베이스 생성
// ========================================

function createTestDatabase() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE farms (
      id INTEGER PRIMARY KEY,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE farm_diaries (
      id INTEGER PRIMARY KEY,
      farm_id INTEGER NOT NULL,
      work_date TEXT NOT NULL,
      work_type TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    );

    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY,
      diary_id INTEGER NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );

    INSERT INTO farms (
      id,
      is_deleted
    )
    VALUES (1, 0);

    INSERT INTO farm_diaries (
      id,
      farm_id,
      work_date,
      work_type,
      memo
    )
    VALUES
      (
        1,
        1,
        '2026-10-23',
        '물주기',
        '첫 번째 재배 일지'
      ),
      (
        2,
        1,
        '2026-10-22',
        '기타',
        '두 번째 재배 일지'
      );
  `);

  return db;
}

// ========================================
// 2. 재배 일지 소프트 삭제 테스트
// ========================================

test("삭제된 재배 일지는 목록에서 제외한다", () => {
  const db = createTestDatabase();

  try {
    const repository = createDiaryRepository(db);

    // ========================================
    // 1. 초기 재배 일지 확인
    // ========================================

    let diaries = repository.findAllByFarmId(1);

    assert.equal(diaries.length, 2);

    console.log("✅ 초기 재배 일지 2개 확인");

    // ========================================
    // 2. 재배 일지 삭제
    // ========================================

    const deleted = repository.remove(1, 1);

    assert.equal(deleted, true);

    console.log("✅ 재배 일지 소프트 삭제 성공");

    // ========================================
    // 3. 삭제 상태 확인
    // ========================================

    const deletedDiary = db
      .prepare(
        `
        SELECT
          is_deleted,
          deleted_at

        FROM farm_diaries

        WHERE id = ?
      `,
      )
      .get(1);

    assert.equal(deletedDiary.is_deleted, 1);

    assert.ok(deletedDiary.deleted_at);

    console.log("✅ 삭제 상태 및 삭제 시간 기록 확인");

    // ========================================
    // 4. 목록에서 삭제된 일지 제외 확인
    // ========================================

    diaries = repository.findAllByFarmId(1);

    assert.equal(diaries.length, 1);

    assert.equal(diaries[0].id, 2);

    console.log("✅ 삭제된 재배 일지 목록 제외 확인");

    // ========================================
    // 5. 삭제된 일지 상세 조회 차단
    // ========================================

    const diary = repository.findById(1, 1);

    assert.equal(diary, undefined);

    console.log("✅ 삭제된 재배 일지 상세 조회 차단");

    // ========================================
    // 6. 중복 삭제 방지
    // ========================================

    const deletedAgain = repository.remove(1, 1);

    assert.equal(deletedAgain, false);

    console.log("✅ 이미 삭제된 재배 일지 중복 삭제 방지");
  } finally {
    db.close();
  }
});

// ========================================
// 3. 삭제된 농장의 재배 일지 조회 테스트
// ========================================

test("삭제된 농장의 재배 일지는 조회하지 않는다", () => {
  const db = createTestDatabase();

  try {
    const repository = createDiaryRepository(db);

    // ========================================
    // 1. 농장 소프트 삭제
    // ========================================

    db.prepare(
      `
      UPDATE farms

      SET is_deleted = 1

      WHERE id = ?
    `,
    ).run(1);

    // ========================================
    // 2. 재배 일지 목록 조회
    // ========================================

    const diaries = repository.findAllByFarmId(1);

    assert.equal(diaries.length, 0);

    console.log("✅ 삭제된 농장의 재배 일지 목록 조회 차단");

    // ========================================
    // 3. 재배 일지 상세 조회
    // ========================================

    const diary = repository.findById(1, 1);

    assert.equal(diary, undefined);

    console.log("✅ 삭제된 농장의 재배 일지 상세 조회 차단");

    // ========================================
    // 4. 삭제된 농장에 재배 일지 등록 방지
    // ========================================

    assert.throws(
      () => {
        repository.create(1, {
          work_date: "2026-10-23",
          work_type: "기타",
          memo: "등록 차단 테스트",
        });
      },
      (error) => error.code === "FARM_NOT_FOUND",
    );

    console.log("✅ 삭제된 농장에 재배 일지 등록 차단");
  } finally {
    db.close();
  }
});
