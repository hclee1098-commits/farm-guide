// ========================================
// 🌱 농사 가이드 - 팜맵 농지 경계 관리
// ========================================

import { showFarmInfo } from "./farm-info.js";

// ========================================
// 1. 농지 색상 설정
// ========================================

const FARM_COLORS = {
  normal: {
    fillColor: "#4CAF50",
    fillOpacity: 0.25,
    strokeColor: "#2E7D32",
    strokeWeight: 2,
  },

  registered: {
    fillColor: "#2196F3",
    fillOpacity: 0.4,
    strokeColor: "#1565C0",
    strokeWeight: 2,
  },

  selected: {
    fillColor: "#FF9800",
    fillOpacity: 0.5,
    strokeColor: "#F57C00",
    strokeWeight: 3,
  },
};

// ========================================
// 2. 팜맵 농지 경계 불러오기
// ========================================

export async function loadFarmFields(map, onFarmSelect, registeredFarms = []) {
  try {
    console.log("🌱 팜맵 농지 데이터 불러오는 중...");

    const response = await fetch("/api/farmmap/fields");

    if (!response.ok) {
      throw new Error("농지 데이터 조회 실패");
    }

    const geojson = await response.json();

    if (!Array.isArray(geojson.features)) {
      throw new Error("올바른 GeoJSON 형식이 아닙니다.");
    }

    console.log("농지 개수:", geojson.features.length);

    // ========================================
    // 3. 등록된 농지 PNU 관리
    // ========================================

    let registeredPnus = new Set();

    function updateRegisteredPnus(farms) {
      registeredPnus = new Set(
        farms
          .map((farm) => String(farm.pnu ?? "").trim())
          .filter((pnu) => /^\d{19}$/.test(pnu)),
      );
    }

    updateRegisteredPnus(registeredFarms);

    // ========================================
    // 4. 폴리곤 관리
    // ========================================

    const polygons = [];

    let selectedPolygon = null;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    // ========================================
    // 5. 농지 색상 적용
    // ========================================

    function applyPolygonStyle(polygon, pnu) {
      const isRegistered = registeredPnus.has(pnu);

      const style = isRegistered ? FARM_COLORS.registered : FARM_COLORS.normal;

      polygon.setOptions(style);
    }

    // ========================================
    // 6. 좌표 변환
    // ========================================

    function convertRing(ring) {
      return ring.map((coordinate) => {
        const lng = coordinate[0];
        const lat = coordinate[1];

        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);

        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);

        return new naver.maps.LatLng(lat, lng);
      });
    }

    // ========================================
    // 7. 농지 폴리곤 생성
    // ========================================

    function drawPolygon(rings, properties) {
      const paths = rings.map(convertRing);

      const pnu = String(properties.PNU ?? "").trim();

      const polygon = new naver.maps.Polygon({
        map: map,
        paths: paths,
        clickable: true,
      });

      // 등록 여부에 따라 색상 적용
      applyPolygonStyle(polygon, pnu);

      // 폴리곤 정보 저장
      polygons.push({
        polygon,
        pnu,
      });

      // ========================================
      // 8. 농지 클릭 이벤트
      // ========================================

      naver.maps.Event.addListener(polygon, "click", (event) => {
        console.log("선택한 농지:", properties);

        // 이전 농지 색상 복구
        if (selectedPolygon) {
          applyPolygonStyle(selectedPolygon.polygon, selectedPolygon.pnu);
        }

        // 현재 농지 선택
        selectedPolygon = {
          polygon,
          pnu,
        };

        // 선택한 농지 강조
        polygon.setOptions(FARM_COLORS.selected);

        // 농지 정보 표시
        showFarmInfo(properties);

        // 선택 위치 전달
        if (typeof onFarmSelect === "function") {
          const position = event?.coord || paths[0]?.[0] || null;

          onFarmSelect(properties, position);
        }
      });
    }

    // ========================================
    // 9. GeoJSON 농지 순회
    // ========================================

    geojson.features.forEach((feature) => {
      const geometry = feature.geometry;

      if (!geometry) {
        return;
      }

      const properties = feature.properties || {};

      if (geometry.type === "Polygon") {
        drawPolygon(geometry.coordinates, properties);
      }

      if (geometry.type === "MultiPolygon") {
        geometry.coordinates.forEach((rings) => {
          drawPolygon(rings, properties);
        });
      }
    });

    console.log("지도 폴리곤 개수:", polygons.length);

    // ========================================
    // 10. 농지 지역으로 지도 이동
    // ========================================

    if (polygons.length > 0) {
      const bounds = new naver.maps.LatLngBounds(
        new naver.maps.LatLng(minLat, minLng),
        new naver.maps.LatLng(maxLat, maxLng),
      );

      map.fitBounds(bounds);
    }

    // ========================================
    // 11. 등록 농지 색상 새로고침
    // ========================================

    function setRegisteredFarms(farms) {
      updateRegisteredPnus(farms);

      polygons.forEach(({ polygon, pnu }) => {
        // 현재 선택된 농지는 주황색 유지
        if (selectedPolygon?.polygon === polygon) {
          return;
        }

        applyPolygonStyle(polygon, pnu);
      });

      console.log("등록된 농지 PNU 개수:", registeredPnus.size);
    }

    // ========================================
    // 12. 농지 선택 해제
    // ========================================

    function clearSelection() {
      if (!selectedPolygon) {
        return;
      }

      applyPolygonStyle(selectedPolygon.polygon, selectedPolygon.pnu);

      selectedPolygon = null;
    }

    console.log("🌱 팜맵 농지 경계 표시 완료!");

    // 외부에서 사용할 기능 반환
    return {
      setRegisteredFarms,
      clearSelection,
    };
  } catch (error) {
    console.error("팜맵 오류:", error);

    return null;
  }
}
