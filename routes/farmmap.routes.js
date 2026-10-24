// ========================================
// 🌱 농사 가이드 - 팜맵 API 라우터
// ========================================

const express = require("express");
const path = require("path");
const fs = require("fs");

// ========================================
// Express Router 생성
// ========================================

const router = express.Router();

// ========================================
// 1. 팜맵 WFS API 테스트
// GET /api/farmmap/test
// ========================================

router.get("/test", async (req, res) => {
  try {
    const apiKey = process.env.FARMMAP_API_KEY;
    const domain = process.env.FARMMAP_DOMAIN;

    if (!apiKey || !domain) {
      return res.status(500).json({
        success: false,
        message: "팜맵 API 인증 정보가 없습니다.",
      });
    }

    const url = new URL("https://agis.epis.or.kr/ASD/farmmapApi/wfs.do");

    // ========================================
    // WFS 요청 설정
    // ========================================

    url.searchParams.set("service", "wfs");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typename", "farm_map_api");

    // ========================================
    // 테스트 지역
    // ========================================

    url.searchParams.set(
      "bbox",
      "127.26970665192174,36.483493170819564,127.29135924097692,36.49340252593019,EPSG:4326",
    );

    url.searchParams.set("srsname", "EPSG:4326");
    url.searchParams.set("outputformat", "json");
    url.searchParams.set("count", "10");
    url.searchParams.set("startindex", "0");

    // ========================================
    // 인증 정보
    // ========================================

    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("domain", domain);

    console.log("팜맵 WFS API 요청 시작...");

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });

    const raw = await response.text();

    console.log("팜맵 응답 상태:", response.status);
    console.log("팜맵 응답 형식:", response.headers.get("content-type"));

    // ========================================
    // JSON 응답 확인
    // ========================================

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        message: "팜맵 서버가 JSON이 아닌 응답을 반환했습니다.",
        status: response.status,
      });
    }

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: "팜맵 API 요청 실패",
        status: response.status,
      });
    }

    console.log("팜맵 WFS 응답 수신 완료!");

    return res.json(data);
  } catch (error) {
    console.error("팜맵 API 오류:", error.message);

    return res.status(500).json({
      success: false,
      message: "팜맵 API 연결 중 오류가 발생했습니다.",
    });
  }
});

// ========================================
// 2. 팜맵 WMS 연결 테스트
// GET /api/farmmap/wms-test
// ========================================

router.get("/wms-test", async (req, res) => {
  try {
    const apiKey = process.env.FARMMAP_API_KEY;
    const domain = process.env.FARMMAP_DOMAIN;

    if (!apiKey || !domain) {
      return res.status(500).json({
        success: false,
        message: "팜맵 API 인증 정보가 없습니다.",
      });
    }

    const url = new URL("https://agis.epis.or.kr/ASD/farmmapApi/wms.do");

    url.searchParams.set("service", "wms");
    url.searchParams.set("request", "GetCapabilities");

    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("domain", domain);

    console.log("팜맵 WMS 테스트 시작...");

    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    const location = response.headers.get("location");

    // ========================================
    // 인증키 노출 방지
    // ========================================

    const safeLocation = location
      ? location
          .replaceAll(apiKey, "[API_KEY_HIDDEN]")
          .replaceAll(encodeURIComponent(apiKey), "[API_KEY_HIDDEN]")
      : null;

    const result = {
      status: response.status,
      contentType: response.headers.get("content-type"),
      redirectTo: safeLocation,
    };

    console.log("팜맵 WMS 테스트 결과:", result);

    return res.json(result);
  } catch (error) {
    console.error("WMS 오류:", error.message);

    return res.status(500).json({
      success: false,
      message: "WMS 연결 오류",
    });
  }
});

// ========================================
// 3. 팜맵 데이터 API 테스트
// GET /api/farmmap/data-test
// ========================================

router.get("/data-test", async (req, res) => {
  try {
    const apiKey = process.env.FARMMAP_API_KEY;
    const domain = process.env.FARMMAP_DOMAIN;

    if (!apiKey || !domain) {
      return res.status(500).json({
        success: false,
        message: "팜맵 API 인증 정보가 없습니다.",
      });
    }

    const url = new URL(
      "https://agis.epis.or.kr/ASD/farmmapApi/getFarmmapDataSeachXY.do",
    );

    // ========================================
    // 테스트 좌표
    // ========================================

    url.searchParams.set("x", "976555.97765681");
    url.searchParams.set("y", "1838993.1813686");

    url.searchParams.set("epsg", "EPSG:5179");
    url.searchParams.set("mapType", "farmmap");
    url.searchParams.set("columnType", "ENG");
    url.searchParams.set("apiVersion", "v1");

    // ========================================
    // 인증 정보
    // ========================================

    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("domain", domain);

    console.log("팜맵 데이터 API 테스트 시작...");

    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    const raw = await response.text();

    // ========================================
    // 인증키 숨기기
    // ========================================

    const safeRaw = raw
      .replaceAll(apiKey, "[API_KEY_HIDDEN]")
      .replaceAll(encodeURIComponent(apiKey), "[API_KEY_HIDDEN]");

    const location = response.headers.get("location");

    const safeLocation = location
      ? location
          .replaceAll(apiKey, "[API_KEY_HIDDEN]")
          .replaceAll(encodeURIComponent(apiKey), "[API_KEY_HIDDEN]")
      : null;

    console.log("HTTP 상태:", response.status);

    console.log("응답 형식:", response.headers.get("content-type"));

    return res.json({
      success: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      redirectTo: safeLocation,
      preview: safeRaw.slice(0, 300),
    });
  } catch (error) {
    console.error("팜맵 데이터 API 오류:", error.message);

    return res.status(500).json({
      success: false,
      message: "팜맵 데이터 API 요청 중 오류가 발생했습니다.",
    });
  }
});

// ========================================
// 4. 농지 경계 GeoJSON 조회
// GET /api/farmmap/fields
// ========================================

router.get("/fields", (req, res) => {
  try {
    // ========================================
    // GeoJSON 파일 경로
    // ========================================

    const filePath = path.join(
      __dirname,
      "..",
      "data",
      "processed",
      "yeongyang-honggye.geojson",
    );

    // ========================================
    // 파일 존재 여부 확인
    // ========================================

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "농지 경계 데이터 파일이 없습니다.",
      });
    }

    // ========================================
    // GeoJSON 데이터 반환
    // ========================================

    res.type("application/json");

    res.sendFile(filePath, (error) => {
      if (error) {
        console.error("농지 데이터 전송 오류:", error.message);
      }
    });
  } catch (error) {
    console.error("농지 경계 조회 오류:", error.message);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "농지 경계 데이터를 불러오지 못했습니다.",
      });
    }
  }
});

// ========================================
// 팜맵 라우터 내보내기
// ========================================

module.exports = router;
