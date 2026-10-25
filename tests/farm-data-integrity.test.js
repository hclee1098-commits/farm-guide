// ========================================
// 🌱 농사 가이드
// 🧪 농장 삭제 후 데이터 무결성 통합 테스트
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
// 2. 농장 삭제 데이터 무결성 테스트
// ========================================

test("농장 삭제 후 재배 일지 및 사진 데이터 무결성 테스트", async (t) => {
  // ========================================
  // 3. 테스트 전용 메모리 DB
  // 실제 농장 데이터 사용하지 않음
  // ========================================

  const db = new DatabaseSync(":memory:");

  initializeDatabase(db);

  // ========================================
  // 4. 테스트 서버 생성
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

    let responseBody;

    if (contentType.includes("application/json")) {
      responseBody = await response.json();
    } else {
      responseBody = await response.arrayBuffer();
    }

    return {
      status: response.status,
      body: responseBody,
    };
  }

  // ========================================
  // 7. 테스트 농장 등록
  // ========================================

  const farmResponse = await request("/", "POST", {
    name: "데이터 무결성 테스트 농장",

    crop: "상추",

    area: 100,

    latitude: 37.5,

    longitude: 127.0,

    address: "테스트 농지",

    farm_uid: "INTEGRITY-TEST-001",
  });

  assert.equal(farmResponse.status, 201);

  assert.equal(farmResponse.body.success, true);

  const farmId = farmResponse.body.id;

  console.log("✅ 테스트 농장 등록 성공");

  // ========================================
  // 8. 테스트 재배 일지 생성
  // ========================================

  const diaryResult = db
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
    .run(farmId, "2026-10-23", "물주기", "데이터 무결성 테스트 일지");

  const diaryId = Number(diaryResult.lastInsertRowid);

  console.log("✅ 테스트 재배 일지 생성 성공");

  // ========================================
  // 9. 테스트 사진 생성
  // 실제 파일 저장 없음
  // ========================================

  const testImage = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/tYQAAAAASUVORK5CYII=",
    "base64",
  );

  const photoResult = db
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

  const photoId = Number(photoResult.lastInsertRowid);

  console.log("✅ 테스트 사진 생성 성공");

  // ========================================
  // 10. 삭제 전 API 정상 동작 확인
  // ========================================

  const diaryListBefore = await request(`/${farmId}/diaries`);

  assert.equal(diaryListBefore.status, 200);

  console.log("✅ 삭제 전 재배 일지 조회 성공");

  const photoListBefore = await request(`/${farmId}/diaries/${diaryId}/photos`);

  assert.equal(photoListBefore.status, 200);

  console.log("✅ 삭제 전 사진 목록 조회 성공");

  const photoBefore = await request(
    `/${farmId}/diaries/${diaryId}/photos/${photoId}`,
  );

  assert.equal(photoBefore.status, 200);

  console.log("✅ 삭제 전 사진 개별 조회 성공");

  // ========================================
  // 11. 삭제 전 데이터 상태 저장
  // ========================================

  const diaryBefore = db
    .prepare(
      `
    SELECT *

    FROM farm_diaries

    WHERE id = ?
  `,
    )
    .get(diaryId);

  const photoDataBefore = db
    .prepare(
      `
    SELECT *

    FROM diary_photos

    WHERE id = ?
  `,
    )
    .get(photoId);

  assert.equal(diaryBefore.is_deleted, 0);

  assert.equal(photoDataBefore.is_deleted, 0);

  // ========================================
  // 12. 농장 소프트 삭제
  // ========================================

  const deleteResponse = await request(`/${farmId}`, "DELETE");

  assert.equal(deleteResponse.status, 200);

  assert.equal(deleteResponse.body.success, true);

  console.log("✅ 농장 소프트 삭제 성공");

  // ========================================
  // 13. 농장 삭제 상태 확인
  // ========================================

  const deletedFarm = db
    .prepare(
      `
    SELECT
      id,
      is_deleted,
      deleted_at

    FROM farms

    WHERE id = ?
  `,
    )
    .get(farmId);

  assert.equal(deletedFarm.is_deleted, 1);

  assert.ok(deletedFarm.deleted_at);

  console.log("✅ 농장 삭제 상태 및 시간 확인");

  // ========================================
  // 14. 재배 일지 데이터 보존 확인
  // ========================================

  const diaryAfter = db
    .prepare(
      `
    SELECT *

    FROM farm_diaries

    WHERE id = ?
  `,
    )
    .get(diaryId);

  assert.ok(diaryAfter);

  assert.deepEqual(diaryAfter, diaryBefore);

  assert.equal(diaryAfter.is_deleted, 0);

  console.log("✅ 재배 일지 데이터 보존 성공");

  // ========================================
  // 15. 사진 데이터 보존 확인
  // ========================================

  const photoDataAfter = db
    .prepare(
      `
    SELECT *

    FROM diary_photos

    WHERE id = ?
  `,
    )
    .get(photoId);

  assert.ok(photoDataAfter);

  assert.deepEqual(photoDataAfter, photoDataBefore);

  assert.equal(photoDataAfter.is_deleted, 0);

  assert.deepEqual(Buffer.from(photoDataAfter.image_data), testImage);

  console.log("✅ 사진 데이터 및 이미지 보존 성공");

  // ========================================
  // 16. 삭제된 농장 상세 조회 차단
  // ========================================

  const deletedFarmResponse = await request(`/${farmId}`);

  assert.equal(deletedFarmResponse.status, 404);

  console.log("✅ 삭제된 농장 상세 조회 차단");

  // ========================================
  // 17. 삭제된 농장 재배 일지 목록 차단
  // ========================================

  const diaryListAfter = await request(`/${farmId}/diaries`);

  assert.equal(diaryListAfter.status, 404);

  console.log("✅ 삭제된 농장 재배 일지 목록 차단");

  // ========================================
  // 18. 삭제된 농장 재배 일지 등록 차단
  // ========================================

  const createDiaryAfter = await request(`/${farmId}/diaries`, "POST", {
    work_date: "2026-10-24",

    work_type: "물주기",

    memo: "삭제된 농장 등록 테스트",
  });

  assert.equal(createDiaryAfter.status, 404);

  console.log("✅ 삭제된 농장 재배 일지 등록 차단");

  // ========================================
  // 19. 삭제된 농장 재배 일지 수정 차단
  // ========================================

  const updateDiaryAfter = await request(
    `/${farmId}/diaries/${diaryId}`,
    "PUT",
    {
      work_date: "2026-10-23",

      work_type: "물주기",

      memo: "수정 시도 테스트",
    },
  );

  assert.equal(updateDiaryAfter.status, 404);

  console.log("✅ 삭제된 농장 재배 일지 수정 차단");

  // ========================================
  // 20. 삭제된 농장 재배 일지 삭제 차단
  // ========================================

  const deleteDiaryAfter = await request(
    `/${farmId}/diaries/${diaryId}`,
    "DELETE",
  );

  assert.equal(deleteDiaryAfter.status, 404);

  console.log("✅ 삭제된 농장 재배 일지 삭제 차단");

  // ========================================
  // 21. 삭제된 농장 사진 목록 차단
  // ========================================

  const photoListAfter = await request(`/${farmId}/diaries/${diaryId}/photos`);

  assert.equal(photoListAfter.status, 404);

  console.log("✅ 삭제된 농장 사진 목록 차단");

  // ========================================
  // 22. 삭제된 농장 사진 개별 조회 차단
  // ========================================

  const photoAfter = await request(
    `/${farmId}/diaries/${diaryId}/photos/${photoId}`,
  );

  assert.equal(photoAfter.status, 404);

  console.log("✅ 삭제된 농장 사진 개별 조회 차단");

  // ========================================
  // 23. 삭제된 농장 사진 삭제 차단
  // ========================================

  const deletePhotoAfter = await request(
    `/${farmId}/diaries/${diaryId}/photos/${photoId}`,
    "DELETE",
  );

  assert.equal(deletePhotoAfter.status, 404);

  console.log("✅ 삭제된 농장 사진 삭제 차단");

  // ========================================
  // 24. 차단된 요청 이후 데이터 보존 확인
  // ========================================

  const finalDiary = db
    .prepare(
      `
    SELECT *

    FROM farm_diaries

    WHERE id = ?
  `,
    )
    .get(diaryId);

  const finalPhoto = db
    .prepare(
      `
    SELECT *

    FROM diary_photos

    WHERE id = ?
  `,
    )
    .get(photoId);

  assert.deepEqual(finalDiary, diaryBefore);

  assert.deepEqual(finalPhoto, photoDataBefore);

  console.log("✅ 차단된 요청 이후 기존 데이터 보존");

  // ========================================
  // 25. 신규 재배 일지 생성 방지 확인
  // ========================================

  const diaryCount = db
    .prepare(
      `
    SELECT COUNT(*) AS count

    FROM farm_diaries

    WHERE farm_id = ?
  `,
    )
    .get(farmId);

  assert.equal(diaryCount.count, 1);

  console.log("✅ 삭제된 농장 신규 일지 생성 방지");

  // ========================================
  // 26. 최종 결과
  // ========================================

  console.log("================================");

  console.log("🌱 농장 삭제 데이터 무결성 테스트 완료!");

  console.log("================================");
});
