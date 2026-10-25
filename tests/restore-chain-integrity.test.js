// ========================================
// 🌱 농사 가이드
// 농장 → 재배 일지 → 사진
// 3단계 복구 연계 데이터 무결성 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const crypto = require("node:crypto");

const express = require("express");

const Database = require("better-sqlite3");

const createFarmRouter = require("../routes/farm.routes");

const createDiaryRouter = require("../routes/diary.routes");

const createDiaryPhotoRouter = require("../routes/diary-photo.routes");

// ========================================
// 1. 테스트용 이미지 생성
// ========================================

function createTestImage(content) {
  const header = Buffer.from("89504e470d0a1a0a", "hex");

  return Buffer.concat([header, Buffer.from(content)]);
}

// ========================================
// 2. SHA-256 해시 생성
// ========================================

function createHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ========================================
// 3. 통합 테스트
// ========================================

test("농장·일지·사진 3단계 복구 연계 무결성", async (t) => {
  // ========================================
  // 테스트 전용 DB
  // ========================================

  const db = new Database(":memory:");

  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE farms (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      crop TEXT,
      area REAL,
      latitude REAL,
      longitude REAL,
      address TEXT,
      pnu TEXT,
      farm_uid TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    );

    CREATE TABLE farm_diaries (
      id INTEGER PRIMARY KEY,
      farm_id INTEGER NOT NULL,
      work_date TEXT NOT NULL,
      work_type TEXT,
      memo TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (farm_id)
        REFERENCES farms(id)
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (diary_id)
        REFERENCES farm_diaries(id)
    );
  `);

  // ========================================
  // 4. 테스트 농장 생성
  // ========================================

  db.exec(`
    INSERT INTO farms (
      id, name, crop, area, farm_uid
    )
    VALUES
      (1, '복구 테스트 농장', '벼', 100, 'CHAIN-001'),
      (2, '독립 테스트 농장', '고추', 200, 'CHAIN-002');

    INSERT INTO farm_diaries (
      id, farm_id, work_date, work_type, memo
    )
    VALUES
      (1, 1, '2026-10-01', '파종', '복구 대상 일지'),
      (2, 1, '2026-10-02', '관수', '정상 유지 일지'),
      (3, 2, '2026-10-03', '수확', '다른 농장 일지');
  `);

  // ========================================
  // 5. 테스트 사진 생성
  // ========================================

  const originalImage = createTestImage("restore-chain-photo");

  const originalHash = createHash(originalImage);

  const insertPhoto = db.prepare(`
    INSERT INTO diary_photos (
      diary_id,
      mime_type,
      image_data,
      content_hash
    )
    VALUES (?, ?, ?, ?)
  `);

  insertPhoto.run(1, "image/png", originalImage, originalHash);

  const otherImage = createTestImage("other-photo");

  insertPhoto.run(2, "image/png", otherImage, createHash(otherImage));

  const secondFarmImage = createTestImage("second-farm-photo");

  insertPhoto.run(3, "image/png", secondFarmImage, createHash(secondFarmImage));

  // ========================================
  // 6. HTTP 테스트 서버
  // ========================================

  const app = express();

  app.use(express.json());

  app.use("/api/farms", createFarmRouter(db));

  app.use("/api/farms", createDiaryRouter(db));

  app.use("/api/farms", createDiaryPhotoRouter(db));

  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve) => {
    server.once("listening", resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    db.close();
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // ========================================
  // 7. HTTP 요청 공통 함수
  // ========================================

  async function request(method, path) {
    return fetch(`${baseUrl}${path}`, {
      method,
    });
  }

  // ========================================
  // HTTP 응답 상태 검증
  // 실패 시 실제 서버 응답 출력
  // ========================================

  async function assertHttpStatus(response, expectedStatus, label) {
    if (response.status !== expectedStatus) {
      const body = await response.clone().text();

      console.error(`❌ ${label} 실패`);

      console.error("예상 상태:", expectedStatus);

      console.error("실제 상태:", response.status);

      console.error("서버 응답:", body);
    }

    assert.equal(response.status, expectedStatus, `${label} HTTP 상태 오류`);
  }

  const farmPath = "/api/farms/1";

  const diaryPath = "/api/farms/1/diaries/1";

  const photoPath = "/api/farms/1/diaries/1/photos/1";

  // ========================================
  // 8. 데이터 상태 조회
  // ========================================

  function getFarm() {
    return db
      .prepare(
        `
      SELECT *
      FROM farms
      WHERE id = 1
    `,
      )
      .get();
  }

  function getDiary() {
    return db
      .prepare(
        `
      SELECT *
      FROM farm_diaries
      WHERE id = 1
    `,
      )
      .get();
  }

  function getPhoto() {
    return db
      .prepare(
        `
      SELECT *
      FROM diary_photos
      WHERE id = 1
    `,
      )
      .get();
  }

  // ========================================
  // 테스트 1
  // 사진 → 일지 → 농장 순서로 삭제
  // ========================================

  await t.test("3단계 소프트 삭제 성공", async () => {
    const photoResponse = await request("DELETE", photoPath);

    assert.equal(photoResponse.status, 200);

    const diaryResponse = await request("DELETE", diaryPath);

    assert.equal(diaryResponse.status, 200);

    const farmResponse = await request("DELETE", farmPath);

    assert.equal(farmResponse.status, 200);

    assert.equal(getFarm().is_deleted, 1);

    assert.equal(getDiary().is_deleted, 1);

    assert.equal(getPhoto().is_deleted, 1);

    assert.ok(getFarm().deleted_at);

    assert.ok(getDiary().deleted_at);

    assert.ok(getPhoto().deleted_at);

    console.log("✅ 농장·일지·사진 소프트 삭제 성공");
  });

  // ========================================
  // 테스트 2
  // 농장만 복구
  // ========================================

  await t.test("농장 복구 시 하위 삭제 상태 유지", async () => {
    // ========================================
    // 1. 농장 복구
    // ========================================

    const response = await request("POST", `${farmPath}/restore`);

    assert.equal(response.status, 200);

    // ========================================
    // 2. 농장 복구 상태 확인
    // ========================================

    const farm = getFarm();

    assert.equal(farm.is_deleted, 0);

    assert.equal(farm.deleted_at, null);

    console.log("✅ 농장 복구 성공");

    // ========================================
    // 3. 재배 일지 삭제 상태 유지
    // ========================================

    const diary = getDiary();

    assert.equal(diary.is_deleted, 1);

    assert.ok(diary.deleted_at);

    console.log("✅ 삭제된 재배 일지 상태 유지");

    // ========================================
    // 4. 사진 삭제 상태 유지
    // ========================================

    const photo = getPhoto();

    assert.equal(photo.is_deleted, 1);

    assert.ok(photo.deleted_at);

    console.log("✅ 삭제된 사진 상태 유지");

    // ========================================
    // 5. 재배 일지 목록 조회
    // ========================================

    const diaryResponse = await request("GET", "/api/farms/1/diaries");

    assert.equal(diaryResponse.status, 200);

    const diaries = await diaryResponse.json();

    assert.ok(Array.isArray(diaries));

    // 삭제된 일지는 목록에서 제외
    const deletedDiary = diaries.find((item) => Number(item.id) === 1);

    assert.equal(deletedDiary, undefined);

    // 기존 정상 일지는 목록 유지
    const activeDiary = diaries.find((item) => Number(item.id) === 2);

    assert.ok(activeDiary);

    console.log("✅ 삭제된 일지 목록 제외 확인");
    console.log("✅ 기존 정상 일지 목록 유지");

    // ========================================
    // 6. 삭제된 사진 접근 차단
    // ========================================

    const photoResponse = await request("GET", photoPath);

    assert.equal(photoResponse.status, 404);

    console.log("✅ 삭제된 사진 HTTP 조회 차단");
  });

  // ========================================
  // 테스트 3
  // 재배 일지 복구
  // ========================================

  await t.test("일지 복구 시 사진 삭제 상태 유지", async () => {
    // ========================================
    // 1. 재배 일지 복구
    // ========================================

    const response = await request("POST", `${diaryPath}/restore`);

    assert.equal(response.status, 200);

    // ========================================
    // 2. 농장 상태 확인
    // ========================================

    assert.equal(getFarm().is_deleted, 0);

    // ========================================
    // 3. 재배 일지 복구 상태 확인
    // ========================================

    const diary = getDiary();

    assert.equal(diary.is_deleted, 0);

    assert.equal(diary.deleted_at, null);

    console.log("✅ 재배 일지 복구 성공");

    // ========================================
    // 4. 사진 삭제 상태 유지
    // ========================================

    const photo = getPhoto();

    assert.equal(photo.is_deleted, 1);

    assert.ok(photo.deleted_at);

    console.log("✅ 사진 삭제 상태 유지");

    // ========================================
    // 5. 재배 일지 목록 조회
    // ========================================

    const diaryResponse = await request("GET", "/api/farms/1/diaries");

    assert.equal(diaryResponse.status, 200);

    const diaries = await diaryResponse.json();

    assert.ok(Array.isArray(diaries));

    // ========================================
    // 6. 복구된 일지 목록 포함 확인
    // ========================================

    const restoredDiary = diaries.find((item) => Number(item.id) === 1);

    assert.ok(restoredDiary);

    assert.equal(restoredDiary.is_deleted, 0);

    console.log("✅ 복구된 재배 일지 목록 포함");

    // ========================================
    // 7. 기존 정상 일지 보존
    // ========================================

    const activeDiary = diaries.find((item) => Number(item.id) === 2);

    assert.ok(activeDiary);

    console.log("✅ 기존 정상 재배 일지 보존");

    // ========================================
    // 8. 삭제된 사진 HTTP 접근 차단
    // ========================================

    const photoResponse = await request("GET", photoPath);

    assert.equal(photoResponse.status, 404);

    console.log("✅ 삭제된 사진 HTTP 조회 차단");
  });
  // ========================================
  // 테스트 4
  // 사진 복구
  // ========================================

  await t.test("사진 복구 후 원본 데이터 유지", async () => {
    const response = await request("PATCH", `${photoPath}/restore`);

    assert.equal(response.status, 200);

    const photo = getPhoto();

    assert.equal(photo.is_deleted, 0);

    assert.equal(photo.deleted_at, null);

    assert.equal(photo.content_hash, originalHash);

    assert.deepEqual(photo.image_data, originalImage);

    // 실제 HTTP 이미지 조회 확인
    const imageResponse = await request("GET", photoPath);

    assert.equal(imageResponse.status, 200);

    const restoredImage = Buffer.from(await imageResponse.arrayBuffer());

    assert.deepEqual(restoredImage, originalImage);

    console.log("✅ 사진 복구 성공");
    console.log("✅ SHA-256 해시 보존");
    console.log("✅ 원본 이미지 보존");
    console.log("✅ HTTP 이미지 조회 성공");
  });

  // ========================================
  // 테스트 5
  // 다른 데이터 영향 확인
  // ========================================

  await t.test("다른 농장과 일지 데이터 보존", () => {
    const secondFarm = db
      .prepare(
        `
      SELECT *
      FROM farms
      WHERE id = 2
    `,
      )
      .get();

    const otherDiary = db
      .prepare(
        `
      SELECT *
      FROM farm_diaries
      WHERE id = 2
    `,
      )
      .get();

    const secondFarmDiary = db
      .prepare(
        `
      SELECT *
      FROM farm_diaries
      WHERE id = 3
    `,
      )
      .get();

    assert.equal(secondFarm.is_deleted, 0);

    assert.equal(otherDiary.is_deleted, 0);

    assert.equal(secondFarmDiary.is_deleted, 0);

    const activePhotos = db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM diary_photos
      WHERE is_deleted = 0
    `,
      )
      .get();

    assert.equal(activePhotos.count, 3);

    console.log("✅ 다른 농장 데이터 보존");
    console.log("✅ 다른 일지 데이터 보존");
    console.log("✅ 전체 사진 데이터 보존");
  });

  // ========================================
  // 테스트 추가
  // 잘못된 복구 순서 차단 검증
  // ========================================

  await t.test("복구 순서 위반 차단 및 데이터 무결성", async () => {
    // ========================================
    // 1. 사진 → 일지 → 농장 재삭제
    // ========================================

    const photoDelete = await request("DELETE", photoPath);

    assert.equal(photoDelete.status, 200);

    const diaryDelete = await request("DELETE", diaryPath);

    assert.equal(diaryDelete.status, 200);

    const farmDelete = await request("DELETE", farmPath);

    assert.equal(farmDelete.status, 200);

    assert.equal(getFarm().is_deleted, 1);

    assert.equal(getDiary().is_deleted, 1);

    assert.equal(getPhoto().is_deleted, 1);

    console.log("✅ 농장·일지·사진 재삭제 성공");

    // ========================================
    // 2. 농장 삭제 상태에서 사진 복구 시도
    // ========================================

    const blockedPhoto = await request("PATCH", `${photoPath}/restore`);

    assert.ok([404, 409].includes(blockedPhoto.status));

    assert.equal(getPhoto().is_deleted, 1);

    assert.ok(getPhoto().deleted_at);

    console.log("✅ 삭제된 농장의 사진 복구 차단");

    // ========================================
    // 3. 농장 삭제 상태에서 일지 복구 시도
    // ========================================

    const blockedDiary = await request("POST", `${diaryPath}/restore`);

    assert.ok([404, 409].includes(blockedDiary.status));

    assert.equal(getDiary().is_deleted, 1);

    assert.ok(getDiary().deleted_at);

    console.log("✅ 삭제된 농장의 일지 복구 차단");

    // ========================================
    // 4. 농장 복구
    // ========================================

    const farmRestore = await request("POST", `${farmPath}/restore`);

    assert.equal(farmRestore.status, 200);

    assert.equal(getFarm().is_deleted, 0);

    assert.equal(getFarm().deleted_at, null);

    assert.equal(getDiary().is_deleted, 1);

    assert.equal(getPhoto().is_deleted, 1);

    console.log("✅ 농장 복구 성공");
    console.log("✅ 하위 데이터 삭제 상태 유지");

    // ========================================
    // 5. 일지 삭제 상태에서 사진 복구 시도
    // ========================================

    const blockedPhotoAgain = await request("PATCH", `${photoPath}/restore`);

    assert.ok([404, 409].includes(blockedPhotoAgain.status));

    assert.equal(getPhoto().is_deleted, 1);

    assert.ok(getPhoto().deleted_at);

    console.log("✅ 삭제된 일지의 사진 복구 차단");

    // ========================================
    // 6. 재배 일지 복구
    // ========================================

    const diaryRestore = await request("POST", `${diaryPath}/restore`);

    assert.equal(diaryRestore.status, 200);

    assert.equal(getDiary().is_deleted, 0);

    assert.equal(getDiary().deleted_at, null);

    assert.equal(getPhoto().is_deleted, 1);

    console.log("✅ 재배 일지 정상 복구");
    console.log("✅ 사진 삭제 상태 유지");

    // ========================================
    // 7. 사진 복구
    // ========================================

    const photoRestore = await request("PATCH", `${photoPath}/restore`);

    assert.equal(photoRestore.status, 200);

    const photo = getPhoto();

    assert.equal(photo.is_deleted, 0);

    assert.equal(photo.deleted_at, null);

    console.log("✅ 사진 정상 복구");

    // ========================================
    // 8. 사진 원본 데이터 무결성 확인
    // ========================================

    assert.equal(photo.content_hash, originalHash);

    assert.deepEqual(photo.image_data, originalImage);

    console.log("✅ SHA-256 해시 보존");
    console.log("✅ 원본 이미지 데이터 보존");

    // ========================================
    // 9. HTTP 사진 조회 확인
    // ========================================

    const imageResponse = await request("GET", photoPath);

    assert.equal(imageResponse.status, 200);

    const restoredImage = Buffer.from(await imageResponse.arrayBuffer());

    assert.deepEqual(restoredImage, originalImage);

    console.log("✅ 복구 사진 HTTP 조회 성공");

    // ========================================
    // 10. 전체 복구 상태 확인
    // ========================================

    assert.equal(getFarm().is_deleted, 0);

    assert.equal(getDiary().is_deleted, 0);

    assert.equal(getPhoto().is_deleted, 0);

    console.log("================================");
    console.log("🌱 복구 순서 위반 방지 검증 완료");
    console.log("================================");
  });

  // ========================================
  // 테스트 6
  // 전체 복구 상태 최종 검증
  // ========================================

  await t.test("전체 복구 상태 최종 검증", () => {
    const farms = db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM farms
      WHERE is_deleted = 0
    `,
      )
      .get();

    const diaries = db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM farm_diaries
      WHERE is_deleted = 0
    `,
      )
      .get();

    const photos = db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM diary_photos
      WHERE is_deleted = 0
    `,
      )
      .get();

    assert.equal(farms.count, 2);

    assert.equal(diaries.count, 3);

    assert.equal(photos.count, 3);

    console.log("================================");
    console.log("🌱 3단계 복구 연계 무결성 검증 완료");
    console.log("================================");

    console.log("✅ 활성 농장:", farms.count);
    console.log("✅ 활성 재배 일지:", diaries.count);
    console.log("✅ 활성 사진:", photos.count);
  });
});
