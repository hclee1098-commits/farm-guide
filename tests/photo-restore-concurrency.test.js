// ========================================
// 🌱 농사 가이드
// 📸 사진 동시 복구 및 최대 10장 제한 테스트
// ========================================

// ========================================
// 1. 모듈 불러오기
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const crypto = require("node:crypto");

const express = require("express");

const Database = require("better-sqlite3");

const createPhotoRouter = require("../routes/diary-photo.routes");

// ========================================
// 2. 테스트 이미지 생성
// ========================================

function createTestImage(content) {
  const header = Buffer.from("89504e470d0a1a0a", "hex");

  return Buffer.concat([header, Buffer.from(content)]);
}

// ========================================
// 3. SHA-256 해시 생성
// ========================================

function createHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ========================================
// 4. 테스트 환경 생성
// ========================================

async function createEnvironment() {
  // ========================================
  // 테스트 전용 SQLite
  // ========================================

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
        REFERENCES farm_diaries(id),

      CHECK (
        image_data IS NOT NULL
        OR storage_key IS NOT NULL
      )
    );
  `);

  // ========================================
  // 테스트 농장 및 일지 생성
  // ========================================

  db.exec(`
    INSERT INTO farms (
      id,
      name,
      farm_uid
    )
    VALUES (
      1,
      '동시 복구 테스트 농장',
      'CONCURRENT-001'
    );

    INSERT INTO farm_diaries (
      id,
      farm_id,
      work_date,
      work_type,
      memo
    )
    VALUES (
      1,
      1,
      '2026-10-01',
      '파종',
      '사진 동시 복구 테스트'
    );
  `);

  // ========================================
  // HTTP 테스트 서버
  // ========================================

  const app = express();

  app.use(express.json());

  app.use("/api/farms", createPhotoRouter(db));

  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // ========================================
  // HTTP 요청
  // ========================================

  async function request(method, path) {
    return fetch(`${baseUrl}${path}`, {
      method,
    });
  }

  // ========================================
  // 사진 생성
  // ========================================

  function insertPhoto(content, deleted = false) {
    const image = createTestImage(content);

    const hash = createHash(image);

    const result = db
      .prepare(
        `
      INSERT INTO diary_photos (
        diary_id,
        mime_type,
        image_data,
        content_hash,
        is_deleted,
        deleted_at
      )

      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        1,
        "image/png",
        image,
        hash,
        deleted ? 1 : 0,
        deleted ? "2026-10-01 10:00:00" : null,
      );

    return {
      id: Number(result.lastInsertRowid),
      image,
      hash,
    };
  }

  // ========================================
  // 사진 조회
  // ========================================

  function getPhoto(photoId) {
    return db
      .prepare(
        `
      SELECT *
      FROM diary_photos
      WHERE id = ?
    `,
      )
      .get(photoId);
  }

  // ========================================
  // 활성 사진 개수
  // ========================================

  function countActivePhotos() {
    return db
      .prepare(
        `
      SELECT COUNT(*) AS count

      FROM diary_photos

      WHERE diary_id = 1
        AND is_deleted = 0
    `,
      )
      .get().count;
  }

  // ========================================
  // 전체 사진 개수
  // ========================================

  function countAllPhotos() {
    return db
      .prepare(
        `
      SELECT COUNT(*) AS count

      FROM diary_photos

      WHERE diary_id = 1
    `,
      )
      .get().count;
  }

  // ========================================
  // 사진 복구 요청
  // ========================================

  async function restorePhoto(photoId) {
    return request("PATCH", `/api/farms/1/diaries/1/photos/${photoId}/restore`);
  }

  // ========================================
  // 테스트 환경 정리
  // ========================================

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    db.close();
  }

  return {
    db,
    request,
    insertPhoto,
    getPhoto,
    countActivePhotos,
    countAllPhotos,
    restorePhoto,
    close,
  };
}

// ========================================
// 테스트 1
// 동일 사진 동시 복구 요청
// ========================================

test("동일 사진 동시 복구 요청 중 하나만 성공", async (t) => {
  const env = await createEnvironment();

  t.after(() => env.close());

  // ========================================
  // 1. 삭제된 사진 생성
  // ========================================

  const original = env.insertPhoto("concurrent-restore-photo", true);

  assert.equal(env.countActivePhotos(), 0);

  console.log("✅ 삭제된 테스트 사진 생성");

  // ========================================
  // 2. 복구 요청 2개 동시 실행
  // ========================================

  const responses = await Promise.all([
    env.restorePhoto(original.id),
    env.restorePhoto(original.id),
  ]);

  const statuses = responses.map((response) => response.status);

  console.log("📸 동시 복구 HTTP 상태:", statuses);

  // ========================================
  // 3. 성공 요청 개수
  // ========================================

  const successCount = statuses.filter((status) => status === 200).length;

  assert.equal(successCount, 1);

  console.log("✅ 동시 복구 요청 1개만 성공");

  // ========================================
  // 4. 나머지 요청 차단
  // ========================================

  const blockedCount = statuses.filter((status) =>
    [404, 409].includes(status),
  ).length;

  assert.equal(blockedCount, 1);

  console.log("✅ 중복 복구 요청 차단");

  // ========================================
  // 5. 최종 사진 상태
  // ========================================

  const photo = env.getPhoto(original.id);

  assert.equal(photo.is_deleted, 0);

  assert.equal(photo.deleted_at, null);

  assert.equal(env.countActivePhotos(), 1);

  assert.equal(env.countAllPhotos(), 1);

  console.log("✅ 사진 중복 생성 없음");

  // ========================================
  // 6. 원본 데이터 무결성
  // ========================================

  assert.equal(photo.content_hash, original.hash);

  assert.deepEqual(photo.image_data, original.image);

  console.log("✅ SHA-256 해시 보존");
  console.log("✅ 원본 이미지 보존");

  // ========================================
  // 7. 추가 중복 복구 차단
  // ========================================

  const retry = await env.restorePhoto(original.id);

  assert.ok([404, 409].includes(retry.status));

  assert.equal(env.countActivePhotos(), 1);

  console.log("✅ 복구 완료 사진 재복구 차단");

  console.log("================================");
  console.log("📸 사진 동시 복구 중복 방지 검증 완료");
  console.log("================================");
});

// ========================================
// 테스트 2
// 사진 최대 10장 동시 복구 제한
// ========================================

test("사진 동시 복구 시 최대 10장 제한 유지", async (t) => {
  const env = await createEnvironment();

  t.after(() => env.close());

  // ========================================
  // 1. 정상 사진 9장 생성
  // ========================================

  for (let index = 1; index <= 9; index++) {
    env.insertPhoto(`active-photo-${index}`, false);
  }

  assert.equal(env.countActivePhotos(), 9);

  console.log("✅ 활성 사진 9장 생성");

  // ========================================
  // 2. 삭제된 사진 2장 생성
  // ========================================

  const deletedPhoto1 = env.insertPhoto("deleted-photo-10", true);

  const deletedPhoto2 = env.insertPhoto("deleted-photo-11", true);

  assert.equal(env.countAllPhotos(), 11);

  assert.equal(env.countActivePhotos(), 9);

  console.log("✅ 복구 대상 사진 2장 생성");

  // ========================================
  // 3. 두 사진 동시 복구 요청
  // ========================================

  const responses = await Promise.all([
    env.restorePhoto(deletedPhoto1.id),
    env.restorePhoto(deletedPhoto2.id),
  ]);

  const statuses = responses.map((response) => response.status);

  console.log("📸 사진 10장 제한 동시 요청:", statuses);

  // ========================================
  // 4. 복구 성공 개수 확인
  // ========================================

  const successCount = statuses.filter((status) => status === 200).length;

  assert.equal(successCount, 1);

  console.log("✅ 사진 1장만 추가 복구");

  // ========================================
  // 5. 초과 복구 차단 확인
  // ========================================

  const blockedCount = statuses.filter((status) =>
    [404, 409].includes(status),
  ).length;

  assert.equal(blockedCount, 1);

  console.log("✅ 사진 10장 초과 복구 차단");

  // ========================================
  // 6. 활성 사진 개수 검증
  // ========================================

  assert.equal(env.countActivePhotos(), 10);

  console.log("✅ 활성 사진 최대 10장 유지");

  // ========================================
  // 7. 전체 사진 데이터 보존
  // ========================================

  assert.equal(env.countAllPhotos(), 11);

  console.log("✅ 전체 사진 11개 원본 레코드 보존");

  // ========================================
  // 8. 복구 대상 상태 확인
  // ========================================

  const photo1 = env.getPhoto(deletedPhoto1.id);

  const photo2 = env.getPhoto(deletedPhoto2.id);

  const restoredCount = [photo1, photo2].filter(
    (photo) => photo.is_deleted === 0,
  ).length;

  const deletedCount = [photo1, photo2].filter(
    (photo) => photo.is_deleted === 1,
  ).length;

  assert.equal(restoredCount, 1);

  assert.equal(deletedCount, 1);

  console.log("✅ 복구 사진 1장 확인");
  console.log("✅ 복구 실패 사진 삭제 상태 유지");

  // ========================================
  // 9. 원본 이미지 무결성 확인
  // ========================================

  assert.deepEqual(photo1.image_data, deletedPhoto1.image);

  assert.deepEqual(photo2.image_data, deletedPhoto2.image);

  assert.equal(photo1.content_hash, deletedPhoto1.hash);

  assert.equal(photo2.content_hash, deletedPhoto2.hash);

  console.log("✅ 두 사진 원본 이미지 보존");
  console.log("✅ 두 사진 SHA-256 해시 보존");

  // ========================================
  // 10. 기존 정상 사진 상태 확인
  // ========================================

  for (let index = 1; index <= 9; index++) {
    const photo = env.getPhoto(index);

    assert.equal(photo.is_deleted, 0);
  }

  console.log("✅ 기존 정상 사진 9장 보존");

  console.log("================================");
  console.log("📸 사진 동시 복구 최대 10장 검증 완료");
  console.log("================================");
});
