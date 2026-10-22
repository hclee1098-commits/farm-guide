// ========================================
// 🌱 농사 가이드 - 팜맵 농지 경계 관리
// ========================================

import { showFarmInfo, getFarmAddress } from "./farm-info.js";

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
    // 3. 등록된 농지 UID 관리
    // ========================================

    // 등록된 농지 UID 목록
    let registeredUids = new Set();

    // SQLite에서 가져온 농장 목록으로 UID 갱신
    function updateRegisteredUids(farms) {
      registeredUids = new Set(
        (Array.isArray(farms) ? farms : [])
          .map((farm) => String(farm.farm_uid ?? "").trim())
          .filter((uid) => uid !== ""),
      );

      console.log("🌱 등록된 농지 UID:", [...registeredUids]);
    }

    // 최초 등록 농지 정보 설정
    updateRegisteredUids(registeredFarms);

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
    // UID 기준
    // ========================================

    function applyPolygonStyle(polygon, uid) {
      // UID로 등록 여부 확인
      const isRegistered = uid !== "" && registeredUids.has(uid);

      // 등록 여부에 따라 색상 결정
      const style = isRegistered ? FARM_COLORS.registered : FARM_COLORS.normal;

      // 지도에 색상 적용
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

    function drawPolygon(rings, properties, featureIndex) {
      const paths = rings.map(convertRing);

      // ========================================
      // 농지 식별 정보
      // ========================================

      // PNU
      const pnu = String(properties.PNU ?? "").trim();

      // UID
      const uid = String(properties.UID ?? "").trim();

      // ========================================
      // 농지 폴리곤 생성
      // ========================================

      const polygon = new naver.maps.Polygon({
        map: map,
        paths: paths,
        clickable: true,
      });

      // UID 기준 색상 적용
      applyPolygonStyle(polygon, uid);

      // 폴리곤 정보 저장
      polygons.push({
        polygon,
        pnu,
        properties,
        featureIndex,
      });

      // ========================================
      // 8. 농지 클릭 이벤트
      // ========================================

      naver.maps.Event.addListener(polygon, "click", (event) => {
        console.log("선택한 농지:", properties);

        // 이전 농지 색상 복구
        if (selectedPolygon) {
          applyPolygonStyle(selectedPolygon.polygon, selectedPolygon.uid);
        }

        // 현재 농지 선택
        selectedPolygon = {
          polygon,
          pnu,
          uid,
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

    geojson.features.forEach((feature, featureIndex) => {
      const geometry = feature.geometry;

      if (!geometry) {
        return;
      }

      const properties = feature.properties || {};

      if (geometry.type === "Polygon") {
        drawPolygon(geometry.coordinates, properties, featureIndex);
      }

      if (geometry.type === "MultiPolygon") {
        geometry.coordinates.forEach((rings) => {
          drawPolygon(rings, properties, featureIndex);
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
      // 최신 등록 농지 UID 목록 반영
      updateRegisteredUids(farms);

      // 모든 농지 폴리곤 순회
      polygons.forEach(({ polygon, uid }) => {
        // 현재 선택된 농지는 주황색 유지
        if (selectedPolygon?.polygon === polygon) {
          return;
        }

        // UID 기준으로 색상 갱신
        applyPolygonStyle(polygon, uid);
      });

      console.log("🌱 등록된 농지 UID 개수:", registeredUids.size);

      console.log("🌱 농지 색상 갱신 완료!");
    }

    // ========================================
    // 12. 농지 선택 해제
    // ========================================

    function clearSelection() {
      if (!selectedPolygon) {
        return;
      }

      // UID 기준으로 원래 색상 복구
      applyPolygonStyle(selectedPolygon.polygon, selectedPolygon.uid);

      // 선택 정보 초기화
      selectedPolygon = null;
    }

    // ========================================
    // 🔎 농지 주소 / PNU / UID 검색
    // ========================================

    function searchFarms(keyword) {
      const query = String(keyword ?? "").trim();

      if (!query) {
        return [];
      }

      // 검색어를 공백 기준으로 분리
      const searchWords = query.toLowerCase().split(/\s+/).filter(Boolean);

      const results = [];

      geojson.features.forEach((feature, featureIndex) => {
        const properties = feature.properties || {};

        // 농지 상세 주소
        const address = getFarmAddress(properties);

        // PNU
        const pnu = String(properties.PNU ?? "").trim();

        // UID
        const uid = String(properties.UID ?? "").trim();

        // 검색 대상 문자열
        const searchText = [address, properties.STDG_ADDR, pnu, uid]
          .join(" ")
          .toLowerCase()
          .replace(/\s+/g, "");

        // 검색어의 모든 단어가 포함되는지 확인
        const matched = searchWords.every((word) => searchText.includes(word));

        if (!matched) {
          return;
        }

        results.push({
          featureIndex,
          uid,
          pnu,
          address,
          area: properties.AREA,
          type: properties.CLSF_NM,
        });
      });

      console.log("🔎 농지 검색 결과:", results.length);

      return results;
    }

    // ========================================
    // 📍 검색한 농지로 지도 이동
    // ========================================

    function focusFarm(featureIndex) {
      const feature = geojson.features[featureIndex];

      if (!feature || !feature.geometry) {
        return false;
      }

      // 검색한 농지에 해당하는 폴리곤 찾기
      const targets = polygons.filter(
        (item) => item.featureIndex === featureIndex,
      );

      if (targets.length === 0) {
        return false;
      }

      const properties = feature.properties || {};

      // 기존 선택 농지 색상 복구
      if (selectedPolygon) {
        applyPolygonStyle(selectedPolygon.polygon, selectedPolygon.pnu);
      }

      // 검색된 농지 선택
      const target = targets[0];

      selectedPolygon = {
        polygon: target.polygon,
        pnu: target.pnu,
      };

      // 선택 농지 주황색 강조
      target.polygon.setOptions(FARM_COLORS.selected);

      // ========================================
      // 농지 경계 좌표 범위 계산
      // ========================================

      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;

      function scanCoordinates(coordinates) {
        if (
          Array.isArray(coordinates) &&
          typeof coordinates[0] === "number" &&
          typeof coordinates[1] === "number"
        ) {
          const [lng, lat] = coordinates;

          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);

          return;
        }

        if (Array.isArray(coordinates)) {
          coordinates.forEach(scanCoordinates);
        }
      }

      scanCoordinates(feature.geometry.coordinates);

      if (!Number.isFinite(minLat)) {
        return false;
      }

      const bounds = new naver.maps.LatLngBounds(
        new naver.maps.LatLng(minLat, minLng),
        new naver.maps.LatLng(maxLat, maxLng),
      );

      // ========================================
      // 기존 지도 이동
      // ========================================

      map.fitBounds(bounds);

      // 농지 정보 표시
      showFarmInfo(properties);

      // 기존 농지 선택 콜백 실행
      if (typeof onFarmSelect === "function") {
        onFarmSelect(properties, bounds.getCenter());
      }

      console.log("📍 검색 농지로 이동 완료:", properties);

      return true;
    }

    console.log("🌱 팜맵 농지 경계 표시 완료!");

    // 외부에서 사용할 기능 반환
    return {
      setRegisteredFarms,
      clearSelection,

      // 농지 검색
      searchFarms,

      // 검색 농지로 이동
      focusFarm,
    };
  } catch (error) {
    console.error("팜맵 오류:", error);

    return null;
  }
}
