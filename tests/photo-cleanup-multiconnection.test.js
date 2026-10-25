// ========================================
// 🌱 농사 가이드
// 📸 사진 정리 SQLite 다중 연결 테스트
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
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "photo-cleanup-multi-"),
  );

  const dbPath = path.join(directory, "test.sqlite");

  const db1 = new Database(dbPath);

  const db2 = new Database(dbPath);

  db1.pragma("busy_timeout = 5000");

  db2.pragma("busy_timeout = 5000");

  db1.exec(`
    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY,

      storage_provider TEXT,

      storage_key TEXT,

      is_deleted INTEGER DEFAULT 0
    )
  `);

  const queue1 = createPhotoCleanupQueue(db1);

  const queue2 = createPhotoCleanupQueue(db2);

  function makeOld() {
    db1
      .prepare(
        `
      UPDATE photo_cleanup_jobs

      SET updated_at = datetime('now', '-25 hours')
    `,
      )
      .run();
  }

  function cleanup() {
    db1.close();

    db2.close();

    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  }

  return {
    db1,
    db2,
    queue1,
    queue2,
    makeOld,
    cleanup,
  };
}

// ========================================
// 테스트 1. 동일 작업 중복 선점 방지
// ========================================

test("서로 다른 DB 연결에서 동일 사진 정리 중복 방지", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const photo = {
    storageProvider: "local",
    storageKey: "same-cleanup-photo.png",
  };

  fixture.queue1.enqueue(photo);

  fixture.makeOld();

  const deleted = [];

  let releaseDelete;

  let signalStarted;

  const started = new Promise((resolve) => {
    signalStarted = resolve;
  });

  const gate = new Promise((resolve) => {
    releaseDelete = resolve;
  });

  // ========================================
  // 첫 번째 연결 작업 선점
  // ========================================

  const first = fixture.queue1.retryPending(async (storageKey) => {
    deleted.push(storageKey);

    signalStarted();

    await gate;
  });

  // ========================================
  // 첫 번째 연결이 삭제 작업에 진입할 때까지 대기
  // ========================================

  await started;

  // ========================================
  // 두 번째 연결 동시 실행
  // ========================================

  const second = await fixture.queue2.retryPending(async (storageKey) => {
    deleted.push(storageKey);
  });

  assert.equal(second.cleaned, 0);

  assert.equal(second.failed, 0);

  // ========================================
  // 첫 번째 연결 작업 완료
  // ========================================

  releaseDelete();

  const firstResult = await first;

  assert.equal(firstResult.cleaned, 1);

  assert.deepEqual(deleted, ["same-cleanup-photo.png"]);

  const remaining = fixture.db1
    .prepare(
      `
    SELECT COUNT(*) AS count

    FROM photo_cleanup_jobs
  `,
    )
    .get();

  assert.equal(remaining.count, 0);

  console.log("✅ 서로 다른 DB 연결 중복 선점 차단");

  console.log("✅ 동일 사진 삭제 작업 1회 실행");
});

// ========================================
// 테스트 2. 서버 종료 후 작업 재선점
// ========================================

test("만료된 선점 작업을 다른 연결에서 복구한다", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const photo = {
    storageProvider: "local",
    storageKey: "crashed-cleanup-photo.png",
  };

  fixture.queue1.enqueue(photo);

  fixture.makeOld();

  // ========================================
  // 비정상 종료된 실행기의 선점 상태 재현
  //
  // 현재 정리 큐는
  // state 기반 작업 선점 방식을 사용한다.
  //
  // processing 상태로 변경하고
  // 마지막 작업 시간을 25시간 전으로 설정하여
  // 서버 비정상 종료 상황을 재현한다.
  // ========================================

  fixture.db1
    .prepare(
      `
    UPDATE photo_cleanup_jobs

    SET
      state = 'processing',

      updated_at = datetime('now', '-25 hours')

    WHERE storage_provider = ?
      AND storage_key = ?
  `,
    )
    .run(photo.storageProvider, photo.storageKey);

  const deleted = [];

  // ========================================
  // 다른 연결에서 작업 복구
  // ========================================

  const result = await fixture.queue2.retryPending(async (storageKey) => {
    deleted.push(storageKey);
  });

  assert.equal(result.cleaned, 1);

  assert.deepEqual(deleted, ["crashed-cleanup-photo.png"]);

  const remaining = fixture.db1
    .prepare(
      `
    SELECT COUNT(*) AS count

    FROM photo_cleanup_jobs
  `,
    )
    .get();

  assert.equal(remaining.count, 0);

  console.log("✅ 만료된 선점 작업 복구 성공");
});

// ========================================
// 테스트 3. 소프트 삭제 사진 보호
// ========================================

test("다중 연결에서도 소프트 삭제 사진을 보호한다", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const photo = {
    storageProvider: "local",
    storageKey: "protected-cleanup-photo.png",
  };

  fixture.db1
    .prepare(
      `
    INSERT INTO diary_photos (
      id,
      storage_provider,
      storage_key,
      is_deleted
    )

    VALUES (1, ?, ?, 1)
  `,
    )
    .run(photo.storageProvider, photo.storageKey);

  fixture.queue1.enqueue(photo);

  fixture.makeOld();

  let deleted = false;

  const result = await fixture.queue2.retryPending(async () => {
    deleted = true;
  });

  assert.equal(deleted, false);

  assert.equal(result.protected, 1);

  console.log("✅ 소프트 삭제 사진 원본 보호");
});

// ========================================
// 테스트 4. 이미 삭제된 파일 복구 처리
// ========================================

test("파일이 이미 삭제된 경우 정리 작업을 완료한다", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const photo = {
    storageProvider: "local",
    storageKey: "already-deleted-photo.png",
  };

  fixture.queue1.enqueue(photo);

  fixture.makeOld();

  const result = await fixture.queue2.retryPending(async () => {
    const error = new Error("ENOENT");

    error.code = "ENOENT";

    throw error;
  });

  assert.equal(result.cleaned, 1);

  assert.equal(result.failed, 0);

  const remaining = fixture.db1
    .prepare(
      `
    SELECT COUNT(*) AS count

    FROM photo_cleanup_jobs
  `,
    )
    .get();

  assert.equal(remaining.count, 0);

  console.log("✅ 이미 삭제된 파일 정리 작업 완료");
});
