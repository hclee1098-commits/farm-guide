// ========================================
// 🌱 농사 가이드
// 📸 사진 정리 작업 영속성 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const os = require("node:os");

const path = require("node:path");

const Database = require("better-sqlite3");

const createPhotoCleanupQueue = require("../services/storage/photo-cleanup-queue");

// ========================================
// 1. 테스트 DB 생성
// ========================================

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "photo-cleanup-"));

  const dbPath = path.join(directory, "test.sqlite");

  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY,
      storage_provider TEXT,
      storage_key TEXT,
      is_deleted INTEGER DEFAULT 0
    )
  `);

  return {
    db,
    dbPath,

    cleanup() {
      if (db.open) {
        db.close();
      }

      fs.rmSync(directory, {
        recursive: true,
        force: true,
      });
    },
  };
}

// ========================================
// 테스트 1. 재시작 후 작업 복구
// ========================================

test("서버 재시작 후 미완료 사진 정리", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const photo = {
    storageProvider: "local",
    storageKey: "orphan-photo.png",
  };

  const queue1 = createPhotoCleanupQueue(fixture.db);

  queue1.enqueue(photo);

  // ========================================
  // 서버 재시작 상황 재현
  // ========================================

  fixture.db.close();

  const db2 = new Database(fixture.dbPath);

  try {
    const queue2 = createPhotoCleanupQueue(db2);

    const deleted = [];

    const result = await queue2.retryPending(async (storageKey) => {
      deleted.push(storageKey);
    });

    assert.equal(result.cleaned, 1);

    assert.deepEqual(deleted, ["orphan-photo.png"]);

    console.log("✅ 재시작 후 미완료 사진 정리 성공");
  } finally {
    db2.close();
  }
});

// ========================================
// 테스트 2. 기존 사진 삭제 방지
// ========================================

test("DB에 등록된 사진은 정리하지 않는다", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const photo = {
    storageProvider: "local",
    storageKey: "existing-photo.png",
  };

  fixture.db
    .prepare(
      `
      INSERT INTO diary_photos (
        storage_provider,
        storage_key,
        is_deleted
      )
      VALUES (?, ?, 1)
    `,
    )
    .run(photo.storageProvider, photo.storageKey);

  const queue = createPhotoCleanupQueue(fixture.db);

  queue.enqueue(photo);

  let deleted = false;

  const result = await queue.retryPending(async () => {
    deleted = true;
  });

  assert.equal(deleted, false);

  assert.equal(result.protected, 1);

  console.log("✅ 소프트 삭제된 사진 원본 보호");
});

// ========================================
// 테스트 3. 삭제 실패 작업 유지
// ========================================

test("파일 삭제 실패 시 정리 작업 유지", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const queue = createPhotoCleanupQueue(fixture.db);

  const photo = {
    storageProvider: "local",
    storageKey: "failed-photo.png",
  };

  queue.enqueue(photo);

  const first = await queue.retryPending(async () => {
    throw new Error("TEST_DELETE_FAILURE");
  });

  assert.equal(first.failed, 1);

  const pending = fixture.db
    .prepare(
      `
      SELECT *
      FROM photo_cleanup_jobs
    `,
    )
    .all();

  assert.equal(pending.length, 1);

  assert.equal(pending[0].attempts, 1);

  // ========================================
  // 두 번째 시도 성공
  // ========================================

  const second = await queue.retryPending(async () => {});

  assert.equal(second.cleaned, 1);

  const remaining = fixture.db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM photo_cleanup_jobs
    `,
    )
    .get();

  assert.equal(remaining.count, 0);

  console.log("✅ 삭제 실패 작업 재시도 성공");
});
