// ========================================
// 🌱 농사 가이드 백엔드 서버
// ========================================

// 모듈 불러오기
const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// ========================================
// 1. 서버 기본 설정
// ========================================

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// JSON 데이터 처리
app.use(express.json());

// 환경변수 확인
console.log("==============================");
console.log("🌱 농사 가이드 서버 시작");
console.log("==============================");

console.log(
  "네이버 지도 Client ID:",
  process.env.NAVER_MAP_CLIENT_ID ? "설정 완료" : "설정 없음",
);

console.log(
  "팜맵 API KEY:",
  process.env.FARMMAP_API_KEY ? "설정 완료" : "설정 없음",
);

// ========================================
// 2. 메인 페이지 제공
// 네이버 지도 Client ID 자동 적용
// ========================================

app.get(["/", "/index.html"], (req, res) => {
  try {
    console.log("메인 페이지 요청 수신");

    // 환경변수에서 Client ID 가져오기
    const clientId = process.env.NAVER_MAP_CLIENT_ID?.trim();

    if (!clientId) {
      console.error("네이버 지도 Client ID가 없습니다.");

      return res.status(500).send("네이버 지도 API 설정이 없습니다.");
    }

    // HTML 파일 경로
    const htmlPath = path.join(__dirname, "public", "index.html");

    // HTML 파일 존재 여부 확인
    if (!fs.existsSync(htmlPath)) {
      console.error("index.html 파일을 찾을 수 없습니다.");

      return res.status(404).send("메인 페이지 파일이 없습니다.");
    }

    // HTML 파일 읽기
    let html = fs.readFileSync(htmlPath, "utf8");

    // 인증키 자리 표시자 확인
    if (!html.includes("__NAVER_MAP_CLIENT_ID__")) {
      console.error(
        "index.html에서 네이버 지도 인증키 자리 표시자를 찾을 수 없습니다.",
      );

      return res.status(500).send("네이버 지도 HTML 설정을 확인해주세요.");
    }

    // 실제 Client ID 적용
    html = html.replaceAll(
      "__NAVER_MAP_CLIENT_ID__",
      encodeURIComponent(clientId),
    );

    console.log("네이버 지도 Client ID 적용 완료");

    // HTML 캐시 방지
    res.set("Cache-Control", "no-store");

    // HTML 전달
    res.type("html").send(html);
  } catch (error) {
    console.error("메인 페이지 오류:", error.message);

    res.status(500).send("메인 페이지를 불러오지 못했습니다.");
  }
});

// ========================================
// 3. 프론트엔드 정적 파일 제공
// ========================================

app.use(
  express.static(path.join(__dirname, "public"), {
    index: false,
  }),
);

// ========================================
// 4. SQLite 데이터베이스 연결
// ========================================

console.log("데이터베이스 연결 시작...");

const db = new DatabaseSync(path.join(__dirname, "farm-guide.db"));

console.log("데이터베이스 연결 성공!");

// ========================================
// 5. 농장 정보 테이블 생성
// ========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS farms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    crop TEXT,
    area REAL,
    latitude REAL,
    longitude REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log("농장 테이블 생성 완료!");

// ========================================
// 농장 데이터베이스 확장
// ========================================

// 기존 farms 테이블의 컬럼 확인
const columns = db.prepare("PRAGMA table_info(farms)").all();

const columnNames = columns.map((column) => column.name);

// ========================================
// 농지 주소 컬럼 추가
// ========================================

if (!columnNames.includes("address")) {
  db.exec(`
    ALTER TABLE farms
    ADD COLUMN address TEXT
  `);

  console.log("농지 주소 컬럼 추가 완료!");
}

// ========================================
// PNU 컬럼 추가
// ========================================

if (!columnNames.includes("pnu")) {
  db.exec(`
    ALTER TABLE farms
    ADD COLUMN pnu TEXT
  `);

  console.log("PNU 컬럼 추가 완료!");
}

console.log("농장 데이터베이스 확장 완료!");

// ========================================
// 6. 농장 목록 조회 API
// ========================================

app.get("/api/farms", (req, res) => {
  try {
    const farms = db.prepare("SELECT * FROM farms ORDER BY id DESC").all();

    res.json(farms);
  } catch (error) {
    console.error("농장 목록 조회 오류:", error.message);

    res.status(500).json({
      success: false,
      message: "농장 목록 조회 실패",
    });
  }
});

// ========================================
// 7. 농장 정보 저장 API
// ========================================

// ========================================
// 농장 정보 저장 API
// ========================================

app.post("/api/farms", (req, res) => {
  try {
    // ========================================
    // 요청 데이터
    // ========================================
    const { name, crop, area, latitude, longitude, address, pnu, farm_uid } =
      req.body;

    // ========================================
    // 농장 이름 검사
    // ========================================

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "농장 이름을 입력해주세요.",
      });
    }

    // ========================================
    // 데이터 정리
    // ========================================

    const farmName = name.trim();

    const farmCrop = typeof crop === "string" ? crop.trim() : null;

    const farmAddress = typeof address === "string" ? address.trim() : null;

    const farmPnu = typeof pnu === "string" ? pnu.trim() : null;

    // ========================================
    // 팜맵 농지 UID 처리
    // ========================================

    const farmUid =
      farm_uid === null || farm_uid === undefined
        ? null
        : String(farm_uid).trim() || null;

    const farmArea =
      area === null || area === undefined || area === "" ? null : Number(area);

    const farmLat =
      latitude === null || latitude === undefined || latitude === ""
        ? null
        : Number(latitude);

    const farmLng =
      longitude === null || longitude === undefined || longitude === ""
        ? null
        : Number(longitude);

    // ========================================
    // 입력값 검증
    // ========================================

    if (farmArea !== null && (!Number.isFinite(farmArea) || farmArea < 0)) {
      return res.status(400).json({
        success: false,
        message: "올바른 농지 면적을 입력해주세요.",
      });
    }

    if (
      farmLat === null ||
      farmLng === null ||
      !Number.isFinite(farmLat) ||
      !Number.isFinite(farmLng) ||
      farmLat < -90 ||
      farmLat > 90 ||
      farmLng < -180 ||
      farmLng > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "올바른 농지 위치를 선택해주세요.",
      });
    }

    if (farmPnu && !/^\d{19}$/.test(farmPnu)) {
      return res.status(400).json({
        success: false,
        message: "PNU는 19자리 숫자여야 합니다.",
      });
    }

    // ========================================
    // SQLite 저장
    // ========================================

    const result = db
      .prepare(
        `
        INSERT INTO farms (
          name,
          crop,
          area,
          latitude,
          longitude,
          address,
          pnu,
          farm_uid
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        farmName,
        farmCrop,
        farmArea,
        farmLat,
        farmLng,
        farmAddress,
        farmPnu,
        farmUid,
      );

    // ========================================
    // 저장 결과
    // ========================================

    console.log("농장 등록 완료:", farmName);
    console.log("농지 주소:", farmAddress);
    console.log("PNU:", farmPnu);
    console.log("UID:", farmUid);

    res.status(201).json({
      success: true,
      id: Number(result.lastInsertRowid),
      message: "농장 정보가 저장되었습니다.",
    });
  } catch (error) {
    console.error("농장 저장 오류:", error.message);

    res.status(500).json({
      success: false,
      message: "농장 정보를 저장하지 못했습니다.",
    });
  }
});

// ========================================
// 농장 삭제 API
// ========================================

app.delete("/api/farms/:id", (req, res) => {
  try {
    // 삭제할 농장 ID
    const id = Number(req.params.id);

    // ID 유효성 검사
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장 ID가 아닙니다.",
      });
    }

    // 데이터베이스에서 농장 삭제
    const result = db.prepare("DELETE FROM farms WHERE id = ?").run(id);

    // 삭제할 농장이 없는 경우
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "농장을 찾을 수 없습니다.",
      });
    }

    // 삭제 성공
    res.json({
      success: true,
      message: "농장이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("농장 삭제 오류:", error);

    res.status(500).json({
      success: false,
      message: "농장 삭제 중 오류가 발생했습니다.",
    });
  }
});

// ========================================
// 🌱 농장 정보 수정 API
// ========================================

app.put("/api/farms/:id", (req, res) => {
  try {
    // ========================================
    // 1. 수정할 농장 ID
    // ========================================

    const farmId = Number(req.params.id);

    if (!Number.isSafeInteger(farmId) || farmId <= 0) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장 ID가 아닙니다.",
      });
    }

    // ========================================
    // 2. 수정할 데이터
    // ========================================

    const { name, crop, area } = req.body || {};

    // ========================================
    // 3. 농장 이름 검사
    // ========================================

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "농장 이름을 입력해주세요.",
      });
    }

    // ========================================
    // 4. 데이터 정리
    // ========================================

    const farmName = name.trim();

    const farmCrop = typeof crop === "string" ? crop.trim() : null;

    const farmArea =
      area === null || area === undefined || area === "" ? null : Number(area);

    // ========================================
    // 5. 면적 검증
    // ========================================

    if (farmArea !== null && (!Number.isFinite(farmArea) || farmArea < 0)) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장 면적을 입력해주세요.",
      });
    }

    // ========================================
    // 6. SQLite 농장 정보 수정
    // ========================================

    const result = db
      .prepare(
        `
        UPDATE farms
        SET
          name = ?,
          crop = ?,
          area = ?
        WHERE id = ?
      `,
      )
      .run(farmName, farmCrop, farmArea, farmId);

    // ========================================
    // 7. 수정 대상 확인
    // ========================================

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "수정할 농장을 찾을 수 없습니다.",
      });
    }

    // ========================================
    // 8. 수정 성공
    // ========================================

    console.log("🌱 농장 정보 수정 완료:", farmId);

    res.json({
      success: true,
      message: "농장 정보가 수정되었습니다.",
    });
  } catch (error) {
    console.error("농장 정보 수정 오류:", error);

    res.status(500).json({
      success: false,
      message: "농장 정보를 수정하지 못했습니다.",
    });
  }
});

// ========================================
// 8. 팜맵 WFS API 테스트
// ========================================

app.get("/api/farmmap/test", async (req, res) => {
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

    // WFS 요청 설정
    url.searchParams.set("service", "wfs");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typename", "farm_map_api");

    // 테스트 지역
    url.searchParams.set(
      "bbox",
      "127.26970665192174,36.483493170819564,127.29135924097692,36.49340252593019,EPSG:4326",
    );

    url.searchParams.set("srsname", "EPSG:4326");
    url.searchParams.set("outputformat", "json");
    url.searchParams.set("count", "10");
    url.searchParams.set("startindex", "0");

    // 인증 정보
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

    // JSON 응답 확인
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

    res.json(data);
  } catch (error) {
    console.error("팜맵 API 오류:", error.message);

    res.status(500).json({
      success: false,
      message: "팜맵 API 연결 중 오류가 발생했습니다.",
    });
  }
});

// ========================================
// 9. 팜맵 WMS 연결 테스트
// ========================================

app.get("/api/farmmap/wms-test", async (req, res) => {
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

    // 인증키가 응답에 노출되지 않도록 처리
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

    res.json(result);
  } catch (error) {
    console.error("WMS 오류:", error.message);

    res.status(500).json({
      success: false,
      message: "WMS 연결 오류",
    });
  }
});

// ========================================
// 10. 팜맵 데이터 API 테스트
// ========================================

app.get("/api/farmmap/data-test", async (req, res) => {
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

    // 테스트 좌표
    url.searchParams.set("x", "976555.97765681");
    url.searchParams.set("y", "1838993.1813686");

    url.searchParams.set("epsg", "EPSG:5179");
    url.searchParams.set("mapType", "farmmap");
    url.searchParams.set("columnType", "ENG");
    url.searchParams.set("apiVersion", "v1");

    // 인증 정보
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("domain", domain);

    console.log("팜맵 데이터 API 테스트 시작...");

    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    const raw = await response.text();

    // 인증키 숨기기
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

    res.json({
      success: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      redirectTo: safeLocation,
      preview: safeRaw.slice(0, 300),
    });
  } catch (error) {
    console.error("팜맵 데이터 API 오류:", error.message);

    res.status(500).json({
      success: false,
      message: "팜맵 데이터 API 요청 중 오류가 발생했습니다.",
    });
  }
});

// ========================================
// 11. 영양군 홍계리 농지 경계 조회 API
// ========================================

app.get("/api/farmmap/fields", (req, res) => {
  try {
    // GeoJSON 파일 경로
    const filePath = path.join(
      __dirname,
      "data",
      "processed",
      "yeongyang-honggye.geojson",
    );

    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "농지 경계 데이터 파일이 없습니다.",
      });
    }

    // GeoJSON 데이터 반환
    res.type("application/json");

    res.sendFile(filePath, (error) => {
      if (error) {
        console.error("농지 데이터 전송 오류:", error.message);
      }
    });
  } catch (error) {
    console.error("농지 경계 조회 오류:", error.message);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "농지 경계 데이터를 불러오지 못했습니다.",
      });
    }
  }
});

// ========================================
// 12. 서버 실행
// ========================================

const server = app.listen(PORT, () => {
  console.log("==============================");
  console.log("🌱 농사 가이드 서버 실행 완료!");
  console.log(`주소: http://127.0.0.1:${PORT}`);
  console.log("데이터베이스 연결 완료!");
  console.log("==============================");
});

server.on("error", (error) => {
  console.error("서버 실행 오류:", error.message);
});
