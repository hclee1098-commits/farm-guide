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

// ========================================
// 📖 재배 일지 작성 기능
// ========================================

let diaryFormInitialized = false;

// ========================================
// 1. 재배 일지 작성 폼 초기화
// ========================================

export function initFarmDiary(getFarmId) {
  // 이벤트 중복 등록 방지
  if (diaryFormInitialized) {
    return;
  }

  // ========================================
  // HTML 요소
  // ========================================

  const writeBtn = document.getElementById("diaryWriteBtn");

  const form = document.getElementById("diaryForm");

  const cancelBtn = document.getElementById("diaryCancelBtn");

  const saveBtn = document.getElementById("diarySaveBtn");

  const dateInput = document.getElementById("diaryWorkDate");

  const typeInput = document.getElementById("diaryWorkType");

  const memoInput = document.getElementById("diaryMemo");

  if (
    !writeBtn ||
    !form ||
    !cancelBtn ||
    !saveBtn ||
    !dateInput ||
    !typeInput ||
    !memoInput
  ) {
    console.error("재배 일지 작성 폼을 찾을 수 없습니다.");
    return;
  }

  // ========================================
  // 2. 작성 폼 닫기
  // ========================================

  function closeForm() {
    form.reset();

    form.hidden = true;

    writeBtn.setAttribute("aria-expanded", "false");
  }

  // ========================================
  // 3. 작성 버튼 클릭
  // ========================================

  writeBtn.addEventListener("click", () => {
    // 이미 열려 있다면 닫기
    if (!form.hidden) {
      closeForm();
      return;
    }

    // 입력 폼 표시
    form.hidden = false;

    writeBtn.setAttribute("aria-expanded", "true");

    // ========================================
    // 오늘 날짜 자동 입력
    // ========================================

    const today = new Date();

    const year = today.getFullYear();

    const month = String(today.getMonth() + 1).padStart(2, "0");

    const day = String(today.getDate()).padStart(2, "0");

    dateInput.value = `${year}-${month}-${day}`;

    dateInput.focus();

    console.log("📖 재배 일지 작성 폼 열기");
  });

  // ========================================
  // 4. 취소 버튼
  // ========================================

  cancelBtn.addEventListener("click", () => {
    closeForm();
  });

  // ========================================
  // 5. 재배 일지 저장
  // ========================================

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // ========================================
    // 현재 농장 ID 가져오기
    // ========================================

    const farmId = Number(getFarmId());

    if (!Number.isSafeInteger(farmId) || farmId <= 0) {
      alert("농장 정보를 확인할 수 없습니다.");
      return;
    }

    // ========================================
    // 입력 데이터
    // ========================================

    const work_date = dateInput.value;

    const work_type = typeInput.value;

    const memo = memoInput.value.trim();

    if (!work_date || !work_type) {
      alert("작업 날짜와 종류를 입력해주세요.");
      return;
    }

    // ========================================
    // 중복 저장 방지
    // ========================================

    saveBtn.disabled = true;

    saveBtn.textContent = "저장 중...";

    try {
      // ========================================
      // SQLite 저장 API 요청
      // ========================================

      const response = await fetch(`/api/farms/${farmId}/diaries`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          work_date,
          work_type,
          memo,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "재배 일지 저장 실패");
      }

      console.log("📖 재배 일지 저장 완료:", result);

      // ========================================
      // 입력 폼 초기화
      // ========================================

      closeForm();

      // ========================================
      // 현재 농장 화면인지 확인
      // ========================================

      const stillCurrent =
        Number(getFarmId()) === farmId &&
        !document.getElementById("farmView").hidden;

      if (stillCurrent) {
        // ========================================
        // 저장 후 재배 일지 목록 갱신
        // ========================================

        await loadFarmDiaries(
          farmId,
          () =>
            Number(getFarmId()) === farmId &&
            !document.getElementById("farmView").hidden,
        );

        alert("🌱 재배 일지가 저장되었습니다!");
      }
    } catch (error) {
      console.error("재배 일지 저장 오류:", error);

      if (Number(getFarmId()) === farmId) {
        alert(error.message);
      }
    } finally {
      saveBtn.disabled = false;

      saveBtn.textContent = "💾 저장하기";
    }
  });

  diaryFormInitialized = true;

  console.log("📖 재배 일지 작성 기능 초기화 완료!");
}

// ========================================
// 6. 재배 일지 입력 폼 초기화
// ========================================

export function resetFarmDiaryForm() {
  const form = document.getElementById("diaryForm");

  const writeBtn = document.getElementById("diaryWriteBtn");

  if (!form || !writeBtn) {
    return;
  }

  form.reset();

  form.hidden = true;

  writeBtn.setAttribute("aria-expanded", "false");
}
