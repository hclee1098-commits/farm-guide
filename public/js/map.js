// ========================================
// 🌱 농사 가이드 - 네이버 지도 관리
// ========================================

// ========================================
// 1. 네이버 지도 생성
// ========================================

export function createMap() {
  // 선택한 위치
  let selectedLat = null;
  let selectedLng = null;

  // 선택 위치 마커
  let selectedMarker = null;

  // 저장된 농장 마커
  const savedMarkers = [];

  // 네이버 지도 생성
  const map = new naver.maps.Map("map", {
    center: new naver.maps.LatLng(37.5665, 126.978),
    zoom: 10,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: naver.maps.MapTypeControlStyle.BUTTON,
      position: naver.maps.Position.TOP_LEFT,
      mapTypeIds: [
        naver.maps.MapTypeId.NORMAL,
        naver.maps.MapTypeId.SATELLITE,
        naver.maps.MapTypeId.HYBRID,
      ],
    },
    zoomControl: true,
    zoomControlOptions: {
      position: naver.maps.Position.TOP_RIGHT,
    },
  });

  console.log("네이버 지도 생성 완료!");

  // ========================================
  // 2. 지도 클릭 이벤트
  // ========================================

  // naver.maps.Event.addListener(map, "click", (e) => {
  //   const position = e.coord;

  //   // 위도와 경도 저장
  //   selectedLat = position.lat();
  //   selectedLng = position.lng();

  //   // 선택 마커 이동 또는 생성
  //   if (selectedMarker) {
  //     selectedMarker.setPosition(position);
  //   } else {
  //     selectedMarker = new naver.maps.Marker({
  //       position: position,
  //       map: map,
  //     });
  //   }

  //   // 선택한 위치 표시
  //   document.getElementById("selectedLocation").textContent =
  //     `📍 선택한 위치: 위도 ${selectedLat.toFixed(6)}, 경도 ${selectedLng.toFixed(6)}`;
  // });

  // ========================================
  // 지도 위치 선택 공통 함수
  // ========================================

  // ========================================
  // 선택한 농장 위치 마커 관리
  // ========================================

  function setSelectedLocation(position) {
    if (!position) {
      return;
    }

    // 선택 위치 저장
    selectedLat = position.lat();
    selectedLng = position.lng();

    // 기존 마커가 있으면 위치만 이동
    if (selectedMarker) {
      selectedMarker.setPosition(position);
    } else {
      // 마커가 없을 때만 새로 생성
      selectedMarker = new naver.maps.Marker({
        position: position,
        map: map,

        title: "선택한 농지 위치",

        clickable: false,
      });
    }

    // 선택한 위치 표시
    document.getElementById("selectedLocation").textContent =
      `📍 선택한 위치: 위도 ${selectedLat.toFixed(6)}, 경도 ${selectedLng.toFixed(6)}`;
  }

  // ========================================
  // 지도 클릭 이벤트
  // ========================================

  naver.maps.Event.addListener(map, "click", (e) => {
    setSelectedLocation(e.coord);
  });

  // ========================================
  // 3. 선택한 위치 반환
  // ========================================

  function getSelectedLocation() {
    if (selectedLat === null || selectedLng === null) {
      return null;
    }

    return {
      latitude: selectedLat,
      longitude: selectedLng,
    };
  }

  // ========================================
  // 4. 선택 위치 초기화
  // ========================================

  function resetSelectedLocation() {
    selectedLat = null;
    selectedLng = null;

    // 선택 마커 제거
    if (selectedMarker) {
      selectedMarker.setMap(null);
      selectedMarker = null;
    }

    // 위치 안내 초기화
    document.getElementById("selectedLocation").textContent =
      "📍 지도에서 농장 위치를 선택해주세요.";
  }

  // ========================================
  // 5. 저장된 농장 마커 표시
  // ========================================

  function renderFarmMarkers(farms) {
    // 기존 마커 제거
    savedMarkers.forEach((marker) => {
      marker.setMap(null);
    });

    savedMarkers.length = 0;

    // 농장별 마커 생성
    farms.forEach((farm) => {
      if (farm.latitude == null || farm.longitude == null) {
        return;
      }

      const lat = Number(farm.latitude);
      const lng = Number(farm.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(lat, lng),
        map: map,
        title: farm.name,
      });

      savedMarkers.push(marker);
    });

    console.log("저장된 농장 마커 표시 완료!");
  }

  // ========================================
  // 6. 지도 기능 반환
  // ========================================

  return {
    map,
    getSelectedLocation,
    setSelectedLocation,
    resetSelectedLocation,
    renderFarmMarkers,
  };
}
