// ========================================
// 🌱 농사 가이드
// 📸 재배 일지 사진 중복 검사 테스트
// ========================================

// ========================================
// 1. 테스트 모듈
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

// ========================================
// 2. 중복 검사 서비스
// ========================================

const {
  createPhotoHash,
  filterDuplicatePhotos,
} = require("../services/diary-photo-duplicate.service");

// ========================================
// 3. 테스트용 사진 생성
// ========================================

function createTestFile(content) {
  return {
    buffer: Buffer.from(content),
  };
}

// ========================================
// 4. 테스트용 Repository
// ========================================

function createMockRepository(existingPhotos = []) {
  return {
    findAll() {
      return existingPhotos.map((photo) => ({
        id: photo.id,
        content_hash: photo.content_hash ?? null,
      }));
    },

    findById(photoId) {
      return existingPhotos.find((photo) => photo.id === photoId);
    },
  };
}

// ========================================
// 테스트 1
// 동일한 사진의 해시값 확인
// ========================================

test("동일한 사진은 같은 해시값을 생성한다", () => {
  const photoA = Buffer.from("사진 테스트 데이터");

  const photoB = Buffer.from("사진 테스트 데이터");

  const hashA = createPhotoHash(photoA);

  const hashB = createPhotoHash(photoB);

  assert.equal(hashA, hashB);

  console.log("✅ 동일한 사진 해시값 일치");
});

// ========================================
// 테스트 2
// 기존 BLOB 사진 중복 검사
// ========================================

test("기존 BLOB 사진과 동일한 사진은 제외한다", async () => {
  const photoA = createTestFile("사진 A");

  const photoB = createTestFile("사진 B");

  const photoRepository = createMockRepository([
    {
      id: 1,
      image_data: photoA.buffer,
    },
  ]);

  const result = await filterDuplicatePhotos({
    farmId: 1,

    diaryId: 1,

    files: [photoA, photoB],

    photoRepository,

    getPhoto: async () => {
      throw new Error("BLOB 사진은 파일 조회가 필요하지 않습니다.");
    },
  });

  assert.equal(result.uniqueFiles.length, 1);

  assert.equal(result.duplicateCount, 1);

  assert.equal(result.uniqueFiles[0], photoB);

  console.log("✅ 기존 BLOB 사진 중복 제외");
});

// ========================================
// 테스트 3
// 로컬 저장 사진 중복 검사
// ========================================

test("로컬 저장 사진과 동일한 사진은 제외한다", async () => {
  const photoA = createTestFile("로컬 사진 A");

  const photoRepository = createMockRepository([
    {
      id: 1,
      image_data: null,
      storage_key: "diary/2026/10/test.png",
      storage_provider: "local",
    },
  ]);

  const result = await filterDuplicatePhotos({
    farmId: 1,

    diaryId: 1,

    files: [photoA],

    photoRepository,

    getPhoto: async (storageKey, provider) => {
      assert.equal(storageKey, "diary/2026/10/test.png");

      assert.equal(provider, "local");

      return photoA.buffer;
    },
  });

  assert.equal(result.uniqueFiles.length, 0);

  assert.equal(result.duplicateCount, 1);

  console.log("✅ 로컬 저장 사진 중복 제외");
});

// ========================================
// 테스트 4
// 한 번에 선택한 사진끼리 중복 검사
// ========================================

test("한 번에 선택한 중복 사진은 한 장만 유지한다", async () => {
  const photoA1 = createTestFile("사진 A");

  const photoA2 = createTestFile("사진 A");

  const photoB = createTestFile("사진 B");

  const result = await filterDuplicatePhotos({
    farmId: 1,

    diaryId: 1,

    files: [photoA1, photoA2, photoB],

    photoRepository: createMockRepository(),

    getPhoto: async () => {
      throw new Error("기존 사진이 없습니다.");
    },
  });

  assert.equal(result.uniqueFiles.length, 2);

  assert.equal(result.duplicateCount, 1);

  assert.equal(result.uniqueFiles[0], photoA1);

  assert.equal(result.uniqueFiles[1], photoB);

  console.log("✅ 같은 요청의 중복 사진 제외");
});

// ========================================
// 테스트 5
// 삭제된 사진 재등록
// ========================================

test("삭제된 사진은 다시 등록할 수 있다", async () => {
  const photoA = createTestFile("삭제된 사진 A");

  // ========================================
  // Repository는 삭제되지 않은 사진만
  // 조회하므로 빈 목록을 반환한다.
  // ========================================

  const result = await filterDuplicatePhotos({
    farmId: 1,

    diaryId: 1,

    files: [photoA],

    photoRepository: createMockRepository(),

    getPhoto: async () => {
      throw new Error("기존 사진이 없습니다.");
    },
  });

  assert.equal(result.uniqueFiles.length, 1);

  assert.equal(result.duplicateCount, 0);

  console.log("✅ 삭제된 사진 재등록 가능");
});

// ========================================
// 테스트 6
// 기존 사진 조회 실패
// ========================================

test("기존 사진 조회 실패 시 중복 검사를 중단한다", async () => {
  const photoA = createTestFile("사진 A");

  const photoRepository = createMockRepository([
    {
      id: 1,
      image_data: null,
      storage_key: "diary/2026/10/missing.png",
      storage_provider: "local",
    },
  ]);

  await assert.rejects(
    filterDuplicatePhotos({
      farmId: 1,

      diaryId: 1,

      files: [photoA],

      photoRepository,

      getPhoto: async () => {
        throw new Error("사진 파일을 찾을 수 없습니다.");
      },
    }),

    /사진 파일을 찾을 수 없습니다/,
  );

  console.log("✅ 사진 조회 실패 시 검사 중단");
});

// ========================================
// 테스트 7
// DB에 저장된 SHA-256 해시 우선 사용
// ========================================

test("DB 해시값이 있으면 기존 사진 파일을 읽지 않는다", async () => {
  const photoA = createTestFile("DB 해시 사진 A");

  const photoB = createTestFile("새로운 사진 B");

  const contentHash = createPhotoHash(photoA.buffer);

  let fileReadCount = 0;

  let detailReadCount = 0;

  const photoRepository = {
    findAll() {
      return [
        {
          id: 1,
          content_hash: contentHash,
        },
      ];
    },

    findById() {
      detailReadCount++;

      throw new Error("DB 해시가 있으면 상세 조회가 필요하지 않습니다.");
    },
  };

  const result = await filterDuplicatePhotos({
    farmId: 1,

    diaryId: 1,

    files: [photoA, photoB],

    photoRepository,

    getPhoto: async () => {
      fileReadCount++;

      throw new Error("DB 해시가 있으면 파일을 읽지 않아야 합니다.");
    },
  });

  assert.equal(result.uniqueFiles.length, 1);

  assert.equal(result.duplicateCount, 1);

  assert.equal(result.uniqueFiles[0], photoB);

  assert.equal(fileReadCount, 0);

  assert.equal(detailReadCount, 0);

  console.log("✅ DB 해시 우선 사용 성공");
  console.log("✅ 기존 사진 파일 조회 없음");
});

// ========================================
// 테스트 8
// 해시값이 없는 기존 사진 호환성
// ========================================

test("DB 해시값이 없는 기존 사진은 파일을 읽어 검사한다", async () => {
  const photoA = createTestFile("과거 사진 A");

  let fileReadCount = 0;

  const photoRepository = createMockRepository([
    {
      id: 1,

      content_hash: null,

      image_data: null,

      storage_key: "diary/legacy-photo.png",

      storage_provider: "local",
    },
  ]);

  const result = await filterDuplicatePhotos({
    farmId: 1,

    diaryId: 1,

    files: [photoA],

    photoRepository,

    getPhoto: async (storageKey, provider) => {
      fileReadCount++;

      assert.equal(storageKey, "diary/legacy-photo.png");

      assert.equal(provider, "local");

      return photoA.buffer;
    },
  });

  assert.equal(result.uniqueFiles.length, 0);

  assert.equal(result.duplicateCount, 1);

  assert.equal(fileReadCount, 1);

  console.log("✅ 기존 사진 호환성 유지");
  console.log("✅ 해시 없는 사진 파일 조회 정상");
});
