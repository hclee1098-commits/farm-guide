// ========================================
// 🌱 농사 가이드
// 📖 재배 일지 복구 통합 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const express = require("express");

const Database = require("better-sqlite3");

const createDiaryRouter = require("../routes/diary.routes");

// ========================================
// 테스트용 데이터베이스
// ========================================

function createTestDatabase() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE farms (
      id INTEGER PRIMARY KEY,
      name TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    );

    CREATE TABLE farm_diaries (
      id INTEGER PRIMARY KEY,
      farm_id INTEGER NOT NULL,
      work_date TEXT,
      work_type TEXT,
      memo TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    );

    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY,
      diary_id INTEGER NOT NULL,
      mime_type TEXT,
      image_data BLOB,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    );

    INSERT INTO farms (
      id,
      name,
      is_deleted
    )

    VALUES
      (1, '정상 농장', 0),
      (2, '삭제된 농장', 1),
      (3, '다른 정상 농장', 0);

    INSERT INTO farm_diaries (
      id,
      farm_id,
      work_date,
      work_type,
      memo,
      is_deleted,
      deleted_at
    )

    VALUES
      (
        1,
        1,
        '2026-10-01',
        '파종',
        '복구 테스트',
        1,
        CURRENT_TIMESTAMP
      ),

      (
        2,
        2,
        '2026-10-02',
        '관수',
        '삭제된 농장의 일지',
        1,
        CURRENT_TIMESTAMP
      ),

      (
        3,
        1,
        '2026-10-03',
        '수확',
        '정상 일지',
        0,
        NULL
      ),

      (
        4,
        3,
        '2026-10-04',
        '관수',
        '다른 농장의 일지',
        1,
        CURRENT_TIMESTAMP
      );

    INSERT INTO diary_photos (
      id,
      diary_id,
      mime_type,
      image_data,
      is_deleted
    )

    VALUES
      (1, 1, 'image/png', X'01020304', 0),
      (2, 1, 'image/png', X'05060708', 1),
      (3, 3, 'image/png', X'090A0B0C', 0);
  `);

  return db;
}

// ========================================
// 재배 일지 복구 HTTP API 통합 테스트
// ========================================

test("재배 일지 복구 HTTP API 통합 테스트", async (t) => {
  const db = createTestDatabase();

  const app = express();

  app.use(express.json());

  app.use("/api/farms", createDiaryRouter(db));

  const server = app.listen(0);

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // ========================================
  // 테스트 종료 후 자원 정리
  // ========================================

  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });

    db.close();
  });

  // ========================================
  // 1. 삭제된 재배 일지 복구 성공
  // ========================================

  await t.test("삭제된 재배 일지 복구 성공", async () => {
    const response = await fetch(`${baseUrl}/api/farms/1/diaries/1/restore`, {
      method: "POST",
    });

    const body = await response.json();

    assert.equal(response.status, 200);

    assert.equal(body.success, true);

    assert.equal(body.diaryId, 1);

    const diary = db
      .prepare(
        `
      SELECT is_deleted, deleted_at
      FROM farm_diaries
      WHERE id = 1
    `,
      )
      .get();

    assert.equal(diary.is_deleted, 0);

    assert.equal(diary.deleted_at, null);

    console.log("✅ 재배 일지 복구 성공");
  });

  // ========================================
  // 2. 중복 복구 차단
  // ========================================

  await t.test("재배 일지 중복 복구 차단", async () => {
    const response = await fetch(`${baseUrl}/api/farms/1/diaries/1/restore`, {
      method: "POST",
    });

    assert.equal(response.status, 404);

    console.log("✅ 중복 복구 차단 성공");
  });

  // ========================================
  // 3. 삭제된 농장 복구 차단
  // ========================================

  await t.test("삭제된 농장의 일지 복구 차단", async () => {
    const response = await fetch(`${baseUrl}/api/farms/2/diaries/2/restore`, {
      method: "POST",
    });

    assert.equal(response.status, 409);

    const diary = db
      .prepare(
        `
      SELECT is_deleted
      FROM farm_diaries
      WHERE id = 2
    `,
      )
      .get();

    assert.equal(diary.is_deleted, 1);

    console.log("✅ 삭제된 농장 복구 차단");
    console.log("✅ 기존 삭제 상태 유지");
  });

  // ========================================
  // 4. 다른 농장 ID 접근 차단
  // ========================================

  await t.test("다른 농장 ID 복구 차단", async () => {
    const response = await fetch(`${baseUrl}/api/farms/1/diaries/4/restore`, {
      method: "POST",
    });

    assert.equal(response.status, 404);

    const diary = db
      .prepare(
        `
      SELECT is_deleted
      FROM farm_diaries
      WHERE id = 4
    `,
      )
      .get();

    assert.equal(diary.is_deleted, 1);

    console.log("✅ 다른 농장 ID 복구 차단");
  });

  // ========================================
  // 5. 존재하지 않는 일지 차단
  // ========================================

  await t.test("존재하지 않는 일지 복구 차단", async () => {
    const response = await fetch(`${baseUrl}/api/farms/1/diaries/999/restore`, {
      method: "POST",
    });

    assert.equal(response.status, 404);

    console.log("✅ 존재하지 않는 일지 복구 차단");
  });

  // ========================================
  // 6. 잘못된 ID 차단
  // ========================================

  await t.test("잘못된 ID 복구 차단", async () => {
    const invalidPaths = [
      "/api/farms/abc/diaries/1/restore",
      "/api/farms/0/diaries/1/restore",
      "/api/farms/1/diaries/abc/restore",
      "/api/farms/1/diaries/0/restore",
      "/api/farms/1/diaries/1.5/restore",
      "/api/farms/1/diaries/99999999999999999999/restore",
    ];

    for (const path of invalidPaths) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
      });

      assert.equal(response.status, 400);
    }

    console.log("✅ 잘못된 ID 복구 차단");
  });

  // ========================================
  // 7. 복구 후 사진 데이터 무결성
  // ========================================

  await t.test("복구 후 사진 데이터 무결성 유지", () => {
    const photos = db
      .prepare(
        `
      SELECT *
      FROM diary_photos
      WHERE diary_id = 1
      ORDER BY id
    `,
      )
      .all();

    assert.equal(photos.length, 2);

    // 정상 사진 유지
    assert.equal(photos[0].is_deleted, 0);

    assert.deepEqual(photos[0].image_data, Buffer.from([1, 2, 3, 4]));

    // 기존에 삭제된 사진은 복구하지 않음
    assert.equal(photos[1].is_deleted, 1);

    assert.deepEqual(photos[1].image_data, Buffer.from([5, 6, 7, 8]));

    console.log("✅ 기존 사진 원본 데이터 보존");

    console.log("✅ 삭제된 사진 상태 유지");
  });

  // ========================================
  // 8. 복구 후 일지 목록 조회
  // ========================================

  await t.test("복구된 일지 목록 조회 성공", async () => {
    const response = await fetch(`${baseUrl}/api/farms/1/diaries`);

    // ========================================
    // 1. HTTP 응답 확인
    // ========================================

    assert.equal(response.status, 200);

    const body = await response.json();

    // ========================================
    // 2. 실제 API 응답 구조 확인
    // ========================================

    console.log("📖 재배 일지 목록 API 응답:", JSON.stringify(body, null, 2));

    // ========================================
    // 3. 응답에서 일지 배열 추출
    // ========================================

    const diaries = Array.isArray(body) ? body : body.diaries;

    assert.ok(Array.isArray(diaries), "재배 일지 목록은 배열이어야 합니다.");

    // ========================================
    // 4. 복구된 일지 확인
    // ========================================

    const restoredDiary = diaries.find((diary) => Number(diary.id) === 1);

    assert.ok(restoredDiary, "복구된 재배 일지가 목록에 포함되어야 합니다.");

    // ========================================
    // 5. 기존 정상 일지도 유지되는지 확인
    // ========================================

    const existingDiary = diaries.find((diary) => Number(diary.id) === 3);

    assert.ok(existingDiary, "기존 정상 재배 일지가 유지되어야 합니다.");

    console.log("✅ 복구된 재배 일지 목록 포함 확인");

    console.log("✅ 기존 정상 재배 일지 목록 유지");

    console.log("✅ 재배 일지 목록 API 정상");
  });

  // ========================================
  // 9. 다른 정상 일지 보존
  // ========================================

  await t.test("기존 정상 일지 데이터 보존", () => {
    const diary = db
      .prepare(
        `
      SELECT *
      FROM farm_diaries
      WHERE id = 3
    `,
      )
      .get();

    assert.equal(diary.is_deleted, 0);

    assert.equal(diary.memo, "정상 일지");

    console.log("✅ 기존 정상 재배 일지 보존");
  });

  console.log("================================");

  console.log("📖 재배 일지 복구 통합 테스트 완료!");

  console.log("================================");
});
