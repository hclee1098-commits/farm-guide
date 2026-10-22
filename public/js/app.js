import { getFarmAddress } from "./farm-info.js";

// ========================================
// 🌱 농사 가이드 - 메인 애플리케이션
// ========================================

// 지도 기능
import { createMap } from "./map.js";

// 팜맵 농지 경계 기능
import { loadFarmFields } from "./farmmap.js";

// 농지 검색 기능
import { initFarmSearch } from "./farm-search.js";

// ========================================
// 팜맵 컨트롤러 관리
// ========================================

let farmmapController = null;

// ========================================
// 현재 선택한 농지 정보
// ========================================

// 선택한 농지 UID
let selectedFarmUid = null;

// 선택한 농지 PNU
let selectedFarmPnu = null;

// ========================================
// 🌱 농사 가이드 앱 초기화
// ========================================

async function initApp() {
  console.log("🌱 농사 가이드 앱 초기화 시작!");

  // ========================================
  // 🔎 농지 검색 이벤트 먼저 등록
  // ========================================

  initFarmSearch(() => farmmapController);

  // 네이버 지도 API 확인
  if (!window.naver || !window.naver.maps) {
    console.error("네이버 지도 API 로딩 실패");

    document.getElementById("selectedLocation").textContent =
      "네이버 지도 API를 불러오지 못했습니다.";

    return;
  }

  // ========================================
  // 1. 농지 관리 탭 초기화
  // ========================================

  initFarmTabs();

  // ========================================
  // 2. 네이버 지도 생성
  // ========================================

  const mapController = createMap();

  // ========================================
  // 3. 저장된 농장 목록 불러오기
  // ========================================

  const registeredFarms = await loadFarms(mapController);

  // ========================================
  // 4. 팜맵 농지 경계 표시
  // ========================================

  farmmapController = await loadFarmFields(
    mapController.map,

    // 농지 선택 이벤트
    (properties, position) => {
      console.log("🌱 농지 선택:", properties);

      // ========================================
      // 선택한 농지 UID 저장
      // ========================================

      selectedFarmUid =
        properties.UID === null || properties.UID === undefined
          ? null
          : String(properties.UID).trim() || null;

      // 선택한 농지 PNU 저장
      selectedFarmPnu = String(properties.PNU ?? "").trim();

      console.log("선택한 농지 UID:", selectedFarmUid);
      console.log("선택한 농지 PNU:", selectedFarmPnu);

      // 상세 주소
      const address = getFarmAddress(properties);

      document.getElementById("farmAddressInput").value = address;

      // PNU
      const pnu = String(properties.PNU ?? "");

      document.getElementById("farmPnuInput").value = pnu;

      // 농지 면적
      const area =
        properties.AREA == null || properties.AREA === ""
          ? NaN
          : Number(properties.AREA);

      document.getElementById("farmArea").value =
        Number.isFinite(area) && area >= 0 ? area : "";

      // 선택 위치 마커 이동
      if (position) {
        mapController.setSelectedLocation(position);
      }
    },

    // 등록된 농장 목록 전달
    registeredFarms ?? [],
  );

  // // ========================================
  // // 🔎 농지 검색 기능 초기화
  // // ========================================

  // if (farmmapController) {
  //   initFarmSearch(farmmapController);
  // }

  // ========================================
  // 5. 농장 등록 기능 연결
  // ========================================

  initFarmForm(mapController, farmmapController);

  console.log("🌱 농사 가이드 앱 초기화 완료!");
}

// ========================================
// 2. 농장 등록 폼
// ========================================

function initFarmForm(mapController, farmmapController) {
  const form = document.getElementById("farmForm");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 선택한 위치 가져오기
    const location = mapController.getSelectedLocation();

    if (!location) {
      alert("지도에서 농장 위치를 먼저 선택해주세요.");
      return;
    }

    // 농장 정보
    const name = document.getElementById("farmName").value;

    const crop = document.getElementById("farmCrop").value;

    const areaValue = document.getElementById("farmArea").value;

    const area = areaValue === "" ? null : Number(areaValue);

    // 농지 주소
    const address = document.getElementById("farmAddressInput").value;

    // PNU
    const pnu = document.getElementById("farmPnuInput").value;

    // ========================================
    // 선택한 농지 UID
    // ========================================

    const farmUid = selectedFarmPnu === pnu.trim() ? selectedFarmUid : null;

    // PNU가 있는데 UID가 없는 경우
    if (pnu.trim() && !farmUid) {
      alert(
        "농지 UID를 확인할 수 없습니다. 지도에서 농지를 다시 선택해주세요.",
      );
      return;
    }

    console.log("등록할 농지 UID:", farmUid);

    try {
      const response = await fetch("/api/farms", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          name,
          crop,
          area,
          latitude: location.latitude,
          longitude: location.longitude,
          address,
          pnu,

          // 팜맵 농지 고유번호
          farm_uid: farmUid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        throw new Error(errorData.message || "농장 정보 저장에 실패했습니다.");
      }

      // ========================================
      // 농장 저장 성공
      // ========================================

      alert("🌱 농장 정보가 저장되었습니다!");

      // 입력창 초기화
      form.reset();

      // ========================================
      // 선택한 농지 정보 초기화
      // ========================================

      selectedFarmUid = null;
      selectedFarmPnu = null;

      // 선택 위치 마커 제거
      mapController.resetSelectedLocation();

      // 등록된 농장 목록 새로고침
      const farms = await loadFarms(mapController);

      // ========================================
      // 등록된 농지 색상 갱신
      // ========================================

      if (farms && farmmapController) {
        // 최신 등록 농지 목록 반영
        farmmapController.setRegisteredFarms(farms);

        // 현재 선택 해제
        // 등록한 농지는 파란색으로 변경됨
        farmmapController.clearSelection();
      }
    } catch (error) {
      console.error("농장 저장 오류:", error);

      alert(error.message);
    }
  });
}

// ========================================
// 3. 저장된 농장 목록 불러오기
// ========================================

async function loadFarms(mapController) {
  const farmList = document.getElementById("farmList");

  try {
    const response = await fetch("/api/farms");

    if (!response.ok) {
      throw new Error("농장 목록 조회 실패");
    }

    const farms = await response.json();

    // 지도에 저장된 농장 마커 표시
    // mapController.renderFarmMarkers(farms);

    // 기존 목록 초기화
    farmList.replaceChildren();

    if (farms.length === 0) {
      farmList.textContent = "등록된 농장이 없습니다.";
      return farms;
    }

    // 농장 목록 생성
    farms.forEach((farm) => {
      const item = document.createElement("div");
      item.className = "farm-item";

      // 농장 이름
      const title = document.createElement("h3");
      title.textContent = "🌿 " + farm.name;

      // 재배 작물
      const crop = document.createElement("p");
      crop.textContent = "재배 작물: " + (farm.crop || "미입력");

      // 농장 면적
      const area = document.createElement("p");
      area.textContent = "농장 면적: " + (farm.area ?? "미입력") + "㎡";

      // ========================================
      // 농지 주소 표시
      // ========================================

      const address = document.createElement("p");

      address.textContent = "📍 농지 주소: " + (farm.address || "미입력");

      // ========================================
      // PNU 표시
      // ========================================

      const pnu = document.createElement("p");

      pnu.textContent = "🏷️ PNU: " + (farm.pnu || "미입력");

      item.appendChild(title);
      item.appendChild(crop);
      item.appendChild(area);
      item.appendChild(address);
      item.appendChild(pnu);

      // ========================================
      // 농장 삭제 버튼
      // ========================================

      const deleteBtn = document.createElement("button");

      deleteBtn.type = "button";
      deleteBtn.textContent = "🗑 삭제";
      deleteBtn.className = "farm-delete-btn";

      // ========================================
      // 농장 삭제 버튼 클릭
      // ========================================

      deleteBtn.addEventListener("click", async () => {
        // 삭제 확인
        const confirmed = confirm(`${farm.name} 농장을 삭제하시겠습니까?`);

        if (!confirmed) {
          return;
        }

        try {
          // ========================================
          // 1. SQLite에서 농장 삭제
          // ========================================

          const response = await fetch(`/api/farms/${farm.id}`, {
            method: "DELETE",
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.message || "농장 삭제 실패");
          }

          console.log("농장 삭제 완료:", farm.name);

          // ========================================
          // 2. 최신 농장 목록 다시 조회
          // ========================================

          const updatedFarms = await loadFarms(mapController);

          if (!Array.isArray(updatedFarms)) {
            throw new Error(
              "농장은 삭제됐지만 목록을 새로고침하지 못했습니다.",
            );
          }

          // ========================================
          // 3. 지도에 등록된 농지 정보 갱신
          // ========================================

          if (farmmapController) {
            // 최신 등록 농지 목록 반영
            farmmapController.setRegisteredFarms(updatedFarms);

            // 현재 선택된 농지 강조 해제
            farmmapController.clearSelection();

            console.log("지도 농지 색상 갱신 완료!");
          }

          alert("농장이 삭제되었습니다.");
        } catch (error) {
          console.error("농장 삭제 오류:", error);

          alert(error.message);
        }
      });
      // 농장 카드에 삭제 버튼 추가
      item.appendChild(deleteBtn);

      farmList.appendChild(item);
    });

    // 조회한 농장 목록 반환
    return farms;

    console.log("저장된 농장 목록 로딩 완료!");
  } catch (error) {
    console.error("농장 목록 오류:", error);

    farmList.textContent = "농장 정보를 불러오지 못했습니다.";
    return null;
  }
}

// ========================================
// 🌱 농지 정보 / 농지 등록 탭 관리
// ========================================

function initFarmTabs() {
  // 탭 버튼
  const infoTab = document.getElementById("farmInfoTab");
  const registerTab = document.getElementById("farmRegisterTab");

  // 탭 내용
  const infoPanel = document.getElementById("farmInfoPanel");
  const registerPanel = document.getElementById("farmRegisterPanel");

  // 농지 등록 버튼
  const registerBtn = document.getElementById("farmRegisterBtn");

  // ========================================
  // 탭 전환 함수
  // ========================================

  function switchTab(tabName) {
    const isInfo = tabName === "info";

    // 버튼 스타일 변경
    infoTab.classList.toggle("active", isInfo);
    registerTab.classList.toggle("active", !isInfo);

    // 접근성 상태 변경
    infoTab.setAttribute("aria-selected", String(isInfo));
    registerTab.setAttribute("aria-selected", String(!isInfo));

    // 탭 내용 표시
    infoPanel.hidden = !isInfo;
    registerPanel.hidden = isInfo;
  }

  // ========================================
  // 농지 정보 탭 클릭
  // ========================================

  infoTab.addEventListener("click", () => {
    switchTab("info");
  });

  // ========================================
  // 농지 등록 탭 클릭
  // ========================================

  registerTab.addEventListener("click", () => {
    switchTab("register");
  });

  // ========================================
  // 이 농지 등록하기 버튼 클릭
  // ========================================

  registerBtn.addEventListener("click", () => {
    switchTab("register");
  });

  console.log("🌱 농지 관리 탭 초기화 완료!");

  return {
    switchTab,
  };
}

// ========================================
// 🔎 농지 검색 폼 기본 제출 방지
// ========================================

// const farmSearchForm = document.getElementById("farmSearchForm");

// if (farmSearchForm) {
//   farmSearchForm.addEventListener("submit", (event) => {
//     // 페이지 새로고침 방지
//     event.preventDefault();

//     console.log("🔎 농지 검색 버튼 클릭");

//     // 실제 검색 기능은 다음 단계에서 연결
//   });
// }

// ========================================
// 4. 앱 실행
// ========================================

initApp();
