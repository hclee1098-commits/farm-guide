// ========================================
// 🌱 농사 가이드
// 📸 사진 파일 정리 재시도 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const {
  cleanupUploadedPhotos,
} = require("../services/storage/cleanup-uploaded-photos");

// ========================================
// 테스트 1. 정상 삭제
// ========================================

test("사진 파일 정상 정리", async () => {
  const storedFiles = new Set(["photo-1"]);

  const result = await cleanupUploadedPhotos(
    [
      {
        storageKey: "photo-1",
        storageProvider: "local",
      },
    ],
    async (key) => {
      storedFiles.delete(key);
    },
  );

  assert.equal(result.deleted.length, 1);

  assert.equal(result.failed.length, 0);

  assert.equal(storedFiles.size, 0);
});

// ========================================
// 테스트 2. 일시적 삭제 실패 후 성공
// ========================================

test("사진 파일 삭제 실패 후 재시도 성공", async () => {
  const storedFiles = new Set(["photo-1"]);

  let attempts = 0;

  const result = await cleanupUploadedPhotos(
    [
      {
        storageKey: "photo-1",
        storageProvider: "local",
      },
    ],
    async (key) => {
      attempts++;

      if (attempts < 3) {
        throw new Error("TEST_DELETE_FAILURE");
      }

      storedFiles.delete(key);
    },
  );

  assert.equal(attempts, 3);

  assert.equal(result.deleted.length, 1);

  assert.equal(result.failed.length, 0);

  assert.equal(storedFiles.size, 0);
});

// ========================================
// 테스트 3. 삭제 3회 모두 실패
// ========================================

test("사진 파일 정리 최종 실패 기록", async () => {
  const storedFiles = new Set(["photo-1"]);

  let attempts = 0;

  const result = await cleanupUploadedPhotos(
    [
      {
        storageKey: "photo-1",
        storageProvider: "local",
      },
    ],
    async () => {
      attempts++;

      throw new Error("TEST_PERMANENT_FAILURE");
    },
  );

  assert.equal(attempts, 3);

  assert.equal(result.deleted.length, 0);

  assert.equal(result.failed.length, 1);

  assert.equal(result.failed[0].storageKey, "photo-1");

  assert.equal(storedFiles.has("photo-1"), true);
});

// ========================================
// 테스트 4. 기존 파일 보호
// ========================================

test("업로드 실패 시 기존 사진 파일 보존", async () => {
  const storedFiles = new Set(["existing-photo", "new-photo"]);

  const result = await cleanupUploadedPhotos(
    [
      {
        storageKey: "new-photo",
        storageProvider: "local",
      },
    ],
    async (key) => {
      storedFiles.delete(key);
    },
  );

  assert.equal(result.deleted.length, 1);

  assert.equal(storedFiles.has("existing-photo"), true);

  assert.equal(storedFiles.has("new-photo"), false);
});
