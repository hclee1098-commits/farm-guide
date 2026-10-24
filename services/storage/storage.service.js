// ========================================
// 🌱 농사 가이드
// 📸 사진 저장소 공통 서비스
// ========================================

// ========================================
// 1. 저장소 모듈
// ========================================

const localStorage = require("./local.storage");

// ========================================
// 2. 기본 저장소 설정
// ========================================

const DEFAULT_STORAGE_PROVIDER = (process.env.PHOTO_STORAGE_PROVIDER || "local")
  .trim()
  .toLowerCase();

// ========================================
// 3. 저장소 선택
// ========================================

function getStorageProvider(providerName = DEFAULT_STORAGE_PROVIDER) {
  switch (providerName) {
    // ========================================
    // 로컬 저장소
    // ========================================

    case "local":
      return localStorage;

    // ========================================
    // 클라우드 저장소
    // 추후 구현
    // ========================================

    case "cloud":
      throw new Error("클라우드 사진 저장소는 아직 구현되지 않았습니다.");

    // ========================================
    // 지원하지 않는 저장소
    // ========================================

    default:
      throw new Error(`지원하지 않는 사진 저장소입니다: ${providerName}`);
  }
}

// ========================================
// 4. 사진 저장
// ========================================

async function savePhoto(file, category = "diary") {
  if (!file || !file.buffer) {
    throw new Error("저장할 사진이 없습니다.");
  }

  // ========================================
  // 저장소 선택
  // ========================================

  const providerName = DEFAULT_STORAGE_PROVIDER;

  const provider = getStorageProvider(providerName);

  // ========================================
  // 실제 사진 저장
  // ========================================

  const result = await provider.save({
    buffer: file.buffer,

    mimeType: file.mimetype,

    category,
  });

  // ========================================
  // 저장 정보 반환
  // ========================================

  return {
    storageProvider: providerName,

    storageKey: result.storageKey,

    mimeType: result.mimeType,

    size: result.size,
  };
}

// ========================================
// 5. 사진 조회
// ========================================

async function getPhoto(storageKey, providerName = DEFAULT_STORAGE_PROVIDER) {
  // ========================================
  // 저장 당시의 저장소 선택
  // ========================================

  const provider = getStorageProvider(providerName);

  // ========================================
  // 실제 사진 읽기
  // ========================================

  return provider.get(storageKey);
}

// ========================================
// 6. 사진 파일 영구 삭제
// ========================================

// 주의!
// 이 함수는 실제 파일을 삭제한다.
//
// 일반적인 사용자 사진 삭제에서는
// 호출하지 않는다.
//
// 업로드 실패 복구 또는
// 보존기간 만료 배치에서만 사용한다.

async function deletePhotoFile(
  storageKey,
  providerName = DEFAULT_STORAGE_PROVIDER,
) {
  const provider = getStorageProvider(providerName);

  return provider.remove(storageKey);
}

// ========================================
// 7. 외부에서 사용할 함수
// ========================================

module.exports = {
  savePhoto,

  getPhoto,

  deletePhotoFile,
};
