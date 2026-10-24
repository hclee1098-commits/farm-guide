// ========================================
// 🌱 농사 가이드
// 📸 재배 일지 사진 첨부 여부 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const Database = require("better-sqlite3");

const createDiaryRepository = require("../repositories/diary.repository");

// ========================================
// 1. 재배 일지 사진 존재 여부 테스트
// ========================================

test("삭제되지 않은 사진만 첨부 여부에 반영한다", () => {
  // ========================================
  // 2. 테스트용 메모리 데이터베이스
  // ========================================

  const db = new Database(":memory:");

  try {
    // ========================================
    // 3. 테스트용 테이블 생성
    // ========================================

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
    `);

    // ========================================
    // 4. 테스트용 농장 등록
    // ========================================

    db.exec(`
      INSERT INTO farms (
        id,
        is_deleted
      )
      VALUES (
        1,
        0
      );
    `);

    // ========================================
    // 5. 테스트용 재배 일지 등록
    // ========================================

    db.exec(`
      INSERT INTO farm_diaries (
        id,
        farm_id,
        work_date,
        work_type,
        memo,
        is_deleted
      )
      VALUES (
        1,
        1,
        '2026-10-23',
        '기타',
        '사진 테스트',
        0
      );
    `);

    // ========================================
    // 6. Repository 생성
    // ========================================

    const repository = createDiaryRepository(db);

    // ========================================
    // 7. 사진이 없는 경우
    // ========================================

    let diaries = repository.findAllByFarmId(1);

    assert.equal(diaries.length, 1);

    assert.equal(diaries[0].has_photo, 0);

    console.log("✅ 사진이 없으면 has_photo = 0");

    // ========================================
    // 8. 사진을 등록한 경우
    // ========================================

    db.exec(`
      INSERT INTO diary_photos (
        id,
        diary_id,
        is_deleted
      )
      VALUES (
        1,
        1,
        0
      );
    `);

    diaries = repository.findAllByFarmId(1);

    assert.equal(diaries[0].has_photo, 1);

    console.log("✅ 사진이 등록되면 has_photo = 1");

    // ========================================
    // 9. 사진을 소프트 삭제한 경우
    // ========================================

    db.exec(`
      UPDATE diary_photos

      SET is_deleted = 1

      WHERE id = 1;
    `);

    diaries = repository.findAllByFarmId(1);

    assert.equal(diaries[0].has_photo, 0);

    console.log("✅ 사진을 삭제하면 has_photo = 0");

    // ========================================
    // 10. 삭제된 사진만 존재하는 경우
    // ========================================

    db.exec(`
      INSERT INTO diary_photos (
        id,
        diary_id,
        is_deleted
      )
      VALUES (
        2,
        1,
        1
      );
    `);

    diaries = repository.findAllByFarmId(1);

    assert.equal(diaries[0].has_photo, 0);

    console.log("✅ 삭제된 사진은 첨부 여부에서 제외");

    // ========================================
    // 11. 정상 사진을 다시 등록한 경우
    // ========================================

    db.exec(`
      INSERT INTO diary_photos (
        id,
        diary_id,
        is_deleted
      )
      VALUES (
        3,
        1,
        0
      );
    `);

    diaries = repository.findAllByFarmId(1);

    assert.equal(diaries[0].has_photo, 1);

    console.log("✅ 정상 사진이 다시 등록되면 has_photo = 1");
  } finally {
    // ========================================
    // 12. 테스트 데이터베이스 종료
    // ========================================

    db.close();
  }
});
