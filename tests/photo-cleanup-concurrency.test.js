// ========================================
// 🌱 농사 가이드
// 📸 사진 정리 작업 동시성 테스트
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
    path.join(os.tmpdir(), "photo-cleanup-concurrency-"),
  );

  const dbPath = path.join(directory, "test.sqlite");

  const db1 = new Database(dbPath);

  db1.pragma("busy_timeout = 5000");

  db1.exec(`
    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_provider TEXT,
      storage_key TEXT,
      is_deleted INTEGER DEFAULT 0
    )
  `);

  const db2 = new Database(dbPath);

  db2.pragma("busy_timeout = 5000");

  const queue1 = createPhotoCleanupQueue(db1);

  const queue2 = createPhotoCleanupQueue(db2);

  function makeJobsOld() {
    db1
      .prepare(
        `
      UPDATE photo_cleanup_jobs

      SET updated_at = datetime('now', '-25 hours')
    `,
      )
      .run();
  }

  function getJobs() {
    return db1
      .prepare(
        `
      SELECT *
      FROM photo_cleanup_jobs
      ORDER BY id
    `,
      )
      .all();
  }

  function cleanup() {
    db2.close();

    db1.close();

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
    makeJobsOld,
    getJobs,
    cleanup,
  };
}

// ========================================
// 테스트 1
// 서로 다른 연결에서 중복 삭제 방지
// ========================================

test("다중 DB 연결에서 동일 사진 중복 삭제 방지", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const photo = {
    storageProvider: "local",
    storageKey: "diary/2026/10/concurrency-test.png",
  };

  fixture.queue1.enqueue(photo);

  fixture.makeJobsOld();

  let deleteCount = 0;

  let releaseDeletion;

  let signalDeletionStarted;

  const deletionStarted = new Promise((resolve) => {
    signalDeletionStarted = resolve;
  });

  const deletionGate = new Promise((resolve) => {
    releaseDeletion = resolve;
  });

  async function deleteFile() {
    deleteCount++;

    signalDeletionStarted();

    await deletionGate;
  }

  // ========================================
  // 첫 번째 연결에서 정리 시작
  // ========================================

  const firstPromise = fixture.queue1.retryPending(deleteFile);

  await deletionStarted;

  try {
    // ========================================
    // 첫 번째 작업이 진행 중일 때
    // 두 번째 연결에서 동일 작업 실행
    // ========================================

    const second = await fixture.queue2.retryPending(async () => {
      deleteCount++;
    });

    assert.equal(second.cleaned, 0);

    assert.equal(deleteCount, 1);

    const jobs = fixture.getJobs();

    assert.equal(jobs.length, 1);

    assert.equal(jobs[0].state, "processing");
  } finally {
    releaseDeletion();
  }

  const first = await firstPromise;

  assert.equal(first.cleaned, 1);

  assert.equal(deleteCount, 1);

  assert.equal(fixture.getJobs().length, 0);

  console.log("✅ 다중 연결 중복 삭제 방지");
});

// ========================================
// 테스트 2
// 정리 중 DB 사진 등록 차단
// ========================================

test("사진 정리 중 동일 파일 DB 등록 차단", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const photo = {
    storageProvider: "local",
    storageKey: "diary/2026/10/registration-test.png",
  };

  fixture.queue1.enqueue(photo);

  fixture.makeJobsOld();

  let releaseDeletion;

  let signalDeletionStarted;

  const deletionStarted = new Promise((resolve) => {
    signalDeletionStarted = resolve;
  });

  const deletionGate = new Promise((resolve) => {
    releaseDeletion = resolve;
  });

  const cleanupPromise = fixture.queue1.retryPending(async () => {
    signalDeletionStarted();

    await deletionGate;
  });

  await deletionStarted;

  try {
    // ========================================
    // 정리 중 사진 DB 등록 시도
    // ========================================

    assert.throws(() => {
      fixture.db2
        .prepare(
          `
          INSERT INTO diary_photos (
            storage_provider,
            storage_key
          )
          VALUES (?, ?)
        `,
        )
        .run(photo.storageProvider, photo.storageKey);
    }, /PHOTO_CLEANUP_IN_PROGRESS/);

    const count = fixture.db2
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM diary_photos
    `,
      )
      .get();

    assert.equal(count.count, 0);

    console.log("✅ 정리 중 사진 DB 등록 차단");
  } finally {
    releaseDeletion();
  }

  const result = await cleanupPromise;

  assert.equal(result.cleaned, 1);

  assert.equal(fixture.getJobs().length, 0);
});

// ========================================
// 테스트 3
// 중단된 작업 복구
// ========================================

test("중단된 processing 작업 복구", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const photo = {
    storageProvider: "local",
    storageKey: "diary/2026/10/recovery-test.png",
  };

  fixture.queue1.enqueue(photo);

  // ========================================
  // 비정상 종료 상태 재현
  // ========================================

  fixture.db1
    .prepare(
      `
    UPDATE photo_cleanup_jobs

    SET
      state = 'processing',
      updated_at = datetime('now', '-25 hours')
  `,
    )
    .run();

  let deleted = false;

  const result = await fixture.queue2.retryPending(async () => {
    deleted = true;
  });

  assert.equal(deleted, true);

  assert.equal(result.cleaned, 1);

  assert.equal(fixture.getJobs().length, 0);

  console.log("✅ 중단된 정리 작업 복구");
});
