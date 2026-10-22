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

// 농지 정보 팝업
import { createFarmPopup } from "./farm-popup.js";

// SPA 농장 관리 화면
import { initFarmView, openFarmView } from "./farm-view.js";

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
// 🌱 지도와 농장 목록 선택 상태 연동
// ========================================

function updateFarmListSelection() {
  // ========================================
  // 1. 등록된 농장 카드 가져오기
  // ========================================

  const farmItems = document.querySelectorAll(".farm-item[data-farm-uid]");

  // ========================================
  // 2. 현재 선택된 UID 확인
  // ========================================

  const currentUid = String(selectedFarmUid ?? "").trim();

  // ========================================
  // 3. 농장 카드 선택 상태 변경
  // ========================================

  farmItems.forEach((item) => {
    const farmUid = String(item.dataset.farmUid ?? "").trim();

    // UID가 동일한 농장인지 확인
    const isSelected =
      currentUid !== "" && farmUid !== "" && currentUid === farmUid;

    // 선택한 농장 강조
    item.classList.toggle("is-selected", isSelected);
  });

  console.log("🌱 농장 목록 선택 상태 갱신:", currentUid);
}

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
  // 🌱 SPA 화면 관리 초기화
  // ========================================

  initFarmView(mapController);

  // ========================================
  // 🌱 농지 정보 팝업 생성
  // ========================================

  const farmPopup = createFarmPopup(mapController.map);

  // ========================================
  // 🌱 지도 빈 영역 클릭 시 팝업 닫기
  // ========================================

  naver.maps.Event.addListener(mapController.map, "click", () => {
    // 농지 정보 팝업 닫기
    farmPopup.close();

    console.log("🌱 지도 클릭 - 농지 팝업 닫기");
  });

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

      // ========================================
      // 🌱 등록된 농장 목록 선택 상태 갱신
      // ========================================

      updateFarmListSelection();

      // 선택한 농지 PNU 저장
      selectedFarmPnu = String(properties.PNU ?? "").trim();

      console.log("선택한 농지 UID:", selectedFarmUid);
      console.log("선택한 농지 PNU:", selectedFarmPnu);

      // 상세 주소
      const address = getFarmAddress(properties);

      document.getElementById("farmAddressInput").value = address;

      // ========================================
      // 🌱 선택한 농지 정보 팝업 표시
      // ========================================

      farmPopup.show(properties, position, address);

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

    // ========================================
    // 등록된 농장 목록 전달
    // ========================================

    registeredFarms ?? [],

    // ========================================
    // 지도 빈 영역 클릭 콜백
    // ========================================

    () => {
      console.log("🌱 농지 선택 해제");

      // 농지 정보 팝업 닫기
      farmPopup.close();

      // 선택한 농지 UID 초기화
      selectedFarmUid = null;

      // 선택한 농지 PNU 초기화
      selectedFarmPnu = null;

      // ========================================
      // 🌱 농장 목록 선택 상태 해제
      // ========================================

      updateFarmListSelection();

      // 농지 주소 입력 초기화
      document.getElementById("farmAddressInput").value = "";

      // PNU 입력 초기화
      document.getElementById("farmPnuInput").value = "";

      // 선택한 농지 면적 초기화
      document.getElementById("farmArea").value = "";

      // 농지 상세 정보 숨기기
      document.getElementById("farmInfoContent").style.display = "none";

      // 농지 선택 안내 표시
      document.getElementById("farmEmptyMessage").style.display = "block";
    },
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

  initFarmForm(mapController, farmmapController, farmPopup);

  console.log("🌱 농사 가이드 앱 초기화 완료!");
}

// ========================================
// 2. 농장 등록 폼
// ========================================

function initFarmForm(mapController, farmmapController, farmPopup) {
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

      // 농지 정보 팝업 닫기
      farmPopup.close();

      // ========================================
      // 선택한 농지 정보 초기화
      // ========================================

      selectedFarmUid = null;
      selectedFarmPnu = null;

      updateFarmListSelection();

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
      // ========================================
      // 농장 카드 생성
      // ========================================

      const item = document.createElement("div");

      item.className = "farm-item";

      // ========================================
      // 🌱 농장 UID 연결
      // ========================================

      item.dataset.farmUid = String(farm.farm_uid ?? "").trim();

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
      // 📍 등록된 농장 지도에서 보기
      // ========================================

      // 지도 이동 버튼 생성
      const focusBtn = document.createElement("button");

      focusBtn.type = "button";
      focusBtn.textContent = "📍 지도에서 보기";
      focusBtn.className = "farm-focus-btn";

      // ========================================
      // 등록된 농지 UID 확인
      // ========================================

      const farmUid = String(farm.farm_uid ?? "").trim();

      // UID가 없는 농장은 지도 이동 비활성화
      if (!farmUid) {
        focusBtn.disabled = true;
        focusBtn.textContent = "📍 농지 UID 없음";
        focusBtn.title = "농지 UID가 저장되지 않아 지도에서 찾을 수 없습니다.";
      }

      // ========================================
      // 지도 이동 버튼 클릭
      // ========================================

      focusBtn.addEventListener("click", () => {
        console.log("📍 등록된 농장 지도 이동:", farm.name);

        console.log("농지 UID:", farmUid);

        // ========================================
        // 1. 팜맵 컨트롤러 확인
        // ========================================

        if (
          !farmmapController ||
          typeof farmmapController.focusFarmByUid !== "function"
        ) {
          alert("농지 지도 기능을 사용할 수 없습니다.");
          return;
        }

        // ========================================
        // 2. UID로 농지 검색 및 지도 이동
        // ========================================

        const success = farmmapController.focusFarmByUid(farmUid);

        if (!success) {
          alert("지도에서 해당 농지를 찾을 수 없습니다.");
          return;
        }

        // ========================================
        // 3. 지도 영역으로 화면 이동
        // ========================================

        const mapElement = document.getElementById("map");

        if (mapElement) {
          mapElement.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }

        console.log("🌱 등록된 농장 지도 이동 완료!");
      });

      // ========================================
      // 농장 카드에 버튼 추가
      // ========================================

      item.appendChild(focusBtn);

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
        const confirmed = confirm(
          `${farm.name} 농장을 삭제하시겠습니까?\n\n` +
            "⚠️ 해당 농장의 재배 일지도 모두 삭제됩니다.\n" +
            "삭제한 데이터는 복구할 수 없습니다.",
        );

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
      // ========================================
      // 🌱 농장 관리 버튼 영역
      // 수정 / 삭제 버튼 가로 배치
      // ========================================
      // ========================================
      // 🌱 농장 관리 버튼 영역
      // ========================================

      const actionButtons = document.createElement("div");

      actionButtons.className = "farm-action-buttons";

      // ========================================
      // 1. 농장 상세 관리 버튼 생성
      // ========================================

      const manageBtn = document.createElement("button");

      manageBtn.type = "button";

      manageBtn.textContent = "⚙️ 농장 관리";

      manageBtn.className = "farm-manage-btn";

      // ========================================
      // 2. 농장 관리 버튼 클릭
      // ========================================

      // ========================================
      // ⚙️ 농장 관리 화면 열기
      // ========================================

      manageBtn.addEventListener("click", () => {
        console.log("🌱 농장 관리 선택:", farm.id);

        // 페이지 이동 없이 농장 관리 화면 표시
        openFarmView(farm.id);
      });

      // ========================================
      // 3. 기존 수정 기능
      // ========================================

      const editControls = createFarmEditControls(farm, mapController);

      // ========================================
      // 4. 버튼 배치
      // ========================================

      // 농장 관리 버튼
      actionButtons.appendChild(manageBtn);

      // 수정 버튼
      actionButtons.appendChild(editControls.container);

      // 삭제 버튼
      actionButtons.appendChild(deleteBtn);

      // ========================================
      // 5. 농장 카드에 추가
      // ========================================

      item.appendChild(actionButtons);

      // 수정 폼은 버튼 아래에 표시
      item.appendChild(editControls.editForm);

      // 농장 카드 표시
      farmList.appendChild(item);
    });

    // ========================================
    // 🌱 농장 목록 선택 상태 갱신
    // ========================================

    updateFarmListSelection();

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
// 🌱 농장 정보 수정 UI
// ========================================

function createFarmEditControls(farm, mapController) {
  // ========================================
  // 1. 수정 영역 생성
  // ========================================

  const container = document.createElement("div");

  container.className = "farm-edit-controls";

  // ========================================
  // 2. 수정 버튼
  // ========================================

  const editBtn = document.createElement("button");

  editBtn.type = "button";
  editBtn.textContent = "✏️ 수정";
  editBtn.className = "farm-edit-btn";

  // ========================================
  // 3. 수정 폼
  // ========================================

  const editForm = document.createElement("form");

  editForm.className = "farm-edit-form";

  // 처음에는 숨김
  editForm.hidden = true;

  // ========================================
  // 4. 농장 이름 입력
  // ========================================

  const nameLabel = document.createElement("label");

  nameLabel.textContent = "농장 이름";

  const nameInput = document.createElement("input");

  nameInput.type = "text";
  nameInput.value = farm.name;
  nameInput.required = true;

  nameLabel.appendChild(nameInput);

  // ========================================
  // 5. 재배 작물 입력
  // ========================================

  const cropLabel = document.createElement("label");

  cropLabel.textContent = "재배 작물";

  const cropInput = document.createElement("input");

  cropInput.type = "text";
  cropInput.value = farm.crop || "";

  cropLabel.appendChild(cropInput);

  // ========================================
  // 6. 농장 면적 입력
  // ========================================

  const areaLabel = document.createElement("label");

  areaLabel.textContent = "농장 면적 (㎡)";

  const areaInput = document.createElement("input");

  areaInput.type = "number";
  areaInput.min = "0";

  // 소수점 제한 없음
  areaInput.step = "any";

  areaInput.value =
    farm.area === null || farm.area === undefined ? "" : String(farm.area);

  areaLabel.appendChild(areaInput);

  // ========================================
  // 7. 저장 버튼
  // ========================================

  const saveBtn = document.createElement("button");

  saveBtn.type = "submit";
  saveBtn.textContent = "💾 저장";
  saveBtn.className = "farm-edit-save-btn";

  // ========================================
  // 8. 취소 버튼
  // ========================================

  const cancelBtn = document.createElement("button");

  cancelBtn.type = "button";
  cancelBtn.textContent = "취소";
  cancelBtn.className = "farm-edit-cancel-btn";

  // ========================================
  // 9. 수정 버튼 클릭
  // ========================================

  editBtn.addEventListener("click", () => {
    editForm.hidden = !editForm.hidden;

    if (!editForm.hidden) {
      nameInput.focus();
    } else {
      editForm.reset();
    }
  });

  // ========================================
  // 10. 취소 버튼 클릭
  // ========================================

  cancelBtn.addEventListener("click", () => {
    editForm.reset();

    editForm.hidden = true;
  });

  // ========================================
  // 11. 수정 내용 저장
  // ========================================

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();

    const crop = cropInput.value.trim();

    const areaValue = areaInput.value;

    const area = areaValue === "" ? null : Number(areaValue);

    // 중복 저장 방지
    saveBtn.disabled = true;

    try {
      // ========================================
      // SQLite 수정 요청
      // ========================================

      const response = await fetch(`/api/farms/${farm.id}`, {
        method: "PUT",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          name,
          crop,
          area,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "농장 정보 수정 실패");
      }

      console.log("🌱 농장 수정 완료:", farm.id);

      // ========================================
      // 등록된 농장 목록 갱신
      // ========================================

      const updatedFarms = await loadFarms(mapController);

      if (!Array.isArray(updatedFarms)) {
        alert("농장 정보는 수정되었지만 목록을 새로고침하지 못했습니다.");
        return;
      }

      alert("🌱 농장 정보가 수정되었습니다!");
    } catch (error) {
      console.error("농장 수정 오류:", error);

      alert(error.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  // ========================================
  // 12. 수정 폼 구성
  // ========================================

  editForm.appendChild(nameLabel);
  editForm.appendChild(cropLabel);
  editForm.appendChild(areaLabel);

  editForm.appendChild(saveBtn);
  editForm.appendChild(cancelBtn);

  // ========================================
  // 13. 수정 영역 구성
  // ========================================

  container.appendChild(editBtn);

  return {
    container,
    editForm,
  };
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
