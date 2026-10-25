// ========================================
// 🌱 농사 가이드
// 📸 사진 업로드·복구 동시성 무결성 테스트
//
// 검증 항목
// 1. 서로 다른 SQLite 연결에서 동시 실행
// 2. 업로드와 복구 중 하나만 성공
// 3. 활성 사진 최대 10장 유지
// 4. 실패 작업의 데이터 무결성
// 5. 원본 이미지 및 SHA-256 보존
// ========================================

const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("node:worker_threads");

const Database = require("better-sqlite3");

const createDiaryPhotoRepository = require("../repositories/diary-photo.repository");

// ========================================
// 1. SHA-256 생성
// ========================================

function createHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ========================================
// 2. 테스트 이미지 생성
// ========================================

function createImage(content) {
  const header = Buffer.from("89504e470d0a1a0a", "hex");

  return Buffer.concat([header, Buffer.from(content)]);
}

// ========================================
// 3. Worker 실행
// ========================================

if (!isMainThread) {
  let db;

  try {
    db = new Database(workerData.dbPath);

    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");

    const repository = createDiaryPhotoRepository(db);

    const gate = new Int32Array(workerData.gate);

    parentPort.postMessage({
      type: "ready",
    });

    const waitResult = Atomics.wait(gate, 0, 0, 10000);

    if (waitResult === "timed-out") {
      throw new Error("WORKER_START_TIMEOUT");
    }

    // ========================================
    // 신규 사진 업로드
    // ========================================

    if (workerData.action === "upload") {
      const savedIds = repository.saveStoredPhotos(1, [
        {
          storageProvider: "local",

          storageKey: workerData.storageKey,

          mimeType: "image/png",

          size: workerData.fileSize,

          contentHash: workerData.contentHash,
        },
      ]);

      parentPort.postMessage({
        type: "result",
        action: "upload",
        success: true,
        savedIds,
      });
    }

    // ========================================
    // 삭제된 사진 복구
    // ========================================
    else if (workerData.action === "restore") {
      const restored = repository.restore(workerData.photoId, 1, 1);

      parentPort.postMessage({
        type: "result",
        action: "restore",
        success: restored,
      });
    } else {
      throw new Error("UNKNOWN_WORKER_ACTION");
    }
  } catch (error) {
    parentPort.postMessage({
      type: "result",

      action: workerData.action,

      success: false,

      error: {
        code: error.code ?? null,
        message: error.message,
      },
    });
  } finally {
    if (db) {
      db.close();
    }
  }
}

// ========================================
// 4. 메인 테스트
// ========================================
else {
  // ========================================
  // 테스트 DB 생성
  // ========================================

  function createFixture() {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "farm-guide-upload-restore-"),
    );

    const dbPath = path.join(directory, "test.sqlite");

    const db = new Database(dbPath);

    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");

    db.exec(`
      CREATE TABLE farms (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT
      );

      CREATE TABLE farm_diaries (
        id INTEGER PRIMARY KEY,
        farm_id INTEGER NOT NULL,
        work_date TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,

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

      INSERT INTO farms (
        id,
        name
      )
      VALUES (
        1,
        '동시성 테스트 농장'
      );

      INSERT INTO farm_diaries (
        id,
        farm_id,
        work_date
      )
      VALUES (
        1,
        1,
        '2026-10-01'
      );
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
      VALUES (
        1,
        'image/png',
        ?,
        ?,
        ?,
        ?
      )
    `);

    function addPhoto(name, deleted = false) {
      const image = createImage(name);

      const hash = createHash(image);

      const result = insertPhoto.run(
        image,
        hash,
        deleted ? 1 : 0,
        deleted ? "2026-10-01T00:00:00.000Z" : null,
      );

      return {
        id: Number(result.lastInsertRowid),
        image,
        hash,
      };
    }

    function getPhoto(id) {
      return db
        .prepare(
          `
        SELECT *
        FROM diary_photos
        WHERE id = ?
      `,
        )
        .get(id);
    }

    function activeCount() {
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

    function totalCount() {
      return db
        .prepare(
          `
        SELECT COUNT(*) AS count
        FROM diary_photos
      `,
        )
        .get().count;
    }

    function findByStorageKey(storageKey) {
      return db
        .prepare(
          `
        SELECT *
        FROM diary_photos
        WHERE storage_key = ?
      `,
        )
        .get(storageKey);
    }

    function cleanup() {
      db.close();

      fs.rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }

    return {
      dbPath,
      addPhoto,
      getPhoto,
      activeCount,
      totalCount,
      findByStorageKey,
      cleanup,
    };
  }

  // ========================================
  // 5. Worker 동시 실행
  // ========================================

  function runWorkers(dbPath, deletedPhoto, uploadInfo) {
    return new Promise((resolve, reject) => {
      const gate = new SharedArrayBuffer(4);

      const gateView = new Int32Array(gate);

      const actions = ["upload", "restore"];

      const workers = [];

      const results = new Array(actions.length);

      let readyCount = 0;
      let exitCount = 0;
      let settled = false;

      const timer = setTimeout(() => {
        fail(new Error("WORKER_TEST_TIMEOUT"));
      }, 15000);

      function fail(error) {
        if (settled) return;

        settled = true;

        clearTimeout(timer);

        for (const worker of workers) {
          worker.terminate().catch(() => {});
        }

        reject(error);
      }

      actions.forEach((action, index) => {
        const worker = new Worker(__filename, {
          execArgv: [],

          workerData: {
            dbPath,
            action,
            gate,

            photoId: deletedPhoto.id,

            ...uploadInfo,
          },
        });

        workers.push(worker);

        worker.on("message", (message) => {
          if (settled) return;

          if (message.type === "ready") {
            readyCount++;

            if (readyCount === actions.length) {
              Atomics.store(gateView, 0, 1);

              Atomics.notify(gateView, 0, actions.length);
            }
          }

          if (message.type === "result") {
            results[index] = message;
          }
        });

        worker.on("error", fail);

        worker.on("exit", (code) => {
          if (settled) return;

          if (code !== 0) {
            fail(new Error(`Worker 종료 오류: ${code}`));

            return;
          }

          exitCount++;

          if (exitCount === actions.length) {
            if (results.some((result) => !result)) {
              fail(new Error("Worker 결과 누락"));

              return;
            }

            settled = true;

            clearTimeout(timer);

            resolve(results);
          }
        });
      });
    });
  }

  // ========================================
  // 테스트 1
  // 업로드·복구 동시 실행
  // ========================================

  test("서로 다른 DB 연결에서 사진 업로드와 복구 동시 실행 시 최대 10장 유지", async (t) => {
    const fixture = createFixture();

    t.after(() => fixture.cleanup());

    // ========================================
    // 활성 사진 9장 생성
    // ========================================

    const activePhotos = [];

    for (let i = 1; i <= 9; i++) {
      activePhotos.push(fixture.addPhoto(`active-photo-${i}`));
    }

    // ========================================
    // 삭제된 사진 1장 생성
    // ========================================

    const deletedPhoto = fixture.addPhoto("deleted-photo", true);

    assert.equal(fixture.activeCount(), 9);

    assert.equal(fixture.totalCount(), 10);

    // ========================================
    // 신규 업로드 정보
    // ========================================

    const uploadImage = createImage("new-upload-photo");

    const uploadInfo = {
      storageKey: "diary/race-upload.png",

      fileSize: uploadImage.length,

      contentHash: createHash(uploadImage),
    };

    // ========================================
    // 업로드와 복구 동시 실행
    // ========================================

    const results = await runWorkers(fixture.dbPath, deletedPhoto, uploadInfo);

    console.log("📸 업로드·복구 동시 실행:", results);

    // ========================================
    // 성공 작업은 반드시 1개
    // ========================================

    const successResults = results.filter((result) => result.success);

    const failedResults = results.filter((result) => !result.success);

    assert.equal(successResults.length, 1);

    assert.equal(failedResults.length, 1);

    // ========================================
    // 최종 활성 사진 10장
    // ========================================

    assert.equal(fixture.activeCount(), 10);

    assert.ok(fixture.activeCount() <= 10);

    // ========================================
    // 작업 결과 확인
    // ========================================

    const uploadResult = results.find((result) => result.action === "upload");

    const restoreResult = results.find((result) => result.action === "restore");

    const restoredPhoto = fixture.getPhoto(deletedPhoto.id);

    const uploadedPhoto = fixture.findByStorageKey(uploadInfo.storageKey);

    // ========================================
    // 업로드 성공 시
    // ========================================

    if (uploadResult.success) {
      assert.equal(restoreResult.success, false);

      assert.equal(restoreResult.error, undefined);

      assert.equal(uploadResult.savedIds.length, 1);

      assert.ok(uploadedPhoto);

      assert.equal(uploadedPhoto.is_deleted, 0);

      assert.equal(uploadedPhoto.content_hash, uploadInfo.contentHash);

      assert.equal(uploadedPhoto.storage_key, uploadInfo.storageKey);

      assert.equal(restoredPhoto.is_deleted, 1);

      assert.equal(restoredPhoto.deleted_at, "2026-10-01T00:00:00.000Z");

      assert.equal(fixture.totalCount(), 11);
    }

    // ========================================
    // 복구 성공 시
    // ========================================
    else {
      assert.equal(restoreResult.success, true);

      assert.equal(uploadResult.error?.code, "PHOTO_LIMIT_EXCEEDED");

      assert.equal(uploadedPhoto, undefined);

      assert.equal(restoredPhoto.is_deleted, 0);

      assert.equal(restoredPhoto.deleted_at, null);

      assert.equal(fixture.totalCount(), 10);
    }

    // ========================================
    // 삭제 사진 원본 보존
    // ========================================

    assert.equal(restoredPhoto.content_hash, deletedPhoto.hash);

    assert.deepEqual(restoredPhoto.image_data, deletedPhoto.image);

    // ========================================
    // 기존 활성 사진 9장 보존
    // ========================================

    for (const photo of activePhotos) {
      const stored = fixture.getPhoto(photo.id);

      assert.ok(stored);

      assert.equal(stored.is_deleted, 0);

      assert.equal(stored.content_hash, photo.hash);

      assert.deepEqual(stored.image_data, photo.image);
    }

    console.log("✅ 업로드·복구 중 하나만 성공");

    console.log("✅ 활성 사진 최대 10장 유지");

    console.log("✅ 실패 작업 데이터 무결성 유지");

    console.log("✅ 기존 활성 사진 9장 보존");

    console.log("✅ 원본 이미지 및 SHA-256 보존");

    console.log("================================");

    console.log("📸 업로드·복구 동시성 검증 완료");

    console.log("================================");
  });
}
