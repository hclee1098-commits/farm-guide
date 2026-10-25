// ========================================
// 🌱 농사 가이드 - 농장 API 라우터
// ========================================

// ========================================
// 1. 모듈 불러오기
// ========================================

const express = require("express");

const createFarmRepository = require("../repositories/farm.repository");

// ========================================
// 2. 농장 라우터 생성
// ========================================

function createFarmRouter(db) {
  const router = express.Router();

  // ========================================
  // 3. 농장 Repository 연결
  // ========================================

  const farmRepository = createFarmRepository(db);

  // ========================================
  // 4. 농장 ID 검증
  // ========================================

  function isValidFarmId(farmId) {
    return Number.isSafeInteger(farmId) && farmId > 0;
  }

  // ========================================
  // 🌱 농장 ID 안전 변환
  // 양의 정수 형식만 허용
  // ========================================

  function parseFarmId(value) {
    // ========================================
    // 문자열 형식 검증
    // ========================================

    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
      return NaN;
    }

    // ========================================
    // 숫자 변환
    // ========================================

    const farmId = Number(value);

    // ========================================
    // 안전한 정수 확인
    // ========================================

    if (!isValidFarmId(farmId)) {
      return NaN;
    }

    return farmId;
  }

  // ========================================
  // 🌱 선택 입력 숫자 변환
  // 잘못된 자료형은 NaN으로 처리
  // ========================================

  function parseOptionalNumber(value) {
    // ========================================
    // 입력하지 않은 값
    // ========================================

    if (value === null || value === undefined || value === "") {
      return null;
    }

    // ========================================
    // 숫자 또는 문자열만 허용
    // ========================================

    if (typeof value !== "number" && typeof value !== "string") {
      return NaN;
    }

    // ========================================
    // 공백만 입력한 경우 차단
    // ========================================

    if (typeof value === "string" && value.trim() === "") {
      return NaN;
    }

    // ========================================
    // 숫자로 변환
    // ========================================

    return Number(value);
  }

  // ========================================
  // 5. 농장 목록 조회 API
  // GET /api/farms
  // ========================================

  router.get("/", (req, res) => {
    try {
      const farms = farmRepository.findAll();

      return res.json(farms);
    } catch (error) {
      console.error("농장 목록 조회 오류:", error);

      return res.status(500).json({
        success: false,
        message: "농장 목록 조회 실패",
      });
    }
  });

  // ========================================
  // 6. 농장 상세 조회 API
  // GET /api/farms/:id
  // ========================================

  router.get("/:id", (req, res) => {
    try {
      const farmId = parseFarmId(req.params.id);
      // ========================================
      // 농장 ID 확인
      // ========================================

      if (!isValidFarmId(farmId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 ID가 아닙니다.",
        });
      }

      // ========================================
      // 농장 조회
      // ========================================

      const farm = farmRepository.findById(farmId);

      if (!farm) {
        return res.status(404).json({
          success: false,
          message: "해당 농장을 찾을 수 없습니다.",
        });
      }

      console.log("🌱 농장 상세 조회:", farm.name);

      return res.json(farm);
    } catch (error) {
      console.error("농장 상세 조회 오류:", error);

      return res.status(500).json({
        success: false,
        message: "농장 정보를 불러오지 못했습니다.",
      });
    }
  });

  // ========================================
  // 7. 농장 등록 API
  // POST /api/farms
  // ========================================

  router.post("/", (req, res) => {
    try {
      // ========================================
      // 요청 데이터
      // ========================================

      const { name, crop, area, latitude, longitude, address, pnu, farm_uid } =
        req.body || {};

      // ========================================
      // 농장 이름 검증
      // ========================================

      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "농장 이름을 입력해주세요.",
        });
      }

      // ========================================
      // 입력 데이터 정리
      // ========================================

      const farmName = name.trim();

      const farmCrop = typeof crop === "string" ? crop.trim() : null;

      const farmAddress = typeof address === "string" ? address.trim() : null;

      const farmPnu = typeof pnu === "string" ? pnu.trim() : null;

      const farmUid =
        farm_uid === null || farm_uid === undefined
          ? null
          : String(farm_uid).trim() || null;

      // ========================================
      // 🌱 농장 면적 변환
      // ========================================

      const farmArea = parseOptionalNumber(area);

      // ========================================
      // 📍 위도 변환
      // ========================================

      const farmLat = parseOptionalNumber(latitude);

      // ========================================
      // 📍 경도 변환
      // ========================================

      const farmLng = parseOptionalNumber(longitude);

      // ========================================
      // 농장 면적 검증
      // ========================================

      if (farmArea !== null && (!Number.isFinite(farmArea) || farmArea < 0)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농지 면적을 입력해주세요.",
        });
      }

      // ========================================
      // 위도 / 경도 검증
      // ========================================

      if (
        farmLat === null ||
        farmLng === null ||
        !Number.isFinite(farmLat) ||
        !Number.isFinite(farmLng) ||
        farmLat < -90 ||
        farmLat > 90 ||
        farmLng < -180 ||
        farmLng > 180
      ) {
        return res.status(400).json({
          success: false,
          message: "올바른 농지 위치를 선택해주세요.",
        });
      }

      // ========================================
      // PNU 검증
      // ========================================

      if (farmPnu && !/^\d{19}$/.test(farmPnu)) {
        return res.status(400).json({
          success: false,
          message: "PNU는 19자리 숫자여야 합니다.",
        });
      }

      // ========================================
      // 🌱 동일 농지 중복 등록 방지
      // ========================================

      if (farmUid) {
        const existingFarm = farmRepository.findActiveByUid(farmUid);

        if (existingFarm) {
          return res.status(409).json({
            success: false,
            message: "이미 등록된 농지입니다.",
          });
        }
      }

      // ========================================
      // 농장 등록
      // ========================================

      const farmId = farmRepository.create({
        name: farmName,

        crop: farmCrop,

        area: farmArea,

        latitude: farmLat,

        longitude: farmLng,

        address: farmAddress,

        pnu: farmPnu,

        farm_uid: farmUid,
      });

      console.log("🌱 농장 등록 완료:", farmName);

      return res.status(201).json({
        success: true,
        id: farmId,
        message: "농장 정보가 저장되었습니다.",
      });
    } catch (error) {
      // ========================================
      // 🌱 DB UNIQUE 제약조건 위반
      // ========================================

      if (String(error.message ?? "").includes("idx_farms_active_uid_unique")) {
        return res.status(409).json({
          success: false,
          message: "이미 등록된 농지입니다.",
        });
      }

      console.error("농장 등록 오류:", error);

      return res.status(500).json({
        success: false,
        message: "농장 정보를 저장하지 못했습니다.",
      });
    }
  });

  // ========================================
  // 8. 농장 수정 API
  // PUT /api/farms/:id
  // ========================================

  router.put("/:id", (req, res) => {
    try {
      const farmId = parseFarmId(req.params.id);

      // ========================================
      // 농장 ID 검증
      // ========================================

      if (!isValidFarmId(farmId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 ID가 아닙니다.",
        });
      }

      // ========================================
      // 수정 데이터
      // ========================================

      const { name, crop, area } = req.body || {};

      // ========================================
      // 농장 이름 검증
      // ========================================

      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "농장 이름을 입력해주세요.",
        });
      }

      // ========================================
      // 입력값 정리
      // ========================================

      const farmName = name.trim();

      const farmCrop = typeof crop === "string" ? crop.trim() : null;

      // ========================================
      // 🌱 수정할 농장 면적 변환
      // ========================================

      const farmArea = parseOptionalNumber(area);

      // ========================================
      // 면적 검증
      // ========================================

      if (farmArea !== null && (!Number.isFinite(farmArea) || farmArea < 0)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 면적을 입력해주세요.",
        });
      }

      // ========================================
      // 농장 수정
      // ========================================

      const updated = farmRepository.update(farmId, {
        name: farmName,
        crop: farmCrop,
        area: farmArea,
      });

      // ========================================
      // 수정 대상 확인
      // ========================================

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "수정할 농장을 찾을 수 없습니다.",
        });
      }

      console.log("🌱 농장 정보 수정 완료:", farmId);

      return res.json({
        success: true,
        message: "농장 정보가 수정되었습니다.",
      });
    } catch (error) {
      console.error("농장 수정 오류:", error);

      return res.status(500).json({
        success: false,
        message: "농장 정보를 수정하지 못했습니다.",
      });
    }
  });

  // ========================================
  // 9. 농장 삭제 API
  // DELETE /api/farms/:id
  // ========================================

  router.delete("/:id", (req, res) => {
    try {
      const farmId = parseFarmId(req.params.id);

      // ========================================
      // 농장 ID 검증
      // ========================================

      if (!isValidFarmId(farmId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 ID가 아닙니다.",
        });
      }

      // ========================================
      // 농장 삭제
      // ========================================

      const deleted = farmRepository.remove(farmId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "농장을 찾을 수 없습니다.",
        });
      }

      console.log("🗑 농장 삭제 완료:", farmId);

      return res.json({
        success: true,
        message: "농장이 삭제되었습니다.",
      });
    } catch (error) {
      console.error("농장 삭제 오류:", error);

      return res.status(500).json({
        success: false,
        message: "농장 삭제 중 오류가 발생했습니다.",
      });
    }
  });

  // ========================================
  // 🌱 농장 소프트 삭제 복구 API
  //
  // POST /api/farms/:farmId/restore
  //
  // 200 : 복구 성공
  // 400 : 잘못된 농장 ID
  // 404 : 복구 대상 없음
  // 409 : 활성 농장 UID 충돌
  // 500 : 데이터베이스 오류
  // ========================================

  router.post("/:farmId/restore", (req, res) => {
    try {
      // ========================================
      // 1. 농장 ID 검증
      // ========================================

      const rawFarmId = req.params.farmId;

      if (!/^[1-9]\d*$/.test(rawFarmId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 ID가 아닙니다.",
        });
      }

      const farmId = Number(rawFarmId);

      if (!Number.isSafeInteger(farmId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 ID가 아닙니다.",
        });
      }

      // ========================================
      // 2. 농장 복구 실행
      // ========================================

      const result = farmRepository.restore(farmId);

      // ========================================
      // 3. 복구 대상 없음
      // ========================================

      if (result.status === "not_found") {
        return res.status(404).json({
          success: false,
          message: "복구할 농장을 찾을 수 없습니다.",
        });
      }

      // ========================================
      // 4. 활성 농장 UID 충돌
      // ========================================

      if (result.status === "uid_conflict") {
        return res.status(409).json({
          success: false,
          message:
            "동일한 농지 UID를 사용하는 활성 농장이 있어 복구할 수 없습니다.",
        });
      }

      // ========================================
      // 5. 복구 성공
      // ========================================

      if (result.status === "restored") {
        console.log("🌱 농장 복구 API 성공:", farmId);

        return res.status(200).json({
          success: true,
          message: "농장이 정상적으로 복구되었습니다.",
          farmId,
        });
      }

      // ========================================
      // 6. 예상하지 못한 복구 결과
      // ========================================

      throw new Error("알 수 없는 농장 복구 결과입니다.");
    } catch (error) {
      console.error("농장 복구 오류:", error);

      return res.status(500).json({
        success: false,
        message: "농장 복구 중 오류가 발생했습니다.",
      });
    }
  });

  // ========================================
  // 10. 라우터 반환
  // ========================================

  return router;
}

// ========================================
// 11. 모듈 내보내기
// ========================================

module.exports = createFarmRouter;
