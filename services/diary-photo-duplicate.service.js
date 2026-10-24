// ========================================
// 🌱 농사 가이드
// 📸 재배 일지 사진 중복 검사 서비스
// ========================================

// ========================================
// 1. 모듈 불러오기
// ========================================

const crypto = require("node:crypto");

// ========================================
// 2. 사진 해시 생성
// ========================================

function createPhotoHash(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("올바른 사진 데이터가 아닙니다.");
  }

  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ========================================
// 3. 사진 중복 검사
// ========================================

async function filterDuplicatePhotos({
  farmId,
  diaryId,
  files,
  photoRepository,
  getPhoto,
}) {
  // ========================================
  // 입력 데이터 검증
  // ========================================

  if (!Array.isArray(files)) {
    throw new Error("사진 목록이 올바르지 않습니다.");
  }

  // ========================================
  // 4. 현재 등록된 사진 조회
  // ========================================

  const existingPhotos = photoRepository.findAll(diaryId);

  const photoHashes = new Set();

  // ========================================
  // 5. 기존 사진 해시 확인
  //
  // DB에 해시값이 있으면 바로 사용
  // 해시값이 없으면 기존 방식으로 계산
  // ========================================

  for (const photo of existingPhotos) {
    // ========================================
    // 📸 DB에 저장된 SHA-256 해시값 확인
    // ========================================

    if (
      typeof photo.content_hash === "string" &&
      /^[a-f0-9]{64}$/.test(photo.content_hash)
    ) {
      photoHashes.add(photo.content_hash);

      // 기존 사진 파일을 다시 읽지 않는다.
      continue;
    }

    // ========================================
    // 기존 사진 호환 처리
    //
    // 해시값이 없는 과거 사진은
    // 기존 방식으로 읽어서 계산한다.
    // ========================================

    const savedPhoto = photoRepository.findById(photo.id, diaryId, farmId);

    if (!savedPhoto) {
      continue;
    }

    let imageBuffer;

    // ========================================
    // 기존 BLOB 사진
    // ========================================

    if (savedPhoto.image_data != null) {
      imageBuffer = Buffer.from(savedPhoto.image_data);
    } else {
      // ========================================
      // 로컬 파일 저장 사진
      // ========================================

      if (!savedPhoto.storage_key) {
        throw new Error("사진 저장 위치 정보가 없습니다.");
      }

      imageBuffer = await getPhoto(
        savedPhoto.storage_key,
        savedPhoto.storage_provider || "local",
      );
    }

    // ========================================
    // 기존 사진 해시 저장
    // ========================================

    const hash = createPhotoHash(imageBuffer);

    photoHashes.add(hash);
  }

  // ========================================
  // 6. 신규 사진 중복 검사
  // ========================================

  const uniqueFiles = [];

  let duplicateCount = 0;

  for (const file of files) {
    const hash = createPhotoHash(file.buffer);

    // ========================================
    // 기존 사진 또는
    // 이번 요청에서 중복된 사진
    // ========================================

    if (photoHashes.has(hash)) {
      duplicateCount++;

      continue;
    }

    // ========================================
    // 신규 사진 등록
    // ========================================

    photoHashes.add(hash);

    uniqueFiles.push(file);
  }

  // ========================================
  // 7. 검사 결과 반환
  // ========================================

  return {
    uniqueFiles,
    duplicateCount,
  };
}

// ========================================
// 8. 모듈 내보내기
// ========================================

module.exports = {
  createPhotoHash,
  filterDuplicatePhotos,
};
