// ========================================
// 🌱 농사 가이드
// 📸 사진 저장소 공통 서비스
// ========================================

const localStorage = require("./local.storage");

// ========================================
// 1. 저장소 종류 확인
// ========================================

const STORAGE_PROVIDER = (process.env.PHOTO_STORAGE_PROVIDER || "local")
  .trim()
  .toLowerCase();

// ========================================
// 2. 저장소 선택
// ========================================

function getStorageProvider() {
  switch (STORAGE_PROVIDER) {
    case "local":
      return localStorage;

    case "cloud":
      throw new Error("클라우드 사진 저장소는 아직 구현되지 않았습니다.");

    default:
      throw new Error(`지원하지 않는 사진 저장소입니다: ${STORAGE_PROVIDER}`);
  }
}

// ========================================
// 3. 사진 저장
// ========================================

async function savePhoto(file, category = "diary") {
  if (!file) {
    throw new Error("저장할 사진이 없습니다.");
  }

  const provider = getStorageProvider();

  return provider.save({
    buffer: file.buffer,
    mimeType: file.mimetype,
    category,
  });
}

// ========================================
// 4. 사진 조회
// ========================================

async function getPhoto(storageKey) {
  const provider = getStorageProvider();

  return provider.get(storageKey);
}

// ========================================
// 5. 사진 파일 영구 삭제
// ========================================

async function deletePhotoFile(storageKey) {
  const provider = getStorageProvider();

  return provider.remove(storageKey);
}

// ========================================
// 6. 모듈 내보내기
// ========================================

module.exports = {
  savePhoto,
  getPhoto,
  deletePhotoFile,
};
