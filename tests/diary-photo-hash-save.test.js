// ========================================
// 🌱 농사 가이드
// 📸 재배 일지 사진 SHA-256 저장 테스트
// ========================================

// ========================================
// 1. 모듈 불러오기
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const crypto = require("node:crypto");

const Database = require("better-sqlite3");

const createDiaryPhotoRepository = require("../repositories/diary-photo.repository");

// ========================================
// 2. 테스트용 DB 생성
// ========================================

function createTestDatabase() {
  const db = new Database(":memory:");

  // ========================================
  // 실제 DB를 변경하지 않는
  // 독립적인 테스트용 최소 테이블
  // ========================================

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
      storage_key TEXT UNIQUE,
      file_size INTEGER,
      content_hash TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ========================================
  // 테스트 농장 및 재배 일지
  // ========================================

  db.prepare(
    `
    INSERT INTO farms (id, is_deleted)
    VALUES (1, 0)
  `,
  ).run();

  db.prepare(
    `
    INSERT INTO farm_diaries (
      id,
      farm_id,
      is_deleted
    )
    VALUES (1, 1, 0)
  `,
  ).run();

  return db;
}

// ========================================
// 3. SHA-256 생성 공통 함수
// ========================================

function createHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ========================================
// 4. 테스트용 사진 정보 생성
// ========================================

function createStoredPhoto(index, buffer) {
  return {
    storageProvider: "local",

    storageKey: `diary/2026/10/test-${index}.png`,

    mimeType: "image/png",

    size: buffer.length,

    contentHash: createHash(buffer),
  };
}

// ========================================
// 테스트 1
// 신규 파일 사진 해시 저장
// ========================================

test("신규 사진의 SHA-256 해시값이 저장된다", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createDiaryPhotoRepository(db);

  const buffer = Buffer.from("new-photo-test");

  const photo = createStoredPhoto(1, buffer);

  const savedIds = repository.saveStoredPhotos(1, [photo]);

  assert.equal(savedIds.length, 1);

  const savedPhoto = db
    .prepare(
      `
    SELECT content_hash
    FROM diary_photos
    WHERE id = ?
  `,
    )
    .get(savedIds[0]);

  assert.equal(savedPhoto.content_hash, createHash(buffer));

  console.log("✅ 신규 사진 해시 저장 성공");
});

// ========================================
// 테스트 2
// 기존 BLOB 사진 해시 저장
// ========================================

test("기존 BLOB 사진의 SHA-256 해시값이 저장된다", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createDiaryPhotoRepository(db);

  const buffer = Buffer.from("legacy-photo-test");

  const file = {
    mimetype: "image/png",
    buffer,
  };

  const photoId = repository.saveSingle(1, file);

  const savedPhoto = db
    .prepare(
      `
    SELECT
      image_data,
      content_hash
    FROM diary_photos
    WHERE id = ?
  `,
    )
    .get(photoId);

  assert.deepEqual(savedPhoto.image_data, buffer);

  assert.equal(savedPhoto.content_hash, createHash(buffer));

  console.log("✅ 기존 BLOB 사진 해시 저장 성공");
});

// ========================================
// 테스트 3
// 여러 장의 BLOB 사진 해시 저장
// ========================================

test("여러 장의 BLOB 사진에 각각 해시값이 저장된다", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createDiaryPhotoRepository(db);

  const buffer1 = Buffer.from("photo-one");

  const buffer2 = Buffer.from("photo-two");

  const files = [
    {
      mimetype: "image/png",
      buffer: buffer1,
    },
    {
      mimetype: "image/png",
      buffer: buffer2,
    },
  ];

  const photoIds = repository.saveMultiple(1, files);

  assert.equal(photoIds.length, 2);

  const photos = db
    .prepare(
      `
    SELECT content_hash
    FROM diary_photos
    ORDER BY id ASC
  `,
    )
    .all();

  assert.equal(photos[0].content_hash, createHash(buffer1));

  assert.equal(photos[1].content_hash, createHash(buffer2));

  assert.notEqual(photos[0].content_hash, photos[1].content_hash);

  console.log("✅ 여러 장 사진 해시 저장 성공");
});

// ========================================
// 테스트 4
// 잘못된 해시값 저장 차단
// ========================================

test("잘못된 사진 해시값은 저장하지 않는다", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createDiaryPhotoRepository(db);

  const buffer = Buffer.from("invalid-hash-test");

  const photo = createStoredPhoto(1, buffer);

  // ========================================
  // 잘못된 해시값으로 변경
  // ========================================

  photo.contentHash = "invalid-hash";

  assert.throws(() => {
    repository.saveStoredPhotos(1, [photo]);
  });

  const count = db
    .prepare(
      `
    SELECT COUNT(*) AS count
    FROM diary_photos
  `,
    )
    .get();

  assert.equal(count.count, 0);

  console.log("✅ 잘못된 해시값 저장 차단");
});

// ========================================
// 테스트 5
// DB 저장 실패 시 트랜잭션 롤백
// ========================================

test("사진 저장 중 DB 오류가 발생하면 전체 롤백된다", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createDiaryPhotoRepository(db);

  const buffer1 = Buffer.from("rollback-photo-1");

  const buffer2 = Buffer.from("rollback-photo-2");

  const photo1 = createStoredPhoto(1, buffer1);

  const photo2 = createStoredPhoto(2, buffer2);

  // ========================================
  // 동일한 storageKey로 변경
  // UNIQUE 제약 조건 오류 유도
  // ========================================

  photo2.storageKey = photo1.storageKey;

  assert.throws(() => {
    repository.saveStoredPhotos(1, [photo1, photo2]);
  });

  // ========================================
  // 첫 번째 사진도 롤백되었는지 확인
  // ========================================

  const count = db
    .prepare(
      `
    SELECT COUNT(*) AS count
    FROM diary_photos
  `,
    )
    .get();

  assert.equal(count.count, 0);

  console.log("✅ DB 저장 실패 시 전체 롤백 성공");
});

// ========================================
// 테스트 6
// 사진 최대 10장 제한
// ========================================

test("재배 일지 사진은 최대 10장까지만 저장된다", (t) => {
  const db = createTestDatabase();

  t.after(() => db.close());

  const repository = createDiaryPhotoRepository(db);

  const photos = [];

  // ========================================
  // 사진 10장 생성
  // ========================================

  for (let i = 1; i <= 10; i++) {
    const buffer = Buffer.from(`photo-${i}`);

    photos.push(createStoredPhoto(i, buffer));
  }

  // ========================================
  // 사진 10장 저장
  // ========================================

  const savedIds = repository.saveStoredPhotos(1, photos);

  assert.equal(savedIds.length, 10);

  // ========================================
  // 11번째 사진 저장 시도
  // ========================================

  const extraBuffer = Buffer.from("extra-photo");

  const extraPhoto = createStoredPhoto(11, extraBuffer);

  assert.throws(
    () => {
      repository.saveStoredPhotos(1, [extraPhoto]);
    },
    (error) => error.code === "PHOTO_LIMIT_EXCEEDED",
  );

  // ========================================
  // 사진 개수 유지 확인
  // ========================================

  assert.equal(repository.count(1), 10);

  console.log("✅ 사진 최대 10장 제한 정상");
});
