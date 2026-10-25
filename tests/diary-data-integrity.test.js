// ========================================
// 🌱 농사 가이드
// 🧪 재배 일지 삭제 데이터 무결성 통합 테스트
// ========================================

// ========================================
// 1. 테스트 모듈
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const { DatabaseSync } = require("node:sqlite");

const express = require("express");

const { initializeDatabase } = require("../db/init");

const createFarmRouter = require("../routes/farm.routes");

const createDiaryRouter = require("../routes/diary.routes");

const createDiaryPhotoRouter = require("../routes/diary-photo.routes");

// ========================================
// 2. 재배 일지 삭제 데이터 무결성 테스트
// ========================================

test("재배 일지 삭제 후 사진 데이터 무결성 테스트", async (t) => {
  // ========================================
  // 3. 테스트 전용 메모리 DB
  // ========================================

  const db = new DatabaseSync(":memory:");

  initializeDatabase(db);

  // ========================================
  // 4. 테스트 서버
  // ========================================

  const app = express();

  app.use(express.json());

  app.use("/api/farms", createFarmRouter(db));

  app.use("/api/farms", createDiaryRouter(db));

  app.use("/api/farms", createDiaryPhotoRouter(db));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => {
      resolve(instance);
    });
  });

  const port = server.address().port;

  const baseUrl = `http://127.0.0.1:${port}/api/farms`;

  // ========================================
  // 5. 테스트 종료 후 자원 정리
  // ========================================

  t.after(async () => {
    server.closeAllConnections();

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    db.close();
  });

  // ========================================
  // 6. HTTP 요청 공통 함수
  // ========================================

  async function request(path, method = "GET", body) {
    const options = {
      method,
    };

    if (body !== undefined) {
      options.headers = {
        "Content-Type": "application/json",
      };

      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${baseUrl}${path}`, options);

    const contentType = response.headers.get("content-type") || "";

    const responseBody = contentType.includes("application/json")
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());

    return {
      status: response.status,
      body: responseBody,
    };
  }

  // ========================================
  // 7. 테스트 농장 등록 함수
  // ========================================

  async function registerFarm(uid, name) {
    const response = await request("/", "POST", {
      name,

      crop: "상추",

      area: 100,

      latitude: 37.5,

      longitude: 127.0,

      address: "데이터 무결성 테스트 농지",

      farm_uid: uid,
    });

    assert.equal(response.status, 201);

    assert.equal(response.body.success, true);

    return response.body.id;
  }

  // ========================================
  // 8. 테스트 재배 일지 생성 함수
  // ========================================

  function createDiary(farmId, memo) {
    const result = db
      .prepare(
        `
      INSERT INTO farm_diaries (
        farm_id,
        work_date,
        work_type,
        memo
      )

      VALUES (?, ?, ?, ?)
    `,
      )
      .run(farmId, "2026-10-23", "물주기", memo);

    return Number(result.lastInsertRowid);
  }

  // ========================================
  // 9. 테스트 사진 생성 함수
  // ========================================

  const testImage = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/tYQAAAAASUVORK5CYII=",
    "base64",
  );

  function createPhoto(diaryId) {
    const result = db
      .prepare(
        `
      INSERT INTO diary_photos (
        diary_id,
        mime_type,
        image_data
      )

      VALUES (?, ?, ?)
    `,
      )
      .run(diaryId, "image/png", testImage);

    return Number(result.lastInsertRowid);
  }

  // ========================================
  // 10. 농장 2개 생성
  // ========================================

  const farmId = await registerFarm(
    "DIARY-INTEGRITY-001",
    "첫 번째 테스트 농장",
  );

  const otherFarmId = await registerFarm(
    "DIARY-INTEGRITY-002",
    "두 번째 테스트 농장",
  );

  console.log("✅ 테스트 농장 2개 생성 성공");

  // ========================================
  // 11. 재배 일지 3개 생성
  // ========================================

  const diaryId = createDiary(farmId, "삭제 대상 재배 일지");

  const otherDiaryId = createDiary(farmId, "유지 대상 재배 일지");

  const anotherFarmDiaryId = createDiary(otherFarmId, "다른 농장의 재배 일지");

  console.log("✅ 테스트 재배 일지 3개 생성 성공");

  // ========================================
  // 12. 사진 3개 생성
  // ========================================

  const photoId = createPhoto(diaryId);

  const otherPhotoId = createPhoto(otherDiaryId);

  const anotherFarmPhotoId = createPhoto(anotherFarmDiaryId);

  console.log("✅ 테스트 사진 3개 생성 성공");

  // ========================================
  // 13. 삭제 전 데이터 저장
  // ========================================

  const selectDiary = db.prepare(`
    SELECT *

    FROM farm_diaries

    WHERE id = ?
  `);

  const selectPhoto = db.prepare(`
    SELECT *

    FROM diary_photos

    WHERE id = ?
  `);

  const diaryBefore = selectDiary.get(diaryId);

  const photoBefore = selectPhoto.get(photoId);

  const otherDiaryBefore = selectDiary.get(otherDiaryId);

  const otherPhotoBefore = selectPhoto.get(otherPhotoId);

  const anotherFarmDiaryBefore = selectDiary.get(anotherFarmDiaryId);

  const anotherFarmPhotoBefore = selectPhoto.get(anotherFarmPhotoId);

  // ========================================
  // 14. 삭제 전 사진 조회 확인
  // ========================================

  const photoResponse = await request(
    `/${farmId}/diaries/${diaryId}/photos/${photoId}`,
  );

  assert.equal(photoResponse.status, 200);

  console.log("✅ 삭제 전 사진 조회 성공");

  // ========================================
  // 15. 재배 일지 소프트 삭제
  // ========================================

  const deleteResponse = await request(
    `/${farmId}/diaries/${diaryId}`,
    "DELETE",
  );

  assert.equal(deleteResponse.status, 200);

  console.log("✅ 재배 일지 소프트 삭제 성공");

  // ========================================
  // 16. 재배 일지 삭제 상태 확인
  // ========================================

  const deletedDiary = selectDiary.get(diaryId);

  assert.equal(deletedDiary.is_deleted, 1);

  assert.ok(deletedDiary.deleted_at);

  assert.equal(deletedDiary.farm_id, farmId);

  console.log("✅ 재배 일지 삭제 상태 및 시간 확인");

  // ========================================
  // 17. 삭제된 일지의 사진 보존 확인
  // ========================================

  const preservedPhoto = selectPhoto.get(photoId);

  assert.ok(preservedPhoto);

  assert.deepEqual(preservedPhoto, photoBefore);

  assert.equal(preservedPhoto.is_deleted, 0);

  assert.deepEqual(Buffer.from(preservedPhoto.image_data), testImage);

  console.log("✅ 삭제된 일지의 사진 데이터 보존");

  // ========================================
  // 18. 삭제된 일지 사진 목록 접근 차단
  // ========================================

  const photoListAfter = await request(`/${farmId}/diaries/${diaryId}/photos`);

  assert.equal(photoListAfter.status, 404);

  console.log("✅ 삭제된 일지 사진 목록 접근 차단");

  // ========================================
  // 19. 삭제된 일지 사진 개별 조회 차단
  // ========================================

  const photoAfter = await request(
    `/${farmId}/diaries/${diaryId}/photos/${photoId}`,
  );

  assert.equal(photoAfter.status, 404);

  console.log("✅ 삭제된 일지 사진 개별 조회 차단");

  // ========================================
  // 20. 삭제된 일지 사진 삭제 차단
  // ========================================

  const deletePhotoResponse = await request(
    `/${farmId}/diaries/${diaryId}/photos/${photoId}`,
    "DELETE",
  );

  assert.equal(deletePhotoResponse.status, 404);

  console.log("✅ 삭제된 일지 사진 삭제 차단");

  // ========================================
  // 21. 삭제된 재배 일지 중복 삭제 차단
  // ========================================

  const duplicateDelete = await request(
    `/${farmId}/diaries/${diaryId}`,
    "DELETE",
  );

  assert.equal(duplicateDelete.status, 404);

  console.log("✅ 재배 일지 중복 삭제 차단");

  // ========================================
  // 22. 같은 농장의 다른 일지 보존
  // ========================================

  const otherDiaryAfter = selectDiary.get(otherDiaryId);

  assert.deepEqual(otherDiaryAfter, otherDiaryBefore);

  assert.equal(otherDiaryAfter.is_deleted, 0);

  console.log("✅ 같은 농장의 다른 일지 보존");

  // ========================================
  // 23. 같은 농장의 다른 사진 보존
  // ========================================

  const otherPhotoAfter = selectPhoto.get(otherPhotoId);

  assert.deepEqual(otherPhotoAfter, otherPhotoBefore);

  assert.equal(otherPhotoAfter.is_deleted, 0);

  console.log("✅ 같은 농장의 다른 사진 보존");

  // ========================================
  // 24. 정상 사진 API 접근 확인
  // ========================================

  const otherPhotoResponse = await request(
    `/${farmId}/diaries/${otherDiaryId}/photos/${otherPhotoId}`,
  );

  assert.equal(otherPhotoResponse.status, 200);

  console.log("✅ 정상 재배 일지 사진 조회 성공");

  // ========================================
  // 25. 다른 농장의 데이터 보존
  // ========================================

  const anotherFarmDiaryAfter = selectDiary.get(anotherFarmDiaryId);

  const anotherFarmPhotoAfter = selectPhoto.get(anotherFarmPhotoId);

  assert.deepEqual(anotherFarmDiaryAfter, anotherFarmDiaryBefore);

  assert.deepEqual(anotherFarmPhotoAfter, anotherFarmPhotoBefore);

  console.log("✅ 다른 농장의 데이터 보존");

  // ========================================
  // 26. 다른 농장의 사진 API 정상 확인
  // ========================================

  const anotherFarmPhotoResponse = await request(
    `/${otherFarmId}/diaries/${anotherFarmDiaryId}/photos/${anotherFarmPhotoId}`,
  );

  assert.equal(anotherFarmPhotoResponse.status, 200);

  console.log("✅ 다른 농장의 사진 조회 정상");

  // ========================================
  // 27. 차단 요청 이후 사진 보존 확인
  // ========================================

  const finalPhoto = selectPhoto.get(photoId);

  assert.deepEqual(finalPhoto, photoBefore);

  console.log("✅ 차단 요청 이후 사진 데이터 보존");

  // ========================================
  // 28. 전체 사진 수 확인
  // ========================================

  const photoCount = db
    .prepare(
      `
    SELECT COUNT(*) AS count

    FROM diary_photos
  `,
    )
    .get();

  assert.equal(photoCount.count, 3);

  console.log("✅ 전체 사진 데이터 3개 보존");

  // ========================================
  // 29. 농장 삭제 상태 확인
  // ========================================

  const farms = db
    .prepare(
      `
    SELECT
      id,
      is_deleted

    FROM farms

    ORDER BY id
  `,
    )
    .all();

  assert.equal(farms.length, 2);

  assert.ok(farms.every((farm) => farm.is_deleted === 0));

  console.log("✅ 두 농장 모두 정상 상태 유지");

  // ========================================
  // 30. 최종 결과
  // ========================================

  console.log("================================");

  console.log("📖 재배 일지 삭제 데이터 무결성 테스트 완료!");

  console.log("================================");
});
