// ========================================
// 📖 재배 일지 기능
// ========================================

import {
  loadFarmDiaries,
  initFarmDiary,
  resetFarmDiaryForm,
} from "./farm-diary.js";

// ========================================
// 🌱 농사 가이드 - SPA 화면 관리
// ========================================

// 네이버 지도 객체
let map = null;

// ========================================
// 현재 SPA에서 관리 중인 농장 ID
// ========================================

let currentFarmId = null;

// 이전 요청과 현재 요청 구분
let requestId = 0;

// ========================================
// 1. SPA 초기화
// ========================================

export function initFarmView(mapController) {
  console.log("🌱 SPA 화면 관리 초기화");

  map = mapController.map;

  // ========================================
  // 📖 재배 일지 작성 기능 초기화
  // ========================================

  initFarmDiary(() => currentFarmId);

  // 메인으로 버튼
  const backBtn = document.getElementById("detailBackBtn");

  backBtn.addEventListener("click", () => {
    showMapView();
  });

  // ========================================
  // 브라우저 뒤로 가기 / 앞으로 가기
  // ========================================

  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(window.location.search);

    const farmId = params.get("farm");

    if (farmId) {
      openFarmView(farmId, false);
    } else {
      showMapView(false);
    }
  });

  // ========================================
  // 처음 접속한 주소 확인
  // ========================================

  const params = new URLSearchParams(window.location.search);

  const farmId = params.get("farm");

  if (farmId) {
    openFarmView(farmId, false);
  }
}

// ========================================
// 2. 농장 관리 화면 열기
// ========================================

export async function openFarmView(farmId, addHistory = true) {
  console.log("🌱 농장 관리 화면 열기:", farmId);

  const id = Number(farmId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    alert("올바른 농장 ID가 아닙니다.");
    return;
  }

  // ========================================
  // 현재 관리 중인 농장 ID 설정
  // ========================================

  currentFarmId = id;

  // ========================================
  // 이전 농장 재배 일지 입력 폼 초기화
  // ========================================

  resetFarmDiaryForm();

  const mapView = document.getElementById("mapView");
  const farmView = document.getElementById("farmView");

  // ========================================
  // 화면 전환
  // ========================================

  mapView.hidden = true;

  farmView.hidden = false;

  // ========================================
  // 브라우저 주소 변경
  // ========================================

  if (addHistory) {
    history.pushState({ farmId: id }, "", `/?farm=${id}`);
  }

  // ========================================
  // 농장 정보 불러오기
  // ========================================

  const currentRequest = ++requestId;

  document.getElementById("detailFarmName").textContent =
    "농장 정보 불러오는 중...";

  // ========================================
  // 이전 농장의 재배 일지 초기화
  // ========================================

  document.getElementById("detailDiaryList").textContent =
    "📖 재배 일지를 불러오는 중...";

  document.getElementById("detailStatus").textContent =
    "농장 정보를 조회하고 있습니다.";

  try {
    const response = await fetch(`/api/farms/${id}`);

    if (!response.ok) {
      throw new Error("농장 정보 조회 실패");
    }

    const farm = await response.json();

    // 다른 농장을 선택한 경우 이전 요청 무시
    if (currentRequest !== requestId) {
      return;
    }

    // ========================================
    // 농장 정보 표시
    // ========================================

    document.getElementById("detailFarmName").textContent = "🌿 " + farm.name;

    document.getElementById("detailFarmCrop").textContent =
      farm.crop || "미입력";

    document.getElementById("detailFarmArea").textContent =
      farm.area == null ? "미입력" : `${farm.area}㎡`;

    document.getElementById("detailFarmAddress").textContent =
      farm.address || "미입력";

    // 농장 정보 로딩 완료
    document.getElementById("detailStatus").textContent = "";

    console.log("🌱 농장 정보 로딩 완료:", farm);

    // ========================================
    // 📖 해당 농장의 재배 일지 조회
    // ========================================

    await loadFarmDiaries(id, () => currentRequest === requestId);

    console.log("📖 재배 일지 조회 처리 완료!");
  } catch (error) {
    if (currentRequest !== requestId) {
      return;
    }

    console.error("농장 관리 화면 오류:", error);

    document.getElementById("detailFarmName").textContent =
      "농장 정보를 불러오지 못했습니다.";

    document.getElementById("detailStatus").textContent = error.message;
  }
}

// ========================================
// 3. 메인 지도 화면으로 돌아가기
// ========================================

export function showMapView(addHistory = true) {
  console.log("🗺️ 메인 지도 화면으로 복귀");

  // 진행 중인 상세 조회 결과 무시
  ++requestId;

  // ========================================
  // 현재 농장 선택 해제
  // ========================================

  currentFarmId = null;

  // 재배 일지 작성 폼 초기화
  resetFarmDiaryForm();

  const mapView = document.getElementById("mapView");
  const farmView = document.getElementById("farmView");

  // ========================================
  // 화면 전환
  // ========================================

  farmView.hidden = true;

  mapView.hidden = false;

  // ========================================
  // 브라우저 주소 변경
  // ========================================

  if (addHistory) {
    history.pushState({}, "", "/");
  }

  // ========================================
  // 기존 네이버 지도 재사용
  // ========================================

  requestAnimationFrame(() => {
    if (map && window.naver?.maps?.Event) {
      naver.maps.Event.trigger(map, "resize");
    }
  });

  console.log("🗺️ 기존 지도 객체 유지 완료!");
}
