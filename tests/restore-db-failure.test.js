// ========================================
// 🌱 농사 가이드
// 농장·일지·사진 복구 DB 오류 무결성 테스트
// ========================================

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const Database = require("better-sqlite3");

const createFarmRouter = require("../routes/farm.routes");
const createDiaryRouter = require("../routes/diary.routes");
const createPhotoRouter = require("../routes/diary-photo.routes");

// ========================================
// 1. 테스트 이미지 생성
// ========================================

function createTestImage(content) {
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    Buffer.from(content),
  ]);
}

// ========================================
// 2. SHA-256 해시 생성
// ========================================

function createHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ========================================
// 3. 테스트 환경 생성
// ========================================

async function createEnvironment(options = {}) {
  const db = new Database(":memory:");

  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE farms (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
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

    CREATE TABLE farm_diaries (
      id INTEGER PRIMARY KEY,
      farm_id INTEGER NOT NULL,
      work_date TEXT NOT NULL,
      work_type TEXT,
      memo TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (farm_id)
        REFERENCES farms(id)
    );

    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diary_id INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      image_data BLOB,
      storage_provider TEXT,
      storage_key TEXT,
      file_size INTEGER,
      content_hash TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (diary_id)
        REFERENCES farm_diaries(id)
    );

    CREATE UNIQUE INDEX idx_farms_active_uid_unique
    ON farms (TRIM(farm_uid))
    WHERE is_deleted = 0
      AND farm_uid IS NOT NULL
      AND TRIM(farm_uid) <> '';
  `);

  // ========================================
  // 테스트 데이터 생성
  // ========================================

  const farmDeleted = options.farmDeleted ? 1 : 0;
  const diaryDeleted = options.diaryDeleted ? 1 : 0;
  const photoDeleted = options.photoDeleted ? 1 : 0;

  db.prepare(
    `
    INSERT INTO farms (
      id, name, farm_uid, is_deleted, deleted_at
    )
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(
    1,
    "복구 오류 테스트 농장",
    "RESTORE-ERROR-001",
    farmDeleted,
    farmDeleted ? "2026-10-01 10:00:00" : null,
  );

  db.prepare(
    `
    INSERT INTO farms (
      id, name, farm_uid
    )
    VALUES (2, '정상 유지 농장', 'RESTORE-ERROR-002')
  `,
  ).run();

  db.prepare(
    `
    INSERT INTO farm_diaries (
      id, farm_id, work_date,
      work_type, memo, is_deleted, deleted_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    1,
    1,
    "2026-10-01",
    "파종",
    "복구 오류 테스트",
    diaryDeleted,
    diaryDeleted ? "2026-10-01 10:00:00" : null,
  );

  db.prepare(
    `
    INSERT INTO farm_diaries (
      id, farm_id, work_date, work_type, memo
    )
    VALUES (2, 2, '2026-10-02', '관수', '정상 유지')
  `,
  ).run();

  const originalImage = createTestImage("restore-db-failure-photo");

  const originalHash = createHash(originalImage);

  db.prepare(
    `
    INSERT INTO diary_photos (
      id,
      diary_id,
      mime_type,
      image_data,
      content_hash,
      is_deleted,
      deleted_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    1,
    1,
    "image/png",
    originalImage,
    originalHash,
    photoDeleted,
    photoDeleted ? "2026-10-01 10:00:00" : null,
  );

  const otherImage = createTestImage("normal-photo");

  db.prepare(
    `
    INSERT INTO diary_photos (
      id, diary_id, mime_type, image_data, content_hash
    )
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(2, 2, "image/png", otherImage, createHash(otherImage));

  // ========================================
  // HTTP 테스트 서버
  // ========================================

  const app = express();

  app.use(express.json());

  app.use("/api/farms", createFarmRouter(db));
  app.use("/api/farms", createDiaryRouter(db));
  app.use("/api/farms", createPhotoRouter(db));

  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // ========================================
  // HTTP 요청 함수
  // ========================================

  async function request(method, path) {
    return fetch(`${baseUrl}${path}`, { method });
  }

  // ========================================
  // DB 상태 조회
  // ========================================

  function getRow(table, id = 1) {
    const allowedTables = ["farms", "farm_diaries", "diary_photos"];

    if (!allowedTables.includes(table)) {
      throw new Error("허용되지 않은 테이블");
    }

    return db
      .prepare(
        `
      SELECT *
      FROM ${table}
      WHERE id = ?
    `,
      )
      .get(id);
  }

  // ========================================
  // DB 오류 강제 발생
  // ========================================

  function injectRestoreFailure(table) {
    const allowedTables = ["farms", "farm_diaries", "diary_photos"];

    if (!allowedTables.includes(table)) {
      throw new Error("허용되지 않은 테이블");
    }

    db.exec(`
      CREATE TRIGGER block_restore
      BEFORE UPDATE OF is_deleted ON ${table}

      WHEN OLD.id = 1
        AND OLD.is_deleted = 1
        AND NEW.is_deleted = 0

      BEGIN
        SELECT RAISE(
          ABORT,
          'TEST_RESTORE_DB_FAILURE'
        );
      END;
    `);
  }

  function removeRestoreFailure() {
    db.exec("DROP TRIGGER IF EXISTS block_restore");
  }

  // ========================================
  // 테스트 환경 정리
  // ========================================

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    db.close();
  }

  return {
    db,
    request,
    getRow,
    injectRestoreFailure,
    removeRestoreFailure,
    close,
    originalImage,
    originalHash,
  };
}

// ========================================
// 4. 농장 복구 DB 오류 테스트
// ========================================

test("농장 복구 DB 오류 시 데이터 보존", async (t) => {
  const env = await createEnvironment({
    farmDeleted: true,
  });

  t.after(() => env.close());

  env.injectRestoreFailure("farms");

  const response = await env.request("POST", "/api/farms/1/restore");

  assert.equal(response.status, 500);

  const farm = env.getRow("farms");

  assert.equal(farm.is_deleted, 1);
  assert.ok(farm.deleted_at);

  assert.equal(env.getRow("farm_diaries").is_deleted, 0);

  assert.equal(env.getRow("farms", 2).is_deleted, 0);

  console.log("✅ 농장 복구 DB 오류 감지");
  console.log("✅ 농장 삭제 상태 보존");
  console.log("✅ 기존 재배 일지 데이터 보존");
  console.log("✅ 다른 농장 데이터 보존");

  // 오류 제거 후 재시도
  env.removeRestoreFailure();

  const retry = await env.request("POST", "/api/farms/1/restore");

  assert.equal(retry.status, 200);

  assert.equal(env.getRow("farms").is_deleted, 0);

  console.log("✅ 농장 복구 재시도 성공");
});

// ========================================
// 5. 재배 일지 복구 DB 오류 테스트
// ========================================

test("재배 일지 복구 DB 오류 시 데이터 보존", async (t) => {
  const env = await createEnvironment({
    diaryDeleted: true,
  });

  t.after(() => env.close());

  env.injectRestoreFailure("farm_diaries");

  const response = await env.request("POST", "/api/farms/1/diaries/1/restore");

  assert.equal(response.status, 500);

  const diary = env.getRow("farm_diaries");

  assert.equal(diary.is_deleted, 1);
  assert.ok(diary.deleted_at);

  assert.equal(env.getRow("farms").is_deleted, 0);

  assert.equal(env.getRow("diary_photos").is_deleted, 0);

  assert.equal(env.getRow("farm_diaries", 2).is_deleted, 0);

  console.log("✅ 재배 일지 복구 DB 오류 감지");
  console.log("✅ 재배 일지 삭제 상태 보존");
  console.log("✅ 기존 사진 데이터 보존");
  console.log("✅ 다른 재배 일지 보존");

  // 오류 제거 후 재시도
  env.removeRestoreFailure();

  const retry = await env.request("POST", "/api/farms/1/diaries/1/restore");

  assert.equal(retry.status, 200);

  assert.equal(env.getRow("farm_diaries").is_deleted, 0);

  console.log("✅ 재배 일지 복구 재시도 성공");
});

// ========================================
// 6. 사진 복구 DB 오류 테스트
// ========================================

test("사진 복구 DB 오류 시 원본 데이터 보존", async (t) => {
  const env = await createEnvironment({
    photoDeleted: true,
  });

  t.after(() => env.close());

  env.injectRestoreFailure("diary_photos");

  const response = await env.request(
    "PATCH",
    "/api/farms/1/diaries/1/photos/1/restore",
  );

  assert.equal(response.status, 500);

  const photo = env.getRow("diary_photos");

  assert.equal(photo.is_deleted, 1);
  assert.ok(photo.deleted_at);

  assert.equal(photo.content_hash, env.originalHash);

  assert.deepEqual(photo.image_data, env.originalImage);

  assert.equal(env.getRow("diary_photos", 2).is_deleted, 0);

  console.log("✅ 사진 복구 DB 오류 감지");
  console.log("✅ 사진 삭제 상태 보존");
  console.log("✅ SHA-256 해시 보존");
  console.log("✅ 원본 이미지 데이터 보존");
  console.log("✅ 다른 사진 데이터 보존");

  // 오류 제거 후 재시도
  env.removeRestoreFailure();

  const retry = await env.request(
    "PATCH",
    "/api/farms/1/diaries/1/photos/1/restore",
  );

  assert.equal(retry.status, 200);

  const restored = env.getRow("diary_photos");

  assert.equal(restored.is_deleted, 0);
  assert.equal(restored.deleted_at, null);

  assert.equal(restored.content_hash, env.originalHash);

  assert.deepEqual(restored.image_data, env.originalImage);

  console.log("✅ 사진 복구 재시도 성공");
  console.log("✅ 복구 후 원본 이미지 무결성 유지");
});
