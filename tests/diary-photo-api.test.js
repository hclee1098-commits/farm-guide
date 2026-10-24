// ========================================
// 🌱 농사 가이드
// 📸 재배 일지 사진 API 통합 테스트
// ========================================

// ========================================
// 1. 모듈 불러오기
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const crypto = require("node:crypto");

const express = require("express");

const Database = require("better-sqlite3");

// ========================================
// 2. 테스트용 PNG 데이터 생성
// ========================================

function createTestImage(content) {
  const pngHeader = Buffer.from("89504e470d0a1a0a", "hex");

  return Buffer.concat([pngHeader, Buffer.from(content)]);
}

// ========================================
// 3. SHA-256 해시 생성
// ========================================

function createHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ========================================
// 4. 사진 API 통합 테스트
// ========================================

test("재배 일지 사진 API 통합 테스트", async (t) => {
  // ========================================
  // 테스트 전용 사진 저장소
  // ========================================

  const storedFiles = new Map();

  let storageSequence = 0;

  // ========================================
  // 📸 테스트용 파일 저장 오류 제어
  // ========================================

  let saveAttemptCount = 0;

  let failSaveOnAttempt = null;

  const storageModulePath =
    require.resolve("../services/storage/storage.service");

  const routerModulePath = require.resolve("../routes/diary-photo.routes");

  const previousStorageModule = require.cache[storageModulePath];

  const previousRouterModule = require.cache[routerModulePath];

  // ========================================
  // 실제 파일 저장 대신 메모리 사용
  // ========================================

  require.cache[storageModulePath] = {
    id: storageModulePath,

    filename: storageModulePath,

    loaded: true,

    exports: {
      async savePhoto(file) {
        // ========================================
        // 파일 저장 시도 횟수 기록
        // ========================================

        saveAttemptCount++;

        // ========================================
        // 테스트에서 지정한 순서에 오류 발생
        // ========================================

        if (saveAttemptCount === failSaveOnAttempt) {
          throw new Error("테스트용 사진 파일 저장 실패");
        }

        // ========================================
        // 정상적인 사진 저장
        // ========================================

        const storageKey = `test/photo-${++storageSequence}.png`;

        storedFiles.set(storageKey, Buffer.from(file.buffer));

        return {
          storageProvider: "local",

          storageKey,

          mimeType: file.mimetype,

          size: file.buffer.length,
        };
      },

      async getPhoto(storageKey) {
        const buffer = storedFiles.get(storageKey);

        if (!buffer) {
          throw new Error("테스트 사진을 찾을 수 없습니다.");
        }

        return buffer;
      },

      async deletePhotoFile(storageKey) {
        return storedFiles.delete(storageKey);
      },
    },
  };

  delete require.cache[routerModulePath];

  const createDiaryPhotoRouter = require("../routes/diary-photo.routes");

  // ========================================
  // 5. 테스트 전용 SQLite DB
  // ========================================

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
    VALUES (1);

    INSERT INTO farm_diaries (id, farm_id)
    VALUES (1, 1);
  `);

  // ========================================
  // 6. 테스트 서버 생성
  // ========================================

  const app = express();

  app.use("/api/farms", createDiaryPhotoRouter(db));

  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));

    instance.once("error", reject);
  });

  const address = server.address();

  const baseUrl = `http://127.0.0.1:${address.port}`;

  const photoUrl = `${baseUrl}/api/farms/1/diaries/1/photos`;

  // ========================================
  // 7. 테스트 종료 시 자원 정리
  // ========================================

  t.after(async () => {
    try {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    } finally {
      db.close();

      storedFiles.clear();

      if (previousStorageModule) {
        require.cache[storageModulePath] = previousStorageModule;
      } else {
        delete require.cache[storageModulePath];
      }

      if (previousRouterModule) {
        require.cache[routerModulePath] = previousRouterModule;
      } else {
        delete require.cache[routerModulePath];
      }
    }
  });

  // ========================================
  // 8. 사진 업로드 요청 함수
  // ========================================

  async function uploadPhotos(images, diaryId = 1) {
    const form = new FormData();

    for (let i = 0; i < images.length; i++) {
      form.append(
        "photos",

        new Blob([images[i]], { type: "image/png" }),

        `photo-${i}.png`,
      );
    }

    const response = await fetch(
      `${baseUrl}/api/farms/1/diaries/${diaryId}/photos`,
      {
        method: "POST",
        body: form,
      },
    );

    const result = await response.json();

    return {
      status: response.status,
      result,
    };
  }

  // ========================================
  // 9. 활성 사진 개수 확인
  // ========================================

  function countActivePhotos() {
    const row = db
      .prepare(
        `
      SELECT COUNT(*) AS count

      FROM diary_photos

      WHERE diary_id = 1
        AND is_deleted = 0
    `,
      )
      .get();

    return row.count;
  }

  // ========================================
  // 테스트 1
  // 신규 사진 등록
  // ========================================

  const imageA = createTestImage("photo-A");

  const firstUpload = await uploadPhotos([imageA]);

  assert.equal(firstUpload.status, 201);

  assert.equal(firstUpload.result.uploadedCount, 1);

  assert.equal(countActivePhotos(), 1);

  console.log("✅ 신규 사진 HTTP 업로드 성공");

  // ========================================
  // 테스트 2
  // SHA-256 DB 저장 확인
  // ========================================

  const savedPhoto = db
    .prepare(
      `
    SELECT id, content_hash

    FROM diary_photos

    WHERE diary_id = 1
      AND is_deleted = 0
  `,
    )
    .get();

  assert.equal(savedPhoto.content_hash, createHash(imageA));

  console.log("✅ SHA-256 해시 DB 저장 성공");

  // ========================================
  // 테스트 3
  // 동일 사진 중복 등록 차단
  // ========================================

  const duplicateUpload = await uploadPhotos([imageA]);

  assert.equal(duplicateUpload.status, 200);

  assert.equal(duplicateUpload.result.uploadedCount, 0);

  assert.equal(duplicateUpload.result.duplicateCount, 1);

  assert.equal(countActivePhotos(), 1);

  console.log("✅ 동일 사진 재등록 중복 제외");

  // ========================================
  // 테스트 4
  // 한 요청 내 중복 사진 제외
  // ========================================

  const imageB = createTestImage("photo-B");

  const imageC = createTestImage("photo-C");

  const multipleUpload = await uploadPhotos([imageB, imageB, imageC]);

  assert.equal(multipleUpload.status, 201);

  assert.equal(multipleUpload.result.uploadedCount, 2);

  assert.equal(multipleUpload.result.duplicateCount, 1);

  assert.equal(countActivePhotos(), 3);

  console.log("✅ 여러 장 업로드 중복 제외 성공");

  // ========================================
  // 테스트 5
  // 사진 목록 API
  // ========================================

  const listResponse = await fetch(photoUrl);

  assert.equal(listResponse.status, 200);

  const listResult = await listResponse.json();

  assert.equal(listResult.count, 3);

  assert.equal(listResult.photos.length, 3);

  // ========================================
  // 내부 해시값 노출 여부 확인
  // ========================================

  for (const photo of listResult.photos) {
    assert.equal(Object.hasOwn(photo, "content_hash"), false);
  }

  console.log("✅ 사진 목록 API 정상");

  console.log("✅ API 응답에서 내부 해시값 제외");

  // ========================================
  // 테스트 6
  // 사진 개별 HTTP 조회
  // ========================================

  const imageResponse = await fetch(`${photoUrl}/${savedPhoto.id}`);

  assert.equal(imageResponse.status, 200);

  const returnedImage = Buffer.from(await imageResponse.arrayBuffer());

  assert.deepEqual(returnedImage, imageA);

  console.log("✅ 사진 개별 HTTP 조회 성공");

  // ========================================
  // 테스트 7
  // 최대 10장까지 등록
  // ========================================

  const additionalImages = [];

  for (let i = 0; i < 7; i++) {
    additionalImages.push(createTestImage(`additional-${i}`));
  }

  const additionalUpload = await uploadPhotos(additionalImages);

  assert.equal(additionalUpload.status, 201);

  assert.equal(additionalUpload.result.uploadedCount, 7);

  assert.equal(countActivePhotos(), 10);

  console.log("✅ 사진 최대 10장 등록 성공");

  // ========================================
  // 테스트 8
  // 10장 초과 등록 차단
  // ========================================

  const overflowUpload = await uploadPhotos([
    createTestImage("overflow-photo"),
  ]);

  assert.equal(overflowUpload.status, 400);

  assert.equal(countActivePhotos(), 10);

  console.log("✅ 사진 10장 초과 등록 차단");

  // ========================================
  // 테스트 9
  // 사진 개별 논리 삭제
  // ========================================

  const deleteResponse = await fetch(`${photoUrl}/${savedPhoto.id}`, {
    method: "DELETE",
  });

  assert.equal(deleteResponse.status, 200);

  assert.equal(countActivePhotos(), 9);

  const deletedPhoto = db
    .prepare(
      `
    SELECT is_deleted

    FROM diary_photos

    WHERE id = ?
  `,
    )
    .get(savedPhoto.id);

  assert.equal(deletedPhoto.is_deleted, 1);

  console.log("✅ 사진 개별 논리 삭제 성공");

  // ========================================
  // 테스트 10
  // 삭제한 사진 재등록
  // ========================================

  const restoreUpload = await uploadPhotos([imageA]);

  assert.equal(restoreUpload.status, 201);

  assert.equal(restoreUpload.result.uploadedCount, 1);

  assert.equal(countActivePhotos(), 10);

  console.log("✅ 삭제된 사진 재등록 성공");

  // ========================================
  // 테스트 11
  // 다른 농장 ID 접근 차단
  // ========================================

  const invalidFarmResponse = await fetch(
    `${baseUrl}/api/farms/999/diaries/1/photos`,
  );

  assert.equal(invalidFarmResponse.status, 404);

  console.log("✅ 다른 농장 ID 접근 차단");

  // ========================================
  // 테스트 12
  // 여러 장 업로드 중 파일 저장 실패
  // ========================================

  await t.test("사진 파일 저장 실패 시 신규 파일을 정리한다", async () => {
    // ========================================
    // 테스트용 재배 일지 추가
    // ========================================

    db.prepare(
      `
        INSERT INTO farm_diaries (id, farm_id)
        VALUES (?, ?)
      `,
    ).run(2, 1);

    // ========================================
    // 기존 사진 상태 보관
    // ========================================

    const existingFiles = new Map(storedFiles);

    const existingPhotoCount = countActivePhotos();

    // ========================================
    // 테스트 사진 생성
    // ========================================

    const image1 = createTestImage("storage-failure-1");

    const image2 = createTestImage("storage-failure-2");

    // ========================================
    // 두 번째 파일 저장 시 오류 발생
    // ========================================

    failSaveOnAttempt = saveAttemptCount + 2;

    let response;

    try {
      response = await uploadPhotos([image1, image2], 2);
    } finally {
      // ========================================
      // 테스트 오류 설정 초기화
      // ========================================

      failSaveOnAttempt = null;
    }

    // ========================================
    // HTTP 오류 응답 확인
    // ========================================

    assert.equal(response.status, 500);

    assert.equal(response.result.success, false);

    // ========================================
    // 신규 사진 DB 저장 여부 확인
    // ========================================

    const newPhotoCount = db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM diary_photos
          WHERE diary_id = 2
        `,
      )
      .get().count;

    assert.equal(newPhotoCount, 0);

    // ========================================
    // 첫 번째 저장 파일 정리 확인
    // ========================================

    assert.deepEqual(storedFiles, existingFiles);

    // ========================================
    // 기존 사진 보존 확인
    // ========================================

    assert.equal(countActivePhotos(), existingPhotoCount);

    console.log("✅ 사진 파일 저장 실패 감지");

    console.log("✅ 부분 저장된 신규 파일 정리 성공");

    console.log("✅ 기존 사진 데이터 보존 성공");
  });

  // ========================================
  // 테스트 13
  // DB 저장 실패 시 전체 롤백
  // ========================================

  await t.test(
    "DB 저장 실패 시 신규 파일을 정리하고 트랜잭션을 롤백한다",
    async () => {
      // ========================================
      // 기존 사진 상태 보관
      // ========================================

      const existingFiles = new Map(storedFiles);

      const existingPhotoCount = countActivePhotos();

      // ========================================
      // 테스트 사진 생성
      // ========================================

      const image1 = createTestImage("database-failure-1");

      const image2 = createTestImage("database-failure-2");

      // ========================================
      // 두 번째 사진의 해시 생성
      // ========================================

      const failingHash = createHash(image2);

      // ========================================
      // 두 번째 사진 INSERT에서
      // 강제로 DB 오류 발생
      // ========================================

      db.exec(`
        CREATE TRIGGER test_photo_insert_failure

        BEFORE INSERT ON diary_photos

        WHEN NEW.diary_id = 2
          AND NEW.content_hash = '${failingHash}'

        BEGIN
          SELECT RAISE(
            ABORT,
            '테스트용 사진 DB 저장 실패'
          );
        END;
      `);

      let response;

      try {
        // ========================================
        // 사진 두 장 업로드
        // ========================================

        response = await uploadPhotos([image1, image2], 2);
      } finally {
        // ========================================
        // 테스트용 트리거 제거
        // ========================================

        db.exec(`
          DROP TRIGGER IF EXISTS test_photo_insert_failure
        `);
      }

      // ========================================
      // HTTP 오류 응답 확인
      // ========================================

      assert.equal(response.status, 500);

      assert.equal(response.result.success, false);

      // ========================================
      // DB 전체 롤백 확인
      // ========================================

      const newPhotoCount = db
        .prepare(
          `
          SELECT COUNT(*) AS count

          FROM diary_photos

          WHERE diary_id = 2
        `,
        )
        .get().count;

      assert.equal(newPhotoCount, 0);

      // ========================================
      // 신규 저장 파일 정리 확인
      // ========================================

      assert.deepEqual(storedFiles, existingFiles);

      // ========================================
      // 기존 사진 데이터 보존 확인
      // ========================================

      assert.equal(countActivePhotos(), existingPhotoCount);

      console.log("✅ DB 저장 실패 감지");

      console.log("✅ DB 트랜잭션 전체 롤백 성공");

      console.log("✅ 신규 저장 파일 정리 성공");

      console.log("✅ 기존 사진 데이터 보존 성공");
    },
  );

  // ========================================
  // 테스트 완료
  // ========================================

  console.log("==============================");

  console.log("📸 사진 API 통합 테스트 완료!");

  console.log("==============================");
});
