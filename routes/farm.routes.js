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
      const farmId = Number(req.params.id);

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

      const farmArea =
        area === null || area === undefined || area === ""
          ? null
          : Number(area);

      const farmLat =
        latitude === null || latitude === undefined || latitude === ""
          ? null
          : Number(latitude);

      const farmLng =
        longitude === null || longitude === undefined || longitude === ""
          ? null
          : Number(longitude);

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
      const farmId = Number(req.params.id);

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

      const farmArea =
        area === null || area === undefined || area === ""
          ? null
          : Number(area);

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
      const farmId = Number(req.params.id);

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
  // 10. 라우터 반환
  // ========================================

  return router;
}

// ========================================
// 11. 모듈 내보내기
// ========================================

module.exports = createFarmRouter;
