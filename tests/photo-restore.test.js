// ========================================
// 📸 사진 소프트 삭제 복구 통합 테스트
// ========================================

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Database = require("better-sqlite3");

const createDiaryPhotoRouter = require("../routes/diary-photo.routes");

// ========================================
// 테스트 환경 생성
// ========================================

async function createFixture(t) {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE farms (
      id INTEGER PRIMARY KEY,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE farm_diaries (
      id INTEGER PRIMARY KEY,
      farm_id INTEGER NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO farms (id)
    VALUES (1), (2);

    INSERT INTO farm_diaries (id, farm_id)
    VALUES (1, 1), (2, 2);
  `);

  const insertPhoto = db.prepare(`
    INSERT INTO diary_photos (
      diary_id,
      mime_type,
      image_data,
      content_hash,
      is_deleted,
      deleted_at
    )
    VALUES (?, 'image/png', ?, ?, ?, ?)
  `);

  const originalImage = Buffer.from("original-photo-data");

  const deletedPhotoId = Number(
    insertPhoto.run(1, originalImage, "a".repeat(64), 1, "2026-10-01 10:00:00")
      .lastInsertRowid,
  );

  insertPhoto.run(1, Buffer.from("active-photo"), "b".repeat(64), 0, null);

  const app = express();

  app.use("/api/farms", createDiaryPhotoRouter(db));

  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    db.close();
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const restoreUrl = `${baseUrl}/api/farms/1/diaries/1/photos/${deletedPhotoId}/restore`;

  return {
    db,
    baseUrl,
    restoreUrl,
    deletedPhotoId,
    originalImage,
    insertPhoto,
  };
}

// ========================================
// 1. 정상 복구
// ========================================

test("삭제된 사진 복구 성공", async (t) => {
  const fixture = await createFixture(t);

  const response = await fetch(fixture.restoreUrl, {
    method: "PATCH",
  });

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.success, true);

  const photo = fixture.db
    .prepare(
      `
    SELECT *
    FROM diary_photos
    WHERE id = ?
  `,
    )
    .get(fixture.deletedPhotoId);

  assert.equal(photo.is_deleted, 0);
  assert.equal(photo.deleted_at, null);

  assert.deepEqual(photo.image_data, fixture.originalImage);

  console.log("✅ 삭제된 사진 복구 성공");
  console.log("✅ 사진 원본 데이터 보존");
});

// ========================================
// 2. 중복 복구 차단
// ========================================

test("이미 복구된 사진 중복 복구 차단", async (t) => {
  const fixture = await createFixture(t);

  const first = await fetch(fixture.restoreUrl, {
    method: "PATCH",
  });

  assert.equal(first.status, 200);

  const second = await fetch(fixture.restoreUrl, {
    method: "PATCH",
  });

  assert.equal(second.status, 404);

  console.log("✅ 사진 중복 복구 차단");
});

// ========================================
// 3. 삭제된 농장 복구 차단
// ========================================

test("삭제된 농장의 사진 복구 차단", async (t) => {
  const fixture = await createFixture(t);

  fixture.db
    .prepare(
      `
    UPDATE farms
    SET is_deleted = 1
    WHERE id = 1
  `,
    )
    .run();

  const response = await fetch(fixture.restoreUrl, {
    method: "PATCH",
  });

  assert.equal(response.status, 404);

  const photo = fixture.db
    .prepare(
      `
    SELECT is_deleted
    FROM diary_photos
    WHERE id = ?
  `,
    )
    .get(fixture.deletedPhotoId);

  assert.equal(photo.is_deleted, 1);

  console.log("✅ 삭제된 농장 사진 복구 차단");
});

// ========================================
// 4. 삭제된 일지 복구 차단
// ========================================

test("삭제된 일지의 사진 복구 차단", async (t) => {
  const fixture = await createFixture(t);

  fixture.db
    .prepare(
      `
    UPDATE farm_diaries
    SET is_deleted = 1
    WHERE id = 1
  `,
    )
    .run();

  const response = await fetch(fixture.restoreUrl, {
    method: "PATCH",
  });

  assert.equal(response.status, 404);

  const photo = fixture.db
    .prepare(
      `
    SELECT is_deleted
    FROM diary_photos
    WHERE id = ?
  `,
    )
    .get(fixture.deletedPhotoId);

  assert.equal(photo.is_deleted, 1);

  console.log("✅ 삭제된 일지 사진 복구 차단");
});

// ========================================
// 5. 다른 농장 접근 차단
// ========================================

test("다른 농장 ID로 사진 복구 차단", async (t) => {
  const fixture = await createFixture(t);

  const response = await fetch(
    `${fixture.baseUrl}/api/farms/2/diaries/2/photos/${fixture.deletedPhotoId}/restore`,
    { method: "PATCH" },
  );

  assert.equal(response.status, 404);

  console.log("✅ 다른 농장 사진 복구 차단");
});

// ========================================
// 6. 사진 10장 제한
// ========================================

test("사진 10장 초과 복구 차단", async (t) => {
  const fixture = await createFixture(t);

  // 이미 활성 사진 1장이 있으므로 9장 추가
  for (let i = 0; i < 9; i++) {
    fixture.insertPhoto.run(
      1,
      Buffer.from(`photo-${i}`),
      String(i).padStart(64, "0"),
      0,
      null,
    );
  }

  const response = await fetch(fixture.restoreUrl, {
    method: "PATCH",
  });

  assert.equal(response.status, 409);

  const photo = fixture.db
    .prepare(
      `
    SELECT is_deleted
    FROM diary_photos
    WHERE id = ?
  `,
    )
    .get(fixture.deletedPhotoId);

  assert.equal(photo.is_deleted, 1);

  console.log("✅ 사진 10장 초과 복구 차단");
});

// ========================================
// 7. 동일 해시 사진 복구 차단
// ========================================

test("동일 해시 사진 중복 복구 차단", async (t) => {
  const fixture = await createFixture(t);

  fixture.insertPhoto.run(
    1,
    Buffer.from("duplicate-photo"),
    "a".repeat(64),
    0,
    null,
  );

  const response = await fetch(fixture.restoreUrl, {
    method: "PATCH",
  });

  assert.equal(response.status, 409);

  const photo = fixture.db
    .prepare(
      `
    SELECT is_deleted
    FROM diary_photos
    WHERE id = ?
  `,
    )
    .get(fixture.deletedPhotoId);

  assert.equal(photo.is_deleted, 1);

  console.log("✅ 동일 해시 사진 중복 복구 차단");
});

// ========================================
// 8. 잘못된 ID 차단
// ========================================

test("잘못된 사진 ID 복구 차단", async (t) => {
  const fixture = await createFixture(t);

  const response = await fetch(
    `${fixture.baseUrl}/api/farms/1/diaries/1/photos/abc/restore`,
    { method: "PATCH" },
  );

  assert.equal(response.status, 400);

  console.log("✅ 잘못된 사진 ID 복구 차단");
});

// ========================================
// 9. 존재하지 않는 사진 차단
// ========================================

test("존재하지 않는 사진 복구 차단", async (t) => {
  const fixture = await createFixture(t);

  const response = await fetch(
    `${fixture.baseUrl}/api/farms/1/diaries/1/photos/99999/restore`,
    { method: "PATCH" },
  );

  assert.equal(response.status, 404);

  console.log("✅ 존재하지 않는 사진 복구 차단");
});
