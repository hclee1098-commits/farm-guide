// ========================================
// 🌱 농사 가이드
// 농장 복구 HTTP API 통합 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const express = require("express");

const Database = require("better-sqlite3");

const createFarmRouter = require("../routes/farm.routes");

// ========================================
// 테스트용 데이터베이스
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

    INSERT INTO farms (
      id,
      name,
      farm_uid,
      is_deleted,
      deleted_at
    )

    VALUES
      (
        1,
        '복구 대상 농장',
        'FARM-001',
        1,
        CURRENT_TIMESTAMP
      ),

      (
        2,
        '활성 농장',
        'FARM-002',
        0,
        NULL
      ),

      (
        3,
        'UID 충돌 농장',
        ' FARM-002 ',
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

  return db;
}

// ========================================
// 농장 복구 HTTP API 통합 테스트
// ========================================

test("농장 복구 HTTP API 통합 테스트", async (t) => {
  const db = createTestDatabase();

  const app = express();

  app.use(express.json());

  app.use("/api/farms", createFarmRouter(db));

  const server = app.listen(0);

  const address = server.address();

  const baseUrl = `http://127.0.0.1:${address.port}`;

  // ========================================
  // 테스트 종료 시 자원 정리
  // ========================================

  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });

    db.close();
  });

  // ========================================
  // 1. 삭제된 농장 복구 성공
  // ========================================

  await t.test("삭제된 농장 복구 성공", async () => {
    const response = await fetch(`${baseUrl}/api/farms/1/restore`, {
      method: "POST",
    });

    const body = await response.json();

    assert.equal(response.status, 200);

    assert.equal(body.success, true);

    assert.equal(body.farmId, 1);

    const farm = db
      .prepare(
        `
      SELECT is_deleted, deleted_at
      FROM farms
      WHERE id = 1
    `,
      )
      .get();

    assert.equal(farm.is_deleted, 0);

    assert.equal(farm.deleted_at, null);

    console.log("✅ 농장 HTTP 복구 성공");
  });

  // ========================================
  // 2. 중복 복구 차단
  // ========================================

  await t.test("이미 복구된 농장 중복 복구 차단", async () => {
    const response = await fetch(`${baseUrl}/api/farms/1/restore`, {
      method: "POST",
    });

    assert.equal(response.status, 404);

    console.log("✅ 농장 중복 복구 차단");
  });

  // ========================================
  // 3. UID 충돌 복구 차단
  // ========================================

  await t.test("UID 충돌 시 복구 차단", async () => {
    const response = await fetch(`${baseUrl}/api/farms/3/restore`, {
      method: "POST",
    });

    assert.equal(response.status, 409);

    const farm = db
      .prepare(
        `
      SELECT is_deleted
      FROM farms
      WHERE id = 3
    `,
      )
      .get();

    assert.equal(farm.is_deleted, 1);

    console.log("✅ UID 충돌 복구 차단");
    console.log("✅ 삭제 상태 유지 성공");
  });

  // ========================================
  // 4. 존재하지 않는 농장 복구 차단
  // ========================================

  await t.test("존재하지 않는 농장 복구 차단", async () => {
    const response = await fetch(`${baseUrl}/api/farms/999/restore`, {
      method: "POST",
    });

    assert.equal(response.status, 404);

    console.log("✅ 존재하지 않는 농장 복구 차단");
  });

  // ========================================
  // 5. 잘못된 농장 ID 차단
  // ========================================

  await t.test("잘못된 농장 ID 차단", async () => {
    const invalidIds = ["abc", "0", "-1", "1.5", "99999999999999999999"];

    for (const farmId of invalidIds) {
      const response = await fetch(`${baseUrl}/api/farms/${farmId}/restore`, {
        method: "POST",
      });

      assert.equal(response.status, 400);
    }

    console.log("✅ 잘못된 농장 ID 차단");
  });

  // ========================================
  // 6. 하위 데이터 무결성 확인
  // ========================================

  await t.test("복구 후 재배 일지와 사진 데이터 보존", () => {
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

    console.log("✅ 기존 재배 일지 데이터 보존");
    console.log("✅ 기존 사진 원본 데이터 보존");
  });

  console.log("================================");
  console.log("🌱 농장 복구 HTTP API 테스트 완료!");
  console.log("================================");
});
