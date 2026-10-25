// ========================================
// 🌱 농사 가이드
// 📸 SQLite 다중 연결 사진 복구 무결성 테스트
//
// 검증 항목
// 1. 동일 사진 동시 복구
// 2. 최대 10장 제한
// 3. SQLite 잠금 충돌
// 4. 원본 이미지 및 SHA-256 보존
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
// 1. Worker Thread
// ========================================

if (!isMainThread) {
  const db = new Database(workerData.dbPath);

  db.pragma(`busy_timeout = ${workerData.busyTimeout}`);

  const repository = createDiaryPhotoRepository(db);

  const gate = new Int32Array(workerData.gate);

  parentPort.postMessage({
    type: "ready",
  });

  try {
    // 모든 Worker가 준비될 때까지 대기
    const waitResult = Atomics.wait(gate, 0, 0, 10000);

    if (waitResult === "timed-out") {
      throw new Error("WORKER_START_TIMEOUT");
    }

    // ========================================
    // 📸 사진 업로드 Worker
    // ========================================

    if (workerData.action === "upload") {
      const savedPhotoIds = repository.saveStoredPhotos(1, [
        {
          storageProvider: "local",

          storageKey: `diary/test/upload-${workerData.photoId}.png`,

          mimeType: "image/png",

          size: workerData.fileSize,

          contentHash: workerData.contentHash,
        },
      ]);

      parentPort.postMessage({
        type: "result",

        photoId: workerData.photoId,

        uploaded: true,

        savedPhotoIds,
      });
    } else {
      // ========================================
      // 📸 기존 사진 복구 Worker
      // ========================================

      const restored = repository.restore(workerData.photoId, 1, 1);

      parentPort.postMessage({
        type: "result",

        photoId: workerData.photoId,

        restored,
      });
    }
  } catch (error) {
    parentPort.postMessage({
      type: "result",

      photoId: workerData.photoId,

      restored: false,

      uploaded: false,

      error: {
        code: error.code ?? null,
        message: error.message,
      },
    });
  } finally {
    db.close();
  }
} else {
  // ========================================
  // 2. 테스트 이미지 생성
  // ========================================

  function createImage(content) {
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
  // 4. 테스트 DB 생성
  // ========================================

  function createFixture() {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "farm-guide-multiconnection-"),
    );

    const dbPath = path.join(directory, "test.sqlite");

    const db = new Database(dbPath);

    db.pragma("foreign_keys = ON");

    db.pragma("busy_timeout = 5000");

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

      INSERT INTO farms (
        id,
        name,
        farm_uid
      )
      VALUES (
        1,
        '다중 연결 테스트 농장',
        'MULTI-001'
      );

      INSERT INTO farm_diaries (
        id,
        farm_id,
        work_date,
        work_type
      )
      VALUES (
        1,
        1,
        '2026-10-01',
        '파종'
      );
    `);

    const insert = db.prepare(`
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

      const result = insert.run(
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
      db,
      dbPath,
      addPhoto,
      getPhoto,
      activeCount,
      totalCount,
      cleanup,
    };
  }

  // ========================================
  // 5. 다중 Worker 동시 실행
  // ========================================

  function runWorkers(
    dbPath,
    photoIds,
    busyTimeout = 5000,
    action = "restore",
  ) {
    return new Promise((resolve, reject) => {
      const gate = new SharedArrayBuffer(4);

      const gateView = new Int32Array(gate);

      const workers = [];

      const results = new Array(photoIds.length);

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

      photoIds.forEach((photoId, index) => {
        const worker = new Worker(__filename, {
          execArgv: [],

          workerData: {
            dbPath,

            photoId,

            busyTimeout,

            gate,

            action,

            fileSize: createImage(`upload-photo-${photoId}`).length,

            contentHash: createHash(createImage(`upload-photo-${photoId}`)),
          },
        });

        workers.push(worker);

        worker.on("message", (message) => {
          if (settled) return;

          if (message.type === "ready") {
            readyCount++;

            if (readyCount === photoIds.length) {
              Atomics.store(gateView, 0, 1);

              Atomics.notify(gateView, 0, photoIds.length);
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

          if (exitCount === photoIds.length) {
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
  // 동일 사진 동시 복구
  // ========================================

  test("서로 다른 DB 연결에서 동일 사진 중복 복구 방지", async (t) => {
    const fixture = createFixture();

    t.after(() => fixture.cleanup());

    const photo = fixture.addPhoto("same-photo", true);

    const results = await runWorkers(fixture.dbPath, [photo.id, photo.id]);

    console.log("📸 동일 사진 동시 복구:", results);

    assert.equal(results.filter((r) => r.restored).length, 1);

    assert.equal(results.filter((r) => !r.restored).length, 1);

    assert.ok(results.every((r) => !r.error));

    const restored = fixture.getPhoto(photo.id);

    assert.equal(restored.is_deleted, 0);

    assert.equal(restored.deleted_at, null);

    assert.equal(fixture.activeCount(), 1);

    assert.equal(fixture.totalCount(), 1);

    assert.equal(restored.content_hash, photo.hash);

    assert.deepEqual(restored.image_data, photo.image);

    console.log("✅ 동일 사진 중복 복구 차단");

    console.log("✅ 사진 중복 레코드 생성 없음");

    console.log("✅ 원본 이미지 및 해시 보존");
  });

  // ========================================
  // 테스트 2
  // 최대 10장 제한 동시 복구
  // ========================================

  test("서로 다른 DB 연결에서 사진 최대 10장 제한 유지", async (t) => {
    const fixture = createFixture();

    t.after(() => fixture.cleanup());

    // 활성 사진 9장 생성
    for (let i = 1; i <= 9; i++) {
      fixture.addPhoto(`active-photo-${i}`, false);
    }

    // 삭제된 사진 2장 생성
    const photoA = fixture.addPhoto("deleted-photo-A", true);

    const photoB = fixture.addPhoto("deleted-photo-B", true);

    assert.equal(fixture.activeCount(), 9);

    const results = await runWorkers(fixture.dbPath, [photoA.id, photoB.id]);

    console.log("📸 최대 10장 동시 복구:", results);

    assert.equal(results.filter((r) => r.restored).length, 1);

    assert.equal(results.filter((r) => !r.restored).length, 1);

    assert.ok(results.every((r) => !r.error));

    assert.equal(fixture.activeCount(), 10);

    assert.equal(fixture.totalCount(), 11);

    // 두 사진의 원본 데이터 검증
    for (const photo of [photoA, photoB]) {
      const stored = fixture.getPhoto(photo.id);

      assert.equal(stored.content_hash, photo.hash);

      assert.deepEqual(stored.image_data, photo.image);

      const result = results.find((r) => r.photoId === photo.id);

      assert.equal(stored.is_deleted, result.restored ? 0 : 1);
    }

    console.log("✅ 사진 1장만 추가 복구");

    console.log("✅ 활성 사진 최대 10장 유지");

    console.log("✅ 전체 사진 11개 레코드 보존");

    console.log("✅ 실패 사진 삭제 상태 유지");

    console.log("✅ 원본 이미지 및 SHA-256 보존");
  });

  // ========================================
  // 테스트 3
  // SQLite 잠금 충돌 및 재시도
  // ========================================

  test("SQLite 잠금 충돌 시 사진 데이터 보존", async (t) => {
    const fixture = createFixture();

    t.after(() => fixture.cleanup());

    const photo = fixture.addPhoto("locked-photo", true);

    // 다른 연결의 쓰기 작업 차단
    fixture.db.exec("BEGIN IMMEDIATE");

    let results;

    try {
      results = await runWorkers(fixture.dbPath, [photo.id], 0);
    } finally {
      fixture.db.exec("ROLLBACK");
    }

    console.log("📸 SQLite 잠금 충돌:", results);

    assert.equal(results[0].restored, false);

    assert.match(String(results[0].error?.code), /^SQLITE_BUSY/);

    const beforeRetry = fixture.getPhoto(photo.id);

    assert.equal(beforeRetry.is_deleted, 1);

    assert.equal(fixture.activeCount(), 0);

    assert.equal(beforeRetry.content_hash, photo.hash);

    assert.deepEqual(beforeRetry.image_data, photo.image);

    console.log("✅ SQLite 잠금 충돌 감지");

    console.log("✅ 복구 실패 시 삭제 상태 보존");

    console.log("✅ 원본 이미지 및 해시 보존");

    // 잠금 해제 후 재시도
    const retryResults = await runWorkers(fixture.dbPath, [photo.id]);

    assert.equal(retryResults[0].restored, true);

    const restored = fixture.getPhoto(photo.id);

    assert.equal(restored.is_deleted, 0);

    assert.equal(restored.deleted_at, null);

    assert.equal(fixture.activeCount(), 1);

    assert.equal(restored.content_hash, photo.hash);

    assert.deepEqual(restored.image_data, photo.image);

    console.log("✅ 잠금 해제 후 복구 성공");

    console.log("✅ 최종 데이터 무결성 유지");
  });

  // ========================================
  // 테스트 4
  // 서로 다른 DB 연결에서
  // 사진 최대 10장 제한 검증
  // ========================================

  test("서로 다른 DB 연결에서 동시 업로드 시 최대 10장 유지", async (t) => {
    const fixture = createFixture();

    t.after(() => fixture.cleanup());

    // ========================================
    // 기존 활성 사진 9장
    // ========================================

    for (let i = 1; i <= 9; i++) {
      fixture.addPhoto(`active-upload-${i}`, false);
    }

    assert.equal(fixture.activeCount(), 9);

    // ========================================
    // 서로 다른 사진 2장 동시 업로드
    // ========================================

    const results = await runWorkers(
      fixture.dbPath,
      [100, 101],
      5000,
      "upload",
    );

    console.log("📸 서로 다른 사진 동시 업로드:", results);

    // ========================================
    // 업로드 성공 1개
    // ========================================

    assert.equal(results.filter((r) => r.uploaded).length, 1);

    // ========================================
    // 최대 10장 제한 오류 1개
    // ========================================

    assert.equal(
      results.filter((r) => r.error?.code === "PHOTO_LIMIT_EXCEEDED").length,
      1,
    );

    // ========================================
    // 활성 사진 최대 10장
    // ========================================

    assert.equal(fixture.activeCount(), 10);

    // ========================================
    // 전체 레코드 10개
    // ========================================

    assert.equal(fixture.totalCount(), 10);

    // ========================================
    // 성공한 사진 SHA-256 확인
    // ========================================

    const successfulResult = results.find((r) => r.uploaded);

    const storedPhoto = fixture.db
      .prepare(
        `
          SELECT *
          FROM diary_photos
          WHERE id = ?
        `,
      )
      .get(successfulResult.savedPhotoIds[0]);

    assert.ok(storedPhoto);

    assert.equal(
      storedPhoto.content_hash,
      createHash(createImage(`upload-photo-${successfulResult.photoId}`)),
    );

    assert.equal(storedPhoto.is_deleted, 0);

    // ========================================
    // 실패한 사진 레코드 없음
    // ========================================

    const failedResult = results.find((r) => !r.uploaded);

    const failedPhoto = fixture.db
      .prepare(
        `
          SELECT id
          FROM diary_photos
          WHERE storage_key = ?
        `,
      )
      .get(`diary/test/upload-${failedResult.photoId}.png`);

    assert.equal(failedPhoto, undefined);

    console.log("✅ 사진 1장만 추가 업로드");

    console.log("✅ 최대 10장 제한 유지");

    console.log("✅ 초과 사진 DB 저장 차단");

    console.log("✅ 기존 사진 9장 보존");

    console.log("✅ SHA-256 해시 무결성 유지");
  });

  // ========================================
  // 테스트 5
  // 최대 개수 이내 동시 업로드 허용
  // ========================================

  test("서로 다른 DB 연결에서 사진 2장 동시 업로드 성공", async (t) => {
    const fixture = createFixture();

    t.after(() => fixture.cleanup());

    // ========================================
    // 기존 활성 사진 8장
    // ========================================

    for (let i = 1; i <= 8; i++) {
      fixture.addPhoto(`active-upload-${i}`, false);
    }

    assert.equal(fixture.activeCount(), 8);

    // ========================================
    // 서로 다른 사진 2장 동시 업로드
    // ========================================

    const results = await runWorkers(
      fixture.dbPath,
      [200, 201],
      5000,
      "upload",
    );

    console.log("📸 사진 2장 동시 업로드:", results);

    // ========================================
    // 두 요청 모두 성공
    // ========================================

    assert.equal(results.filter((r) => r.uploaded).length, 2);

    assert.ok(results.every((r) => !r.error));

    // ========================================
    // 최종 활성 사진 10장
    // ========================================

    assert.equal(fixture.activeCount(), 10);

    assert.equal(fixture.totalCount(), 10);

    // ========================================
    // 신규 사진 해시 검증
    // ========================================

    for (const result of results) {
      const photo = fixture.db
        .prepare(
          `
            SELECT *
            FROM diary_photos
            WHERE id = ?
          `,
        )
        .get(result.savedPhotoIds[0]);

      assert.ok(photo);

      assert.equal(photo.is_deleted, 0);

      assert.equal(
        photo.content_hash,
        createHash(createImage(`upload-photo-${result.photoId}`)),
      );
    }

    console.log("✅ 사진 2장 동시 업로드 성공");

    console.log("✅ 활성 사진 정확히 10장");

    console.log("✅ 전체 사진 레코드 10개");

    console.log("✅ 두 사진 SHA-256 해시 보존");

    console.log("✅ 기존 사진 8장 보존");
  });
}
