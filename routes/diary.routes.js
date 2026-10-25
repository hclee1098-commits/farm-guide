// ========================================
// 🌱 농사 가이드 - 재배 일지 API
// ========================================

// ========================================
// 1. 모듈 불러오기
// ========================================

const express = require("express");

const createDiaryRepository = require("../repositories/diary.repository");

// ========================================
// 2. 재배 일지 라우터 생성
// ========================================

function createDiaryRouter(db) {
  const router = express.Router();

  // ========================================
  // 3. Repository 연결
  // ========================================

  const diaryRepository = createDiaryRepository(db);

  // ========================================
  // 4. ID 검증 공통 함수
  // ========================================

  function isValidId(id) {
    return Number.isSafeInteger(id) && id > 0;
  }

  // ========================================
  // 5. 재배 일지 입력값 검증
  // 등록 / 수정 공통 사용
  // ========================================

  function validateDiaryInput(body) {
    const { work_date, work_type, memo } = body || {};

    // ========================================
    // 작업 날짜 형식 확인
    // ========================================

    if (
      typeof work_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(work_date)
    ) {
      return {
        valid: false,
        message: "올바른 작업 날짜를 입력해주세요.",
      };
    }

    // ========================================
    // 실제 존재하는 날짜 확인
    // ========================================

    const date = new Date(`${work_date}T00:00:00Z`);

    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== work_date
    ) {
      return {
        valid: false,
        message: "존재하지 않는 날짜입니다.",
      };
    }

    // ========================================
    // 작업 종류 검증
    // ========================================

    if (
      typeof work_type !== "string" ||
      !work_type.trim() ||
      work_type.trim().length > 50
    ) {
      return {
        valid: false,
        message: "작업 종류는 1~50자로 입력해주세요.",
      };
    }

    // ========================================
    // 작업 내용 형식 검증
    // ========================================

    if (memo !== undefined && memo !== null && typeof memo !== "string") {
      return {
        valid: false,
        message: "작업 내용은 문자열이어야 합니다.",
      };
    }

    // ========================================
    // 작업 내용 정리
    // ========================================

    const workMemo = typeof memo === "string" ? memo.trim() : "";

    // ========================================
    // 작업 내용 길이 검증
    // ========================================

    if (workMemo.length > 2000) {
      return {
        valid: false,
        message: "작업 내용은 2000자 이하로 입력해주세요.",
      };
    }

    // ========================================
    // 검증 성공
    // ========================================

    return {
      valid: true,

      data: {
        work_date,
        work_type: work_type.trim(),
        memo: workMemo,
      },
    };
  }

  // ========================================
  // 6. 농장별 재배 일지 목록 조회
  // GET /api/farms/:farmId/diaries
  // ========================================

  router.get("/:farmId/diaries", (req, res) => {
    try {
      // ========================================
      // 농장 ID 확인
      // ========================================

      const farmId = Number(req.params.farmId);

      if (!isValidId(farmId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 ID가 아닙니다.",
        });
      }

      // ========================================
      // 농장 존재 여부 확인
      // ========================================

      if (!diaryRepository.farmExists(farmId)) {
        return res.status(404).json({
          success: false,
          message: "해당 농장을 찾을 수 없습니다.",
        });
      }

      // ========================================
      // 재배 일지 목록 조회
      // ========================================

      const diaries = diaryRepository.findAllByFarmId(farmId);

      console.log("📖 재배 일지 목록 조회 완료:", farmId, diaries.length);

      // ========================================
      // 기존 프론트엔드 응답 형식 유지
      // ========================================

      return res.json(diaries);
    } catch (error) {
      console.error("재배 일지 조회 오류:", error);

      return res.status(500).json({
        success: false,
        message: "재배 일지를 불러오지 못했습니다.",
      });
    }
  });

  // ========================================
  // 7. 재배 일지 등록
  // POST /api/farms/:farmId/diaries
  // ========================================

  router.post("/:farmId/diaries", (req, res) => {
    try {
      // ========================================
      // 농장 ID 확인
      // ========================================

      const farmId = Number(req.params.farmId);

      if (!isValidId(farmId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 ID가 아닙니다.",
        });
      }

      // ========================================
      // 입력값 검증
      // ========================================

      const validation = validateDiaryInput(req.body);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message,
        });
      }

      // ========================================
      // 농장 존재 여부 확인
      // ========================================

      if (!diaryRepository.farmExists(farmId)) {
        return res.status(404).json({
          success: false,
          message: "해당 농장을 찾을 수 없습니다.",
        });
      }

      // ========================================
      // 재배 일지 등록
      // ========================================

      const diaryId = diaryRepository.create(farmId, validation.data);

      console.log("🌱 재배 일지 등록 완료:", diaryId);

      // ========================================
      // 등록 결과 반환
      // ========================================

      return res.status(201).json({
        success: true,
        id: diaryId,
        message: "재배 일지가 저장되었습니다.",
      });
    } catch (error) {
      console.error("재배 일지 등록 오류:", error);

      return res.status(500).json({
        success: false,
        message: "재배 일지를 저장하지 못했습니다.",
      });
    }
  });

  // ========================================
  // 8. 재배 일지 수정
  // PUT /api/farms/:farmId/diaries/:diaryId
  // ========================================

  router.put("/:farmId/diaries/:diaryId", (req, res) => {
    try {
      // ========================================
      // 농장 및 일지 ID 확인
      // ========================================

      const farmId = Number(req.params.farmId);

      const diaryId = Number(req.params.diaryId);

      if (!isValidId(farmId) || !isValidId(diaryId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 또는 재배 일지 ID가 아닙니다.",
        });
      }

      // ========================================
      // 수정 대상 확인
      // ========================================

      const existingDiary = diaryRepository.findById(diaryId, farmId);

      if (!existingDiary) {
        return res.status(404).json({
          success: false,
          message: "수정할 재배 일지를 찾을 수 없습니다.",
        });
      }

      // ========================================
      // 입력값 검증
      // ========================================

      const validation = validateDiaryInput(req.body);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message,
        });
      }

      // ========================================
      // 재배 일지 수정
      // ========================================

      diaryRepository.update(diaryId, farmId, validation.data);

      // ========================================
      // 수정된 재배 일지 조회
      // ========================================

      const updatedDiary = diaryRepository.findById(diaryId, farmId);

      console.log("✏️ 재배 일지 수정 완료:", diaryId);

      // ========================================
      // 수정 결과 반환
      // ========================================

      return res.json({
        success: true,
        message: "재배 일지가 수정되었습니다.",
        diary: updatedDiary,
      });
    } catch (error) {
      console.error("재배 일지 수정 오류:", error);

      return res.status(500).json({
        success: false,
        message: "재배 일지를 수정하지 못했습니다.",
      });
    }
  });

  // ========================================
  // 9. 재배 일지 삭제
  // DELETE /api/farms/:farmId/diaries/:diaryId
  // ========================================

  router.delete("/:farmId/diaries/:diaryId", (req, res) => {
    try {
      // ========================================
      // 농장 및 일지 ID 확인
      // ========================================

      const farmId = Number(req.params.farmId);

      const diaryId = Number(req.params.diaryId);

      if (!isValidId(farmId) || !isValidId(diaryId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 또는 재배 일지 ID가 아닙니다.",
        });
      }

      // ========================================
      // 삭제 대상 확인
      // ========================================

      const diary = diaryRepository.findById(diaryId, farmId);

      if (!diary) {
        return res.status(404).json({
          success: false,
          message: "삭제할 재배 일지를 찾을 수 없습니다.",
        });
      }

      // ========================================
      // 재배 일지 삭제
      // ========================================

      // 현재는 기존 삭제 방식 유지
      // 추후 소프트 삭제로 변경 예정

      const deleted = diaryRepository.remove(diaryId, farmId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "삭제할 재배 일지가 없습니다.",
        });
      }

      console.log("🗑 재배 일지 삭제 완료:", diaryId);

      // ========================================
      // 삭제 결과 반환
      // ========================================

      return res.json({
        success: true,
        message: "재배 일지가 삭제되었습니다.",
        deletedId: diaryId,
      });
    } catch (error) {
      console.error("재배 일지 삭제 오류:", error);

      return res.status(500).json({
        success: false,
        message: "재배 일지를 삭제하지 못했습니다.",
      });
    }
  });

  // ========================================
  // 📖 재배 일지 복구 API
  //
  // POST /api/farms/:farmId/diaries/:diaryId/restore
  //
  // 200 : 복구 성공
  // 400 : 잘못된 ID
  // 404 : 복구 대상 없음
  // 409 : 농장이 삭제되었거나 존재하지 않음
  // 500 : 서버 오류
  // ========================================

  router.post("/:farmId/diaries/:diaryId/restore", (req, res) => {
    try {
      // ========================================
      // 1. ID 검증
      // ========================================

      const rawFarmId = req.params.farmId;

      const rawDiaryId = req.params.diaryId;

      if (!/^[1-9]\d*$/.test(rawFarmId) || !/^[1-9]\d*$/.test(rawDiaryId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 또는 재배 일지 ID가 아닙니다.",
        });
      }

      const farmId = Number(rawFarmId);

      const diaryId = Number(rawDiaryId);

      if (!Number.isSafeInteger(farmId) || !Number.isSafeInteger(diaryId)) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 또는 재배 일지 ID가 아닙니다.",
        });
      }

      // ========================================
      // 2. 복구 실행
      // ========================================

      const result = diaryRepository.restore(farmId, diaryId);

      // ========================================
      // 3. 복구 대상 없음
      // ========================================

      if (result.status === "not_found") {
        return res.status(404).json({
          success: false,
          message: "복구할 재배 일지를 찾을 수 없습니다.",
        });
      }

      // ========================================
      // 4. 삭제된 농장 복구 차단
      // ========================================

      if (result.status === "farm_inactive") {
        return res.status(409).json({
          success: false,
          message:
            "농장이 삭제되었거나 존재하지 않아 재배 일지를 복구할 수 없습니다.",
        });
      }

      // ========================================
      // 5. 복구 성공
      // ========================================

      if (result.status === "restored") {
        console.log("📖 재배 일지 복구 API 성공:", diaryId);

        return res.status(200).json({
          success: true,
          message: "재배 일지가 복구되었습니다.",
          farmId,
          diaryId,
        });
      }

      throw new Error("알 수 없는 재배 일지 복구 결과입니다.");
    } catch (error) {
      console.error("재배 일지 복구 오류:", error);

      return res.status(500).json({
        success: false,
        message: "재배 일지 복구 중 오류가 발생했습니다.",
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

module.exports = createDiaryRouter;
