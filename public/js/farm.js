// ========================================
// 🌱 농사 가이드 - 농장 상세 관리
// ========================================

// ========================================
// 1. URL에서 농장 ID 가져오기
// ========================================

const params = new URLSearchParams(window.location.search);

const farmIdText = params.get("id");

const farmId = Number(farmIdText);

// ========================================
// 2. 농장 상세 화면 초기화
// ========================================

async function initFarmPage() {
  console.log("🌱 농장 상세 페이지 초기화");

  // 농장 ID 확인
  if (
    !farmIdText ||
    !/^\d+$/.test(farmIdText) ||
    !Number.isSafeInteger(farmId) ||
    farmId <= 0
  ) {
    document.getElementById("farmName").textContent =
      "올바른 농장 ID가 아닙니다.";

    document.getElementById("diaryList").textContent =
      "농장 정보를 확인할 수 없습니다.";

    return;
  }

  console.log("현재 농장 ID:", farmId);

  // 농장 정보 조회
  const farmLoaded = await loadFarmDetail();

  if (!farmLoaded) {
    document.getElementById("diaryList").textContent =
      "농장 정보를 확인할 수 없습니다.";

    return;
  }

  // 재배 일지 조회
  await loadFarmDiaries();

  console.log("🌱 농장 상세 페이지 초기화 완료!");
}

// ========================================
// 3. 농장 상세 정보 조회
// ========================================

async function loadFarmDetail() {
  try {
    const response = await fetch(`/api/farms/${farmId}`);

    if (!response.ok) {
      throw new Error("농장 정보 조회 실패");
    }

    const farm = await response.json();

    console.log("🌱 농장 정보:", farm);

    // ========================================
    // 농장 이름
    // ========================================

    document.getElementById("farmName").textContent = "🌿 " + farm.name;

    // ========================================
    // 재배 작물
    // ========================================

    document.getElementById("farmCrop").textContent = farm.crop || "미입력";

    // ========================================
    // 농장 면적
    // ========================================

    document.getElementById("farmArea").textContent =
      farm.area === null || farm.area === undefined
        ? "미입력"
        : `${farm.area}㎡`;

    // ========================================
    // 농지 주소
    // ========================================

    document.getElementById("farmAddress").textContent =
      farm.address || "미입력";

    // ========================================
    // PNU
    // ========================================

    document.getElementById("farmPnu").textContent = farm.pnu || "미입력";

    // ========================================
    // 농지 UID
    // ========================================

    document.getElementById("farmUid").textContent = farm.farm_uid || "미입력";

    // 브라우저 제목 변경
    document.title = `${farm.name} - 농사 가이드`;

    return true;
  } catch (error) {
    console.error("농장 상세 조회 오류:", error);

    document.getElementById("farmName").textContent =
      "농장 정보를 불러오지 못했습니다.";

    return false;
  }
}

// ========================================
// 4. 재배 일지 목록 조회
// ========================================

async function loadFarmDiaries() {
  const diaryList = document.getElementById("diaryList");

  try {
    const response = await fetch(`/api/farms/${farmId}/diaries`);

    if (!response.ok) {
      throw new Error("재배 일지 조회 실패");
    }

    const diaries = await response.json();

    if (!Array.isArray(diaries)) {
      throw new Error("올바른 재배 일지 데이터가 아닙니다.");
    }

    console.log("📖 재배 일지:", diaries);

    // 기존 내용 초기화
    diaryList.replaceChildren();

    // ========================================
    // 재배 일지가 없는 경우
    // ========================================

    if (diaries.length === 0) {
      diaryList.textContent = "아직 등록된 재배 일지가 없습니다.";

      return;
    }

    // ========================================
    // 재배 일지 목록 표시
    // ========================================

    diaries.forEach((diary) => {
      const item = document.createElement("div");

      item.className = "diary-item";

      // 작업 제목
      const title = document.createElement("h3");

      title.textContent = `📅 ${diary.work_date} · ${diary.work_type}`;

      // 작업 내용
      const memo = document.createElement("p");

      memo.textContent = diary.memo || "작업 내용 없음";

      item.appendChild(title);
      item.appendChild(memo);

      diaryList.appendChild(item);
    });
  } catch (error) {
    console.error("재배 일지 오류:", error);

    diaryList.textContent = "재배 일지를 불러오지 못했습니다.";
  }
}

// ========================================
// 5. 농장 상세 페이지 실행
// ========================================

initFarmPage();
