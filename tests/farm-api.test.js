// ========================================
// 🌱 농사 가이드
// 🧪 농장 API 중복 등록 통합 테스트
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

const createFarmRepository = require("../repositories/farm.repository");

// ========================================
// 2. 농장 API 통합 테스트
// ========================================

test("농장 UID 중복 등록 방지 통합 테스트", async (t) => {
  // ========================================
  // 테스트 전용 메모리 DB
  // 실제 농장 데이터는 사용하지 않음
  // ========================================

  const db = new DatabaseSync(":memory:");

  initializeDatabase(db);

  // ========================================
  // 테스트 서버
  // ========================================

  const app = express();

  app.use(express.json());

  app.use("/api/farms", createFarmRouter(db));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => {
      resolve(instance);
    });
  });

  const port = server.address().port;

  const baseUrl = `http://127.0.0.1:${port}/api/farms`;

  // ========================================
  // 테스트 종료 후 자원 정리
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
  // 3. 농장 등록 요청 함수
  // ========================================

  async function registerFarm(uid, name) {
    const response = await fetch(baseUrl, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        name,

        crop: "상추",

        area: 100,

        latitude: 37.5,

        longitude: 127.0,

        address: "테스트 농지",

        farm_uid: uid,
      }),
    });

    return {
      status: response.status,

      body: await response.json(),
    };
  }

  // ========================================
  // 4. 최초 농장 등록
  // ========================================

  const first = await registerFarm("TEST-UID-001", "첫 번째 농장");

  assert.equal(first.status, 201);

  assert.equal(first.body.success, true);

  const firstFarmId = first.body.id;

  console.log("✅ 최초 농장 등록 성공");

  // ========================================
  // 5. 동일 UID 중복 등록 차단
  // ========================================

  const duplicate = await registerFarm("TEST-UID-001", "중복 농장");

  assert.equal(duplicate.status, 409);

  assert.equal(duplicate.body.success, false);

  console.log("✅ 동일 UID 중복 등록 차단");

  // ========================================
  // 6. UID 앞뒤 공백 중복 검사
  // ========================================

  const trimmedDuplicate = await registerFarm(
    "  TEST-UID-001  ",
    "공백 중복 농장",
  );

  assert.equal(trimmedDuplicate.status, 409);

  console.log("✅ UID 공백 중복 검사 성공");

  // ========================================
  // 7. 서로 다른 UID 등록
  // ========================================

  const second = await registerFarm("TEST-UID-002", "두 번째 농장");

  assert.equal(second.status, 201);

  assert.equal(second.body.success, true);

  console.log("✅ 서로 다른 UID 등록 성공");

  // ========================================
  // 8. DB UNIQUE 인덱스 직접 검증
  // ========================================

  const farmRepository = createFarmRepository(db);

  assert.throws(() => {
    farmRepository.create({
      name: "DB 중복 등록 테스트",

      crop: "상추",

      area: 100,

      latitude: 37.5,

      longitude: 127.0,

      address: "테스트 농지",

      pnu: null,

      farm_uid: " TEST-UID-001 ",
    });
  }, /UNIQUE constraint failed/);

  console.log("✅ DB UNIQUE 제약조건 정상");

  // ========================================
  // 9. 기존 농장 삭제
  // ========================================

  const deleteResponse = await fetch(`${baseUrl}/${firstFarmId}`, {
    method: "DELETE",
  });

  assert.equal(deleteResponse.status, 200);

  const deletedFarm = db
    .prepare(
      `
      SELECT
        is_deleted,
        deleted_at

      FROM farms

      WHERE id = ?
    `,
    )
    .get(firstFarmId);

  assert.equal(deletedFarm.is_deleted, 1);

  assert.ok(deletedFarm.deleted_at);

  console.log("✅ 농장 소프트 삭제 성공");

  // ========================================
  // 10. 삭제된 UID 재등록
  // ========================================

  const restored = await registerFarm("TEST-UID-001", "재등록 농장");

  assert.equal(restored.status, 201);

  assert.equal(restored.body.success, true);

  assert.notEqual(restored.body.id, firstFarmId);

  console.log("✅ 삭제된 UID 재등록 성공");

  // ========================================
  // 11. 기존 데이터 보존 확인
  // ========================================

  const originalFarm = db
    .prepare(
      `
      SELECT
        id,
        name,
        is_deleted

      FROM farms

      WHERE id = ?
    `,
    )
    .get(firstFarmId);

  assert.equal(originalFarm.name, "첫 번째 농장");

  assert.equal(originalFarm.is_deleted, 1);

  console.log("✅ 기존 농장 데이터 보존 성공");

  // ========================================
  // 12. 최종 결과
  // ========================================

  console.log("==============================");

  console.log("🌱 농장 API 통합 테스트 완료!");

  console.log("==============================");
});
