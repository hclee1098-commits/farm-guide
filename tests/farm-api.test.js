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
  // 🌱 농장 등록 입력값 검증
  // ========================================

  const validFarmData = {
    name: "검증용 농장",
    crop: "상추",
    area: 100,
    latitude: 37.5,
    longitude: 127.0,
    address: "테스트 농지",
    farm_uid: "TEST-UID-VALIDATION",
  };

  // ========================================
  // 잘못된 숫자 입력 목록
  // ========================================

  const invalidInputs = [
    { field: "area", value: -1 },
    { field: "area", value: true },
    { field: "area", value: [] },
    { field: "area", value: " " },

    { field: "latitude", value: 91 },
    { field: "latitude", value: false },
    { field: "latitude", value: " " },

    { field: "longitude", value: 181 },
    { field: "longitude", value: {} },
  ];

  // ========================================
  // 잘못된 입력 등록 차단 확인
  // ========================================

  for (const { field, value } of invalidInputs) {
    const response = await fetch(baseUrl, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        ...validFarmData,
        [field]: value,
      }),
    });

    assert.equal(response.status, 400, `${field} 입력값 검증 실패`);

    const result = await response.json();

    assert.equal(result.success, false);
  }

  console.log("✅ 잘못된 농장 등록 입력값 차단 성공");

  // ========================================
  // 🌱 농장 수정 입력값 검증
  // ========================================

  const invalidUpdate = await fetch(`${baseUrl}/${second.body.id}`, {
    method: "PUT",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      name: "수정 테스트 농장",
      crop: "상추",
      area: [],
    }),
  });

  assert.equal(invalidUpdate.status, 400);

  console.log("✅ 잘못된 농장 수정 입력값 차단 성공");

  // ========================================
  // 🌱 삭제된 농장 상세 조회 차단
  // ========================================

  const deletedFarmResponse = await fetch(`${baseUrl}/${firstFarmId}`);

  assert.equal(deletedFarmResponse.status, 404);

  console.log("✅ 삭제된 농장 상세 조회 차단 성공");

  // ========================================
  // 🌱 농장 중복 삭제 방지
  // ========================================

  const repeatedDelete = await fetch(`${baseUrl}/${firstFarmId}`, {
    method: "DELETE",
  });

  assert.equal(repeatedDelete.status, 404);

  console.log("✅ 농장 중복 삭제 차단 성공");

  // ========================================
  // 🌱 잘못된 농장 ID 검증
  // ========================================

  const invalidFarmIds = [
    "0",
    "-1",
    "1.5",
    "abc",
    "1e0",
    "0x1",
    "01",
    "9007199254740992",
  ];

  // ========================================
  // GET / PUT / DELETE 검증
  // ========================================

  for (const farmId of invalidFarmIds) {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const options = {
        method,
      };

      if (method === "PUT") {
        options.headers = {
          "Content-Type": "application/json",
        };

        options.body = JSON.stringify({
          name: "수정 테스트 농장",
          crop: "상추",
          area: 100,
        });
      }

      const response = await fetch(`${baseUrl}/${farmId}`, options);

      assert.equal(
        response.status,
        400,
        `${method} 잘못된 농장 ID 검증 실패: ${farmId}`,
      );

      const result = await response.json();

      assert.equal(result.success, false);
    }
  }

  console.log("✅ 잘못된 농장 ID 접근 차단 성공");

  // ========================================
  // 🌱 잘못된 등록 요청 데이터 저장 방지
  // ========================================

  const invalidFarmCount = db
    .prepare(
      `
      SELECT COUNT(*) AS count

      FROM farms

      WHERE farm_uid = ?
    `,
    )
    .get("TEST-UID-VALIDATION");

  assert.equal(invalidFarmCount.count, 0);

  console.log("✅ 잘못된 농장 등록 데이터 저장 방지 성공");

  // ========================================
  // 🌱 DB 오류 발생 시 농장 데이터 보존 검증
  // ========================================

  // ========================================
  // 1. 농장 등록 DB 오류 테스트
  // ========================================

  db.exec(`
    CREATE TRIGGER test_farm_insert_failure

    BEFORE INSERT ON farms

    WHEN NEW.farm_uid = 'TEST-UID-DB-FAIL'

    BEGIN
      SELECT RAISE(ABORT, '테스트용 농장 등록 DB 오류');
    END
  `);

  try {
    const beforeCount = db
      .prepare("SELECT COUNT(*) AS count FROM farms")
      .get().count;

    const failedInsert = await registerFarm(
      "TEST-UID-DB-FAIL",
      "DB 오류 테스트 농장",
    );

    assert.equal(failedInsert.status, 500);
    assert.equal(failedInsert.body.success, false);

    const afterCount = db
      .prepare("SELECT COUNT(*) AS count FROM farms")
      .get().count;

    assert.equal(afterCount, beforeCount);

    console.log("✅ 농장 등록 DB 오류 감지 성공");
    console.log("✅ 등록 실패 시 기존 농장 데이터 보존 성공");
  } finally {
    db.exec("DROP TRIGGER test_farm_insert_failure");
  }

  // ========================================
  // 2. 농장 수정 DB 오류 테스트
  // ========================================

  const testFarmId = second.body.id;

  const beforeUpdate = db
    .prepare(
      `
      SELECT name, crop, area

      FROM farms

      WHERE id = ?
    `,
    )
    .get(testFarmId);

  db.exec(`
    CREATE TRIGGER test_farm_update_failure

    BEFORE UPDATE ON farms

    WHEN OLD.id = ${testFarmId}
      AND NEW.name = 'DB 오류 수정 테스트'

    BEGIN
      SELECT RAISE(ABORT, '테스트용 농장 수정 DB 오류');
    END
  `);

  try {
    const failedUpdate = await fetch(`${baseUrl}/${testFarmId}`, {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        name: "DB 오류 수정 테스트",
        crop: "고추",
        area: 200,
      }),
    });

    assert.equal(failedUpdate.status, 500);

    const updateResult = await failedUpdate.json();

    assert.equal(updateResult.success, false);

    const afterUpdate = db
      .prepare(
        `
        SELECT name, crop, area

        FROM farms

        WHERE id = ?
      `,
      )
      .get(testFarmId);

    assert.deepEqual(afterUpdate, beforeUpdate);

    console.log("✅ 농장 수정 DB 오류 감지 성공");
    console.log("✅ 수정 실패 시 기존 농장 정보 보존 성공");
  } finally {
    db.exec("DROP TRIGGER test_farm_update_failure");
  }

  // ========================================
  // 3. 농장 삭제 DB 오류 테스트
  // ========================================

  const beforeDelete = db
    .prepare(
      `
      SELECT is_deleted, deleted_at

      FROM farms

      WHERE id = ?
    `,
    )
    .get(testFarmId);

  db.exec(`
    CREATE TRIGGER test_farm_delete_failure

    BEFORE UPDATE OF is_deleted ON farms

    WHEN OLD.id = ${testFarmId}
      AND NEW.is_deleted = 1

    BEGIN
      SELECT RAISE(ABORT, '테스트용 농장 삭제 DB 오류');
    END
  `);

  try {
    const failedDelete = await fetch(`${baseUrl}/${testFarmId}`, {
      method: "DELETE",
    });

    assert.equal(failedDelete.status, 500);

    const deleteResult = await failedDelete.json();

    assert.equal(deleteResult.success, false);

    const afterDelete = db
      .prepare(
        `
        SELECT is_deleted, deleted_at

        FROM farms

        WHERE id = ?
      `,
      )
      .get(testFarmId);

    assert.deepEqual(afterDelete, beforeDelete);

    assert.equal(afterDelete.is_deleted, 0);

    console.log("✅ 농장 삭제 DB 오류 감지 성공");
    console.log("✅ 삭제 실패 시 기존 농장 데이터 보존 성공");
  } finally {
    db.exec("DROP TRIGGER test_farm_delete_failure");
  }

  console.log("================================");
  console.log("🌱 농장 DB 오류 처리 테스트 완료!");
  console.log("================================");

  // ========================================
  // 12. 최종 결과
  // ========================================

  console.log("==============================");

  console.log("🌱 농장 API 통합 테스트 완료!");

  console.log("==============================");
});
