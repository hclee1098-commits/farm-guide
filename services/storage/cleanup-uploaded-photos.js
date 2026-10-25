// ========================================
// 🌱 농사 가이드
// 📸 업로드 실패 사진 파일 정리
// ========================================

// ========================================
// 1. 파일 정리 재시도
// ========================================

async function cleanupUploadedPhotos(
  storedPhotos,
  deletePhotoFile,
  maxAttempts = 3,
) {
  const deleted = [];

  const failed = [];

  // ========================================
  // 2. 이번 요청에서 저장한 사진만 처리
  // ========================================

  for (const photo of storedPhotos) {
    let success = false;

    let lastError = null;

    // ========================================
    // 3. 최대 3회 삭제 시도
    // ========================================

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await deletePhotoFile(photo.storageKey, photo.storageProvider);

        success = true;

        break;
      } catch (error) {
        lastError = error;

        console.error("📸 사진 파일 정리 실패:", {
          storageKey: photo.storageKey,
          attempt,
          message: error.message,
        });
      }
    }

    // ========================================
    // 4. 정리 결과 기록
    // ========================================

    if (success) {
      deleted.push(photo.storageKey);
    } else {
      failed.push({
        storageKey: photo.storageKey,
        storageProvider: photo.storageProvider,
        error: lastError?.message ?? "알 수 없는 오류",
      });
    }
  }

  // ========================================
  // 5. 최종 결과 반환
  // ========================================

  return {
    deleted,
    failed,
  };
}

module.exports = {
  cleanupUploadedPhotos,
};
