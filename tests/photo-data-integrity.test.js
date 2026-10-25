// ========================================
// 🌱 농사 가이드
// 📸 사진 소프트 삭제 데이터 무결성 테스트
// ========================================

const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const express = require("express");

const { initializeDatabase } = require("../db/init");
const createFarmRouter = require("../routes/farm.routes");
const createDiaryPhotoRouter = require("../routes/diary-photo.routes");
const createFarmRepository = require("../repositories/farm.repository");

// ========================================
// 사진 삭제 데이터 무결성 테스트
// ========================================

test("사진 소프트 삭제 후 데이터 무결성 테스트", async (t) => {
  // ========================================
  // 1. 테스트 전용 DB
  // ========================================

  const db = new DatabaseSync(":memory:");

  initializeDatabase(db);

  const farmRepository = createFarmRepository(db);

  // ========================================
  // 2. 테스트 농장 생성
  // ========================================

  function createFarm(name, uid) {
    return farmRepository.create({
      name,
      crop: "상추",
      area: 100,
      latitude: 37.5,
      longitude: 127.0,
      address: "테스트 농지",
      pnu: null,
      farm_uid: uid,
    });
  }

  const farm1 = createFarm("첫 번째 농장", "PHOTO-TEST-001");
  const farm2 = createFarm("두 번째 농장", "PHOTO-TEST-002");

  console.log("✅ 테스트 농장 2개 생성 성공");

  // ========================================
  // 3. 테스트 재배 일지 생성
  // ========================================

  const insertDiary = db.prepare(`
    INSERT INTO farm_diaries (
      farm_id,
      work_date,
      work_type,
      memo
    )
    VALUES (?, ?, ?, ?)
  `);

  const diary1 = Number(
    insertDiary.run(farm1, "2026-10-23", "물주기", "첫 번째 농장 일지")
      .lastInsertRowid,
  );

  const diary2 = Number(
    insertDiary.run(farm2, "2026-10-23", "물주기", "두 번째 농장 일지")
      .lastInsertRowid,
  );

  console.log("✅ 테스트 재배 일지 2개 생성 성공");

  // ========================================
  // 4. 테스트 사진 생성
  // ========================================

  const insertPhoto = db.prepare(`
    INSERT INTO diary_photos (
      diary_id,
      mime_type,
      image_data
    )
    VALUES (?, ?, ?)
  `);

  function createPhoto(diaryId, content) {
    const image = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      Buffer.from(content),
    ]);

    return Number(insertPhoto.run(diaryId, "image/png", image).lastInsertRowid);
  }

  const photo1 = createPhoto(diary1, "PHOTO-001");
  const photo2 = createPhoto(diary1, "PHOTO-002");
  const photo3 = createPhoto(diary2, "PHOTO-003");

  console.log("✅ 테스트 사진 3개 생성 성공");

  // ========================================
  // 5. 테스트 서버 생성
  // ========================================

  const app = express();

  app.use(express.json());

  app.use("/api/farms", createFarmRouter(db));
  app.use("/api/farms", createDiaryPhotoRouter(db));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => {
      resolve(instance);
    });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/farms`;

  // ========================================
  // 테스트 종료 후 정리
  // ========================================

  t.after(async () => {
    server.closeAllConnections();

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    db.close();
  });

  // ========================================
  // 6. 사진 조회 함수
  // ========================================

  const selectPhoto = db.prepare(`
    SELECT *
    FROM diary_photos
    WHERE id = ?
  `);

  const photoUrl = (farmId, diaryId, photoId) =>
    `${baseUrl}/${farmId}/diaries/${diaryId}/photos/${photoId}`;

  // ========================================
  // 7. 삭제 전 데이터 확인
  // ========================================

  const originalPhoto = selectPhoto.get(photo1);

  assert.equal(originalPhoto.is_deleted, 0);
  assert.ok(originalPhoto.image_data);

  console.log("✅ 삭제 전 사진 데이터 확인");

  // ========================================
  // 8. 사진 개별 삭제
  // ========================================

  const deleteResponse = await fetch(photoUrl(farm1, diary1, photo1), {
    method: "DELETE",
  });

  assert.equal(deleteResponse.status, 200);

  console.log("✅ 사진 개별 삭제 성공");

  // ========================================
  // 9. 소프트 삭제 상태 확인
  // ========================================

  const deletedPhoto = selectPhoto.get(photo1);

  assert.equal(deletedPhoto.is_deleted, 1);
  assert.ok(deletedPhoto.deleted_at);

  console.log("✅ 사진 삭제 상태 및 시간 확인");

  // ========================================
  // 10. 원본 이미지 데이터 보존
  // ========================================

  assert.deepEqual(deletedPhoto.image_data, originalPhoto.image_data);

  console.log("✅ 삭제된 사진 원본 데이터 보존");

  // ========================================
  // 11. 삭제된 사진 조회 차단
  // ========================================

  const deletedGet = await fetch(photoUrl(farm1, diary1, photo1));

  assert.equal(deletedGet.status, 404);

  console.log("✅ 삭제된 사진 조회 차단");

  // ========================================
  // 12. 사진 중복 삭제 차단
  // ========================================

  const duplicateDelete = await fetch(photoUrl(farm1, diary1, photo1), {
    method: "DELETE",
  });

  assert.equal(duplicateDelete.status, 404);

  console.log("✅ 사진 중복 삭제 차단");

  // ========================================
  // 13. 같은 일지의 다른 사진 보존
  // ========================================

  const remainingPhoto = selectPhoto.get(photo2);

  assert.equal(remainingPhoto.is_deleted, 0);
  assert.ok(remainingPhoto.image_data);

  console.log("✅ 같은 일지의 다른 사진 보존");

  // ========================================
  // 14. 다른 농장 사진 보존
  // ========================================

  const otherFarmPhoto = selectPhoto.get(photo3);

  assert.equal(otherFarmPhoto.is_deleted, 0);
  assert.ok(otherFarmPhoto.image_data);

  console.log("✅ 다른 농장 사진 보존");

  // ========================================
  // 15. 다른 농장에서 사진 삭제 차단
  // ========================================

  const crossFarmDelete = await fetch(photoUrl(farm2, diary1, photo2), {
    method: "DELETE",
  });

  assert.equal(crossFarmDelete.status, 404);

  assert.equal(selectPhoto.get(photo2).is_deleted, 0);

  console.log("✅ 다른 농장 사진 삭제 차단");

  // ========================================
  // 16. 사진 목록 무결성 확인
  // ========================================

  const listResponse = await fetch(
    `${baseUrl}/${farm1}/diaries/${diary1}/photos`,
  );

  assert.equal(listResponse.status, 200);

  const activePhotoCount = db
    .prepare(
      `
    SELECT COUNT(*) AS count
    FROM diary_photos
    WHERE diary_id = ?
      AND is_deleted = 0
  `,
    )
    .get(diary1);

  assert.equal(activePhotoCount.count, 1);

  console.log("✅ 활성 사진 목록 무결성 확인");

  // ========================================
  // 17. 전체 데이터 보존 확인
  // ========================================

  const totalPhotos = db
    .prepare(
      `
    SELECT COUNT(*) AS count
    FROM diary_photos
  `,
    )
    .get();

  assert.equal(totalPhotos.count, 3);

  console.log("✅ 전체 사진 데이터 3개 보존");

  // ========================================
  // 최종 결과
  // ========================================

  console.log("================================");
  console.log("📸 사진 소프트 삭제 데이터 무결성 테스트 완료!");
  console.log("================================");
});
