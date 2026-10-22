// ========================================
// 🌱 농사 가이드 - 농지 정보 팝업
// ========================================

// ========================================
// 1. 농지 팝업 생성
// ========================================

export function createFarmPopup(map) {
  // 네이버 지도 정보창 생성
  const infoWindow = new naver.maps.InfoWindow({
    backgroundColor: "#ffffff",
    borderColor: "#dddddd",
    borderWidth: 1,
    disableAutoPan: false,
  });

  // ========================================
  // 2. 팝업 표시
  // ========================================

  function show(properties, position, address) {
    if (!position) {
      console.warn("농지 팝업 위치가 없습니다.");
      return;
    }

    // 농지 정보
    const area =
      properties.AREA == null || properties.AREA === ""
        ? NaN
        : Number(properties.AREA);

    const areaText = Number.isFinite(area)
      ? area.toLocaleString("ko-KR", {
          maximumFractionDigits: 2,
        }) + "㎡"
      : "정보 없음";

    const farmType = properties.CLSF_NM || "정보 없음";

    // ========================================
    // 팝업 HTML 요소 생성
    // ========================================

    const container = document.createElement("div");
    container.className = "farm-popup";

    // 제목
    const title = document.createElement("h3");
    title.textContent = "🌱 선택한 농지";

    // 주소
    const addressElement = document.createElement("p");
    addressElement.textContent = `📍 ${address || "주소 정보 없음"}`;

    // 면적
    const areaElement = document.createElement("p");
    areaElement.textContent = `📐 면적: ${areaText}`;

    // 농지 종류
    const typeElement = document.createElement("p");
    typeElement.textContent = `🌾 농지 종류: ${farmType}`;

    // ========================================
    // 버튼 영역
    // ========================================

    const buttonBox = document.createElement("div");
    buttonBox.className = "farm-popup-buttons";

    // 상세정보 버튼
    const detailBtn = document.createElement("button");

    detailBtn.type = "button";
    detailBtn.textContent = "상세정보";
    detailBtn.className = "farm-popup-detail";

    // 농지 등록 버튼
    const registerBtn = document.createElement("button");

    registerBtn.type = "button";
    registerBtn.textContent = "농지 등록";
    registerBtn.className = "farm-popup-register";

    // ========================================
    // 상세정보 버튼 이벤트
    // ========================================

    detailBtn.addEventListener("click", () => {
      // 농지 정보 탭 선택
      document.getElementById("farmInfoTab")?.click();

      // 농지 정보 영역으로 이동
      document.getElementById("farmInfoSection")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    // ========================================
    // 농지 등록 버튼 이벤트
    // ========================================

    registerBtn.addEventListener("click", () => {
      // 농지 등록 탭 선택
      document.getElementById("farmRegisterTab")?.click();

      // 농지 등록 영역으로 이동
      document.getElementById("farmRegisterPanel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    // 버튼 추가
    buttonBox.appendChild(detailBtn);
    buttonBox.appendChild(registerBtn);

    // 팝업 구성
    container.appendChild(title);
    container.appendChild(addressElement);
    container.appendChild(areaElement);
    container.appendChild(typeElement);
    container.appendChild(buttonBox);

    // ========================================
    // 네이버 지도에 팝업 표시
    // ========================================

    infoWindow.close();

    infoWindow.setContent(container);

    infoWindow.open(map, position);

    console.log("🌱 농지 정보 팝업 표시 완료");
  }

  // ========================================
  // 3. 팝업 닫기
  // ========================================

  function close() {
    infoWindow.close();
  }

  // ========================================
  // 4. 외부에서 사용할 기능
  // ========================================

  return {
    show,
    close,
  };
}
