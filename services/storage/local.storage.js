// ========================================
// 🌱 농사 가이드
// 📸 로컬 사진 저장소
// ========================================

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

// ========================================
// 1. 사진 저장 경로 설정
// ========================================

const PROJECT_ROOT = path.resolve(__dirname, "../..");

const configuredPath = process.env.PHOTO_STORAGE_PATH || "storage/photos";

const STORAGE_ROOT = path.isAbsolute(configuredPath)
  ? path.resolve(configuredPath)
  : path.resolve(PROJECT_ROOT, configuredPath);

// ========================================
// 2. 허용하는 이미지 형식
// ========================================

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// 사진 한 장 최대 3MB
const MAX_FILE_SIZE = 3 * 1024 * 1024;

// ========================================
// 3. 이미지 파일 검증
// ========================================

function validateImage(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("올바른 사진 데이터가 아닙니다.");
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("사진은 최대 3MB까지 저장할 수 있습니다.");
  }

  if (!IMAGE_TYPES[mimeType]) {
    throw new Error("지원하지 않는 사진 형식입니다.");
  }

  const isJpeg =
    mimeType === "image/jpeg" &&
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isPng =
    mimeType === "image/png" &&
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));

  const isWebp =
    mimeType === "image/webp" &&
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    throw new Error("이미지 파일 내용이 올바르지 않습니다.");
  }
}

// ========================================
// 4. 저장소 키 검증
// ========================================

function resolveStorageKey(storageKey) {
  if (
    typeof storageKey !== "string" ||
    !/^(diary|farm|crop-analysis)\/\d{4}\/\d{2}\/[0-9a-f-]+\.(jpg|png|webp)$/.test(
      storageKey,
    )
  ) {
    throw new Error("올바르지 않은 사진 저장 경로입니다.");
  }

  const fullPath = path.resolve(STORAGE_ROOT, storageKey);

  if (!fullPath.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error("허용되지 않은 사진 경로입니다.");
  }

  return fullPath;
}

// ========================================
// 5. 사진 저장
// ========================================

async function save({ buffer, mimeType, category = "diary" }) {
  validateImage(buffer, mimeType);

  const allowedCategories = ["diary", "farm", "crop-analysis"];

  if (!allowedCategories.includes(category)) {
    throw new Error("올바르지 않은 사진 분류입니다.");
  }

  const now = new Date();

  const year = String(now.getUTCFullYear());

  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  const extension = IMAGE_TYPES[mimeType];

  // 파일 이름 중복 방지
  const fileName = `${crypto.randomUUID()}.${extension}`;

  // DB에 저장할 상대 경로
  const storageKey = `${category}/${year}/${month}/${fileName}`;

  // 실제 저장 경로
  const fullPath = resolveStorageKey(storageKey);

  // 폴더 자동 생성
  await fs.mkdir(path.dirname(fullPath), {
    recursive: true,
    mode: 0o700,
  });

  // 사진 파일 저장
  await fs.writeFile(fullPath, buffer, {
    flag: "wx",
    mode: 0o600,
  });

  console.log("📸 로컬 사진 저장 완료:", storageKey);

  return {
    storageKey,
    mimeType,
    size: buffer.length,
  };
}

// ========================================
// 6. 사진 읽기
// ========================================

async function get(storageKey) {
  const fullPath = resolveStorageKey(storageKey);

  return fs.readFile(fullPath);
}

// ========================================
// 7. 사진 파일 영구 삭제
// ========================================

// 주의!
// 사용자 삭제 버튼에서 직접 호출하지 않는다.
// 보존기간이 지난 사진을 정리하는
// 배치 작업에서 사용하도록 설계한다.

async function remove(storageKey) {
  const fullPath = resolveStorageKey(storageKey);

  await fs.unlink(fullPath);

  console.log("🗑 사진 파일 영구 삭제:", storageKey);
}

// ========================================
// 8. 모듈 내보내기
// ========================================

module.exports = {
  save,
  get,
  remove,
};
