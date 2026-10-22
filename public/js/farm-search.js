// ========================================
// 🌱 농사 가이드 - 농지 검색 기능
// ========================================

export function initFarmSearch(getFarmmapController) {
  console.log("🔎 농지 검색 기능 초기화");

  const searchForm = document.getElementById("farmSearchForm");
  const searchInput = document.getElementById("farmSearchInput");

  if (!searchForm || !searchInput) {
    console.error("농지 검색창을 찾을 수 없습니다.");
    return;
  }

  // if (!farmmapController) {
  //   console.error("팜맵 컨트롤러가 없습니다.");
  //   return;
  // }   >>검색창 이벤트를 등록하는 시점에는 팜맵 컨트롤러가 아직 없을 수 있기 때문에 삭제

  // ========================================
  // 검색 결과 영역 생성
  // ========================================

  let resultBox = document.getElementById("farmSearchResults");

  if (!resultBox) {
    resultBox = document.createElement("div");
    resultBox.id = "farmSearchResults";
    resultBox.className = "farm-search-results";

    searchForm.insertAdjacentElement("afterend", resultBox);
  }

  // ========================================
  // 검색 버튼 클릭
  // ========================================

  searchForm.addEventListener("submit", (event) => {
    // 페이지 새로고침 방지
    event.preventDefault();

    const keyword = searchInput.value.trim();

    resultBox.replaceChildren();

    if (!keyword) {
      resultBox.textContent = "검색할 농지 주소를 입력해주세요.";
      return;
    }

    console.log("🔎 농지 검색:", keyword);

    // ========================================
    // 팜맵 데이터 검색
    // ========================================

    // ========================================
    // 팜맵 컨트롤러 확인
    // ========================================

    const farmmapController = getFarmmapController();

    if (
      !farmmapController ||
      typeof farmmapController.searchFarms !== "function" ||
      typeof farmmapController.focusFarm !== "function"
    ) {
      console.error("팜맵 검색 기능을 사용할 수 없습니다.");

      resultBox.textContent =
        "농지 데이터를 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";

      return;
    }

    // ========================================
    // 팜맵 데이터 검색
    // ========================================

    const results = farmmapController.searchFarms(keyword);
    if (results.length === 0) {
      resultBox.textContent =
        "검색 결과가 없습니다. 주소 또는 지번을 확인해주세요.";

      return;
    }

    // ========================================
    // 검색 결과 개수 표시
    // ========================================

    const resultCount = document.createElement("p");

    resultCount.className = "farm-search-count";

    resultCount.textContent = `🌱 검색된 농지: ${results.length}개`;

    resultBox.appendChild(resultCount);

    // 한 번에 최대 30개 표시
    const visibleResults = results.slice(0, 30);

    // ========================================
    // 검색 결과 목록 생성
    // ========================================

    visibleResults.forEach((farm) => {
      const item = document.createElement("button");

      item.type = "button";
      item.className = "farm-search-item";

      const address = document.createElement("strong");

      address.textContent = farm.address;

      const detail = document.createElement("span");

      const area = Number(farm.area);

      const areaText = Number.isFinite(area)
        ? `${area.toLocaleString("ko-KR")}㎡`
        : "면적 정보 없음";

      detail.textContent = `${farm.type || "농지"} · ${areaText}`;

      const pnu = document.createElement("small");

      pnu.textContent = `PNU: ${farm.pnu || "-"}`;

      const uid = document.createElement("small");

      uid.textContent = `UID: ${farm.uid || "-"}`;

      item.appendChild(address);
      item.appendChild(detail);
      item.appendChild(pnu);
      item.appendChild(uid);

      // ========================================
      // 검색 결과 클릭
      // ========================================

      // ========================================
      // 🌱 검색 결과 클릭
      // ========================================

      item.addEventListener("click", () => {
        console.log("📍 검색 농지 선택:", farm);

        // ========================================
        // 1. 선택한 농지로 지도 이동
        // ========================================

        const success = farmmapController.focusFarm(farm.featureIndex);

        if (!success) {
          alert("농지 위치를 찾을 수 없습니다.");
          return;
        }

        // ========================================
        // 2. 선택한 검색 결과 강조
        // ========================================

        resultBox.querySelectorAll(".farm-search-item").forEach((button) => {
          button.classList.remove("selected");
        });

        item.classList.add("selected");

        // ========================================
        // 3. 농지 주소 검색창 자동 접기
        // ========================================

        const searchAccordion = searchForm.closest(".farm-search-accordion");

        if (searchAccordion) {
          searchAccordion.open = false;

          console.log("🔎 농지 검색창 자동 접기 완료");
        }

        // ========================================
        // 4. 지도 영역으로 화면 스크롤
        // ========================================

        const mapElement = document.getElementById("map");

        if (mapElement) {
          requestAnimationFrame(() => {
            mapElement.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
        }

        console.log("🌱 검색 농지 선택 및 지도 이동 완료!");
      });

      resultBox.appendChild(item);
    });

    if (results.length > 30) {
      const notice = document.createElement("p");

      notice.className = "farm-search-notice";

      notice.textContent =
        "검색 결과가 많아 처음 30개만 표시했습니다. 주소를 더 자세히 입력해주세요.";

      resultBox.appendChild(notice);
    }
  });

  console.log("🔎 농지 검색 기능 준비 완료!");
}
