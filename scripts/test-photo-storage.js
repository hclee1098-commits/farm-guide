// ========================================
// 📸 사진 저장소 독립 테스트
// ========================================

require("dotenv").config();

const assert = require("node:assert/strict");

const storageService = require("../services/storage/storage.service");

// 테스트용 1x1 PNG 이미지
const testImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/SAAAAABJRU5ErkJggg==",
  "base64",
);

async function runTest() {
  let storageKey = null;

  try {
    // ========================================
    // 1. 사진 저장 테스트
    // ========================================

    const saved = await storageService.savePhoto({
      buffer: testImage,
      mimetype: "image/png",
    });

    storageKey = saved.storageKey;

    console.log("✅ 사진 저장 성공:", storageKey);

    // ========================================
    // 2. 사진 조회 테스트
    // ========================================

    const loaded = await storageService.getPhoto(storageKey);

    assert.deepEqual(loaded, testImage);

    console.log("✅ 사진 조회 성공");

    // ========================================
    // 3. 사진 삭제 테스트
    // ========================================

    await storageService.deletePhotoFile(storageKey);

    storageKey = null;

    console.log("✅ 사진 삭제 성공");

    console.log("==============================");
    console.log("📸 사진 저장소 테스트 완료!");
    console.log("==============================");
  } finally {
    // 테스트 도중 오류가 발생한 경우 파일 정리
    if (storageKey) {
      await storageService.deletePhotoFile(storageKey).catch(console.error);
    }
  }
}

runTest().catch((error) => {
  console.error("❌ 사진 저장소 테스트 실패:", error);
  process.exitCode = 1;
});
