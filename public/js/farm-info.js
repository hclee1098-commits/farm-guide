// ========================================
// 🌱 농사 가이드 - 농지 정보 관리
// ========================================

// ========================================
// 1. PNU 코드를 지번주소로 변환
// ========================================

export function getFarmAddress(properties) {
  const address = properties.STDG_ADDR || "";
  const pnu = String(properties.PNU ?? "").trim();

  // PNU 유효성 검사
  if (!/^\d{19}$/.test(pnu)) {
    return address || "주소 정보 없음";
  }

  // 토지 구분
  const landType = pnu.substring(10, 11);

  // 본번
  const mainNumber = Number(pnu.substring(11, 15));

  // 부번
  const subNumber = Number(pnu.substring(15, 19));

  if (!["1", "2"].includes(landType) || mainNumber === 0) {
    return address || "주소 정보 없음";
  }

  // 산 여부
  const mountain = landType === "2" ? "산 " : "";

  // 지번 생성
  const lotNumber =
    subNumber === 0 ? `${mainNumber}` : `${mainNumber}-${subNumber}`;

  return `${address} ${mountain}${lotNumber}`.trim();
}

// ========================================
// 2. 선택한 농지 정보 표시
// ========================================

export function showFarmInfo(properties) {
  console.log("🌱 선택한 농지:", properties);

  // 상세 지번주소
  document.getElementById("farmAddress").textContent =
    getFarmAddress(properties);

  // 농지 종류
  document.getElementById("farmType").textContent = properties.CLSF_NM || "-";

  // 농지 면적
  const area =
    properties.AREA == null || properties.AREA === ""
      ? NaN
      : Number(properties.AREA);

  document.getElementById("selectedFarmArea").textContent = Number.isFinite(
    area,
  )
    ? area.toLocaleString("ko-KR", {
        maximumFractionDigits: 2,
      }) + "㎡"
    : "-";

  // 농지 고유번호
  document.getElementById("farmUid").textContent = properties.UID || "-";

  // 필지 번호
  document.getElementById("farmPnu").textContent = properties.PNU || "-";

  // 선택 전 안내 숨기기
  document.getElementById("farmEmptyMessage").style.display = "none";

  // 농지 정보 표시
  document.getElementById("farmInfoContent").style.display = "block";

  console.log("농지 정보 표시 완료!");
}
