// ========================================
// 🌱 농사 가이드
// 📸 고아 사진 자동 탐지 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const os = require("node:os");

const path = require("node:path");

const Database = require("better-sqlite3");

const scanOrphanPhotos = require("../services/storage/photo-orphan-scanner");

const createPhotoCleanupQueue = require("../services/storage/photo-cleanup-queue");

// ========================================
// 1. 테스트 기본 설정
// ========================================

const HOUR = 60 * 60 * 1000;

// ========================================
// 2. 테스트 환경 생성
// ========================================

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "photo-orphan-test-"),
  );

  const storageRoot = path.join(directory, "photos");

  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_provider TEXT,
      storage_key TEXT,
      is_deleted INTEGER DEFAULT 0
    )
  `);

  const queue = createPhotoCleanupQueue(db);

  // ========================================
  // 테스트 사진 생성
  // ========================================

  function createPhoto(storageKey, ageHours = 25) {
    const fullPath = path.join(storageRoot, storageKey);

    fs.mkdirSync(path.dirname(fullPath), {
      recursive: true,
    });

    fs.writeFileSync(fullPath, "TEST_IMAGE");

    const modifiedAt = new Date(Date.now() - ageHours * HOUR);

    fs.utimesSync(fullPath, modifiedAt, modifiedAt);

    return fullPath;
  }

  // ========================================
  // DB 사진 등록
  // ========================================

  function registerPhoto(storageKey, deleted = false) {
    db.prepare(
      `
      INSERT INTO diary_photos (
        storage_provider,
        storage_key,
        is_deleted
      )
      VALUES (?, ?, ?)
    `,
    ).run("local", storageKey, deleted ? 1 : 0);
  }

  // ========================================
  // 정리 작업 목록
  // ========================================

  function getJobs() {
    return db
      .prepare(
        `
      SELECT *
      FROM photo_cleanup_jobs
      ORDER BY id
    `,
      )
      .all();
  }

  // ========================================
  // 테스트 환경 정리
  // ========================================

  function cleanup() {
    db.close();

    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  }

  return {
    db,
    queue,
    storageRoot,
    createPhoto,
    registerPhoto,
    getJobs,
    cleanup,
  };
}

// ========================================
// 테스트 1
// 고아 사진만 탐지
// ========================================

test("DB에 없는 오래된 사진만 정리 작업에 등록", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const orphanKey = "diary/2026/10/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";

  const existingKey = "diary/2026/10/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png";

  const recentKey = "diary/2026/10/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png";

  const otherCategoryKey =
    "farm/2026/10/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png";

  // 오래된 고아 사진
  fixture.createPhoto(orphanKey, 26);

  // DB에 등록된 소프트 삭제 사진
  fixture.createPhoto(existingKey, 26);

  fixture.registerPhoto(existingKey, true);

  // 최근 업로드 사진
  fixture.createPhoto(recentKey, 1);

  // 다른 분류 사진
  fixture.createPhoto(otherCategoryKey, 26);

  const result = await scanOrphanPhotos(fixture.db, {
    storageRoot: fixture.storageRoot,
  });

  assert.equal(result.scanned, 3);

  assert.equal(result.queued, 1);

  assert.equal(result.referenced, 1);

  assert.equal(result.recent, 1);

  const jobs = fixture.getJobs();

  assert.equal(jobs.length, 1);

  assert.equal(jobs[0].storage_key, orphanKey);

  console.log("✅ 오래된 고아 사진 탐지 성공");

  console.log("✅ 소프트 삭제된 사진 보호");

  console.log("✅ 최근 업로드 사진 보호");

  console.log("✅ 다른 사진 분류 보호");
});

// ========================================
// 테스트 2
// 중복 정리 작업 방지
// ========================================

test("반복 탐지 시 기존 정리 작업 시간 유지", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const storageKey = "diary/2026/10/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png";

  fixture.createPhoto(storageKey, 26);

  const first = await scanOrphanPhotos(fixture.db, {
    storageRoot: fixture.storageRoot,
  });

  assert.equal(first.queued, 1);

  // 기존 작업을 25시간 전으로 변경
  fixture.db
    .prepare(
      `
    UPDATE photo_cleanup_jobs
    SET updated_at = datetime('now', '-25 hours')
  `,
    )
    .run();

  const before = fixture.getJobs()[0].updated_at;

  // 같은 사진 다시 탐지
  const second = await scanOrphanPhotos(fixture.db, {
    storageRoot: fixture.storageRoot,
  });

  const after = fixture.getJobs()[0].updated_at;

  assert.equal(second.queued, 0);

  assert.equal(second.alreadyQueued, 1);

  assert.equal(before, after);

  assert.equal(fixture.getJobs().length, 1);

  console.log("✅ 중복 정리 작업 생성 방지");

  console.log("✅ 기존 24시간 대기 시간 유지");
});

// ========================================
// 테스트 3
// 탐지 이후 DB 등록된 사진 보호
// ========================================

test("정리 작업 실행 전 DB에 등록된 사진 보호", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const storageKey = "diary/2026/10/ffffffff-ffff-4fff-8fff-ffffffffffff.png";

  const fullPath = fixture.createPhoto(storageKey, 26);

  const scan = await scanOrphanPhotos(fixture.db, {
    storageRoot: fixture.storageRoot,
  });

  assert.equal(scan.queued, 1);

  // ========================================
  // 탐지 이후 사진 DB 등록
  // ========================================

  fixture.registerPhoto(storageKey);

  // 정리 작업 실행 가능 시간으로 변경
  fixture.db
    .prepare(
      `
    UPDATE photo_cleanup_jobs
    SET updated_at = datetime('now', '-25 hours')
  `,
    )
    .run();

  let deleted = false;

  const result = await fixture.queue.retryPending(async () => {
    deleted = true;
  });

  assert.equal(deleted, false);

  assert.equal(result.protected, 1);

  assert.equal(result.cleaned, 0);

  assert.equal(fixture.getJobs().length, 0);

  assert.equal(fs.existsSync(fullPath), true);

  console.log("✅ DB 등록 사진 삭제 차단");

  console.log("✅ 원본 사진 파일 보존");
});

// ========================================
// 테스트 4
// 사진 저장소가 없는 경우
// ========================================

test("사진 저장소가 없어도 안전하게 종료", async (t) => {
  const fixture = createFixture();

  t.after(() => fixture.cleanup());

  const result = await scanOrphanPhotos(fixture.db, {
    storageRoot: fixture.storageRoot,
  });

  assert.equal(result.scanned, 0);

  assert.equal(result.queued, 0);

  assert.equal(fixture.getJobs().length, 0);

  console.log("✅ 빈 사진 저장소 안전 처리");
});
