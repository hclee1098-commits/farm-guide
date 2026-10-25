// ========================================
// 🌱 농사 가이드
// 📸 사진 자동 정리 실행기 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const os = require("node:os");

const path = require("node:path");

const Database = require("better-sqlite3");

const createPhotoCleanupQueue = require("../services/storage/photo-cleanup-queue");

const createPhotoCleanupRunner = require("../services/storage/photo-cleanup-runner");

// ========================================
// 테스트 1. 자동 정리 실행
// ========================================

test("사진 정리 실행기가 대기 작업을 처리한다", async () => {
  let called = 0;

  const queue = {
    async retryPending() {
      called++;

      return {
        cleaned: 1,
        protected: 0,
        failed: 0,
      };
    },
  };

  const runner = createPhotoCleanupRunner({
    queue,

    deletePhotoFile: async () => {},
  });

  const result = await runner.runOnce();

  assert.equal(called, 1);

  assert.equal(result.cleaned, 1);

  console.log("✅ 사진 정리 실행 성공");
});

// ========================================
// 테스트 2. 중복 실행 방지
// ========================================

test("동일 실행기 중복 실행을 차단한다", async () => {
  let called = 0;

  let release;

  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const queue = {
    async retryPending() {
      called++;

      await gate;

      return {
        cleaned: 1,
        protected: 0,
        failed: 0,
      };
    },
  };

  const runner = createPhotoCleanupRunner({
    queue,

    deletePhotoFile: async () => {},
  });

  const first = runner.runOnce();

  const second = await runner.runOnce();

  assert.equal(second.skipped, true);

  assert.equal(called, 1);

  release();

  await first;

  console.log("✅ 자동 정리 중복 실행 차단");
});

// ========================================
// 테스트 3. 실제 파일 정리 통합 검증
// ========================================

test("24시간 지난 고아 사진만 삭제한다", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "photo-runner-"));

  const db = new Database(":memory:");

  t.after(() => {
    db.close();

    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  db.exec(`
    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_provider TEXT,
      storage_key TEXT,
      is_deleted INTEGER DEFAULT 0
    )
  `);

  const queue = createPhotoCleanupQueue(db);

  const orphan = {
    storageProvider: "local",
    storageKey: "diary/2026/10/orphan.png",
  };

  const protectedPhoto = {
    storageProvider: "local",
    storageKey: "diary/2026/10/protected.png",
  };

  const newPhoto = {
    storageProvider: "local",
    storageKey: "diary/2026/10/new.png",
  };

  // ========================================
  // 테스트 파일 생성
  // ========================================

  for (const photo of [orphan, protectedPhoto, newPhoto]) {
    fs.writeFileSync(
      path.join(directory, path.basename(photo.storageKey)),
      "TEST_IMAGE",
    );

    queue.enqueue(photo);
  }

  // ========================================
  // DB에 등록된 사진
  // 소프트 삭제 상태도 보호
  // ========================================

  db.prepare(
    `
    INSERT INTO diary_photos (
      storage_provider,
      storage_key,
      is_deleted
    )
    VALUES (?, ?, 1)
  `,
  ).run(protectedPhoto.storageProvider, protectedPhoto.storageKey);

  // ========================================
  // 고아 사진과 보호 사진만 25시간 경과
  // ========================================

  db.prepare(
    `
    UPDATE photo_cleanup_jobs

    SET updated_at = datetime('now', '-25 hours')

    WHERE storage_key IN (?, ?)
  `,
  ).run(orphan.storageKey, protectedPhoto.storageKey);

  // ========================================
  // 테스트용 실제 파일 삭제 함수
  // ========================================

  const runner = createPhotoCleanupRunner({
    queue,

    deletePhotoFile: async (storageKey) => {
      await fs.promises.unlink(path.join(directory, path.basename(storageKey)));
    },
  });

  const result = await runner.runOnce();

  // ========================================
  // 고아 사진만 삭제
  // ========================================

  assert.equal(result.cleaned, 1);

  assert.equal(result.protected, 1);

  assert.equal(result.failed, 0);

  assert.equal(fs.existsSync(path.join(directory, "orphan.png")), false);

  // ========================================
  // DB 등록 사진 보호
  // ========================================

  assert.equal(fs.existsSync(path.join(directory, "protected.png")), true);

  // ========================================
  // 24시간 미경과 사진 보호
  // ========================================

  assert.equal(fs.existsSync(path.join(directory, "new.png")), true);

  const remainingJobs = db
    .prepare(
      `
    SELECT storage_key
    FROM photo_cleanup_jobs
  `,
    )
    .all();

  assert.equal(remainingJobs.length, 1);

  assert.equal(remainingJobs[0].storage_key, newPhoto.storageKey);

  console.log("✅ 오래된 고아 사진만 삭제");

  console.log("✅ DB 등록 사진 보호");

  console.log("✅ 신규 업로드 사진 보호");
});

// ========================================
// 테스트 4. 실패 후 재실행 가능
// ========================================

test("정리 실행 오류 이후 다시 실행할 수 있다", async () => {
  let attempts = 0;

  const queue = {
    async retryPending() {
      attempts++;

      if (attempts === 1) {
        throw new Error("TEST_RUNNER_FAILURE");
      }

      return {
        cleaned: 1,
        protected: 0,
        failed: 0,
      };
    },
  };

  const runner = createPhotoCleanupRunner({
    queue,

    deletePhotoFile: async () => {},
  });

  await assert.rejects(runner.runOnce(), /TEST_RUNNER_FAILURE/);

  const result = await runner.runOnce();

  assert.equal(attempts, 2);

  assert.equal(result.cleaned, 1);

  console.log("✅ 실행 오류 이후 재시도 성공");
});
