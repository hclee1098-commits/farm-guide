// ========================================
// 🌱 농사 가이드
// 📸 고아 사진 파일 자동 탐지 서비스
// ========================================

const fs = require("node:fs/promises");

const path = require("node:path");

const createPhotoCleanupQueue = require("./photo-cleanup-queue");

// ========================================
// 1. 기본 설정
// ========================================

const PROJECT_ROOT = path.resolve(__dirname, "../..");

const MIN_FILE_AGE_MS = 24 * 60 * 60 * 1000;

// ========================================
// 2. 기본 사진 저장 경로
// ========================================

function getStorageRoot() {
  const configuredPath = process.env.PHOTO_STORAGE_PATH || "storage/photos";

  return path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(PROJECT_ROOT, configuredPath);
}

// ========================================
// 3. 디렉터리 목록 조회
//
// 존재하지 않는 디렉터리는 빈 목록 반환
// 다른 파일 시스템 오류는 그대로 전달
// ========================================

async function readEntries(directory) {
  try {
    return await fs.readdir(directory, {
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

// ========================================
// 4. 고아 사진 탐지
//
// 주의!
// 실제 사진 파일은 삭제하지 않는다.
//
// 정리 작업 큐에 등록만 수행한다.
// ========================================

async function scanOrphanPhotos(db, options = {}) {
  const storageRoot =
    options.storageRoot === undefined
      ? getStorageRoot()
      : path.resolve(options.storageRoot);

  const nowMs = options.nowMs ?? Date.now();

  if (!Number.isFinite(nowMs)) {
    throw new Error("올바르지 않은 검사 시간입니다.");
  }

  const queue = createPhotoCleanupQueue(db);

  const result = {
    scanned: 0,
    referenced: 0,
    recent: 0,
    queued: 0,
    alreadyQueued: 0,
  };

  // ========================================
  // 5. 재배 일지 사진만 검사
  //
  // farm, crop-analysis 사진은 제외
  // ========================================

  const diaryRoot = path.join(storageRoot, "diary");

  const years = await readEntries(diaryRoot);

  // ========================================
  // 6. 연도 디렉터리 검사
  // ========================================

  for (const year of years) {
    if (!year.isDirectory()) {
      continue;
    }

    if (!/^\d{4}$/.test(year.name)) {
      continue;
    }

    const yearPath = path.join(diaryRoot, year.name);

    const months = await readEntries(yearPath);

    // ========================================
    // 7. 월 디렉터리 검사
    // ========================================

    for (const month of months) {
      if (!month.isDirectory()) {
        continue;
      }

      if (!/^(0[1-9]|1[0-2])$/.test(month.name)) {
        continue;
      }

      const monthPath = path.join(yearPath, month.name);

      const files = await readEntries(monthPath);

      // ========================================
      // 8. 사진 파일 검사
      // ========================================

      for (const file of files) {
        // 일반 파일만 검사
        // 심볼릭 링크는 제외
        if (!file.isFile()) {
          continue;
        }

        // 기존 local.storage.js의
        // 파일 이름 규칙과 일치
        if (!/^[0-9a-f-]+\.(jpg|png|webp)$/.test(file.name)) {
          continue;
        }

        const storageKey = `diary/${year.name}/${month.name}/${file.name}`;

        const fullPath = path.join(monthPath, file.name);

        // ========================================
        // 9. 파일 상태 확인
        // ========================================

        let stats;

        try {
          stats = await fs.lstat(fullPath);
        } catch (error) {
          // 검사 중 파일이 사라진 경우
          if (error.code === "ENOENT") {
            continue;
          }

          throw error;
        }

        if (!stats.isFile()) {
          continue;
        }

        result.scanned++;

        // ========================================
        // 10. 최근 파일 보호
        //
        // 수정 시각 기준 24시간 보호
        // ========================================

        const fileAge = nowMs - stats.mtimeMs;

        if (fileAge < MIN_FILE_AGE_MS) {
          result.recent++;

          continue;
        }

        const photo = {
          storageProvider: "local",
          storageKey,
        };

        // ========================================
        // 11. DB에 등록된 사진 보호
        //
        // 소프트 삭제된 사진도 보호
        // ========================================

        if (queue.isReferenced(photo)) {
          result.referenced++;

          continue;
        }

        // ========================================
        // 12. 고아 사진 정리 작업 등록
        //
        // 기존 작업의 시간은 갱신하지 않음
        // ========================================

        const inserted = queue.enqueueIfAbsent(photo);

        if (inserted) {
          result.queued++;

          console.log("📸 고아 사진 정리 작업 등록:", storageKey);
        } else {
          result.alreadyQueued++;
        }
      }
    }
  }

  // ========================================
  // 13. 검사 결과
  // ========================================

  console.log("📸 고아 사진 탐지 완료:", result);

  return result;
}

// ========================================
// 14. 모듈 내보내기
// ========================================

module.exports = scanOrphanPhotos;
