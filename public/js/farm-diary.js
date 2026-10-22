// ========================================
// 🌱 농사 가이드 - 재배 일지 관리
// ========================================

// ========================================
// 1. 재배 일지 목록 조회
// ========================================

export async function loadFarmDiaries(farmId, isCurrent = () => true) {
  console.log("📖 재배 일지 조회 시작:", farmId);

  // ========================================
  // 농장 ID 검증
  // ========================================

  const id = Number(farmId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    console.error("올바르지 않은 농장 ID:", farmId);
    return;
  }

  // ========================================
  // 재배 일지 목록 영역
  // ========================================

  const diaryList = document.getElementById("detailDiaryList");

  if (!diaryList) {
    console.error("재배 일지 목록 영역이 없습니다.");
    return;
  }

  // 로딩 메시지
  diaryList.textContent = "📖 재배 일지를 불러오는 중...";

  try {
    // ========================================
    // SQLite 재배 일지 API 요청
    // ========================================

    const response = await fetch(`/api/farms/${id}/diaries`);

    if (!response.ok) {
      throw new Error("재배 일지 조회 실패");
    }

    const diaries = await response.json();

    // ========================================
    // 다른 농장으로 이동한 경우
    // 이전 요청 결과 무시
    // ========================================

    if (!isCurrent()) {
      return;
    }

    // ========================================
    // 응답 데이터 확인
    // ========================================

    if (!Array.isArray(diaries)) {
      throw new Error("올바른 재배 일지 데이터가 아닙니다.");
    }

    console.log("📖 조회된 재배 일지:", diaries);

    // ========================================
    // 기존 목록 초기화
    // ========================================

    diaryList.replaceChildren();

    // ========================================
    // 재배 일지가 없는 경우
    // ========================================

    if (diaries.length === 0) {
      diaryList.textContent = "아직 등록된 재배 일지가 없습니다.";

      return;
    }

    // ========================================
    // 재배 일지 목록 생성
    // ========================================

    diaries.forEach((diary) => {
      // 재배 일지 카드
      const item = document.createElement("div");

      item.className = "diary-item";

      // ========================================
      // 작업 날짜 및 종류
      // ========================================

      const title = document.createElement("h3");

      title.textContent =
        `📅 ${diary.work_date || "날짜 없음"} · ` +
        `${diary.work_type || "작업 종류 미입력"}`;

      // ========================================
      // 작업 내용
      // ========================================

      const memo = document.createElement("p");

      memo.textContent = diary.memo || "작업 내용 없음";

      // ========================================
      // 카드 구성
      // ========================================

      item.appendChild(title);
      item.appendChild(memo);

      diaryList.appendChild(item);
    });

    console.log("📖 재배 일지 표시 완료:", diaries.length);
  } catch (error) {
    // 다른 농장으로 이동했다면 오류도 무시
    if (!isCurrent()) {
      return;
    }

    console.error("재배 일지 조회 오류:", error);

    diaryList.textContent = "재배 일지를 불러오지 못했습니다.";
  }
}
