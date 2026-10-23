// ========================================
// 🌱 농사 가이드 백엔드 서버
// ========================================

// 모듈 불러오기
const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

// ========================================
// 📸 재배 일지 사진 업로드
// ========================================

const multer = require("multer");

const diaryPhotoUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 3 * 1024 * 1024,
    files: 1,
  },
});

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

// ========================================
// 🌱 SQLite 외래 키 제약 조건 활성화
// ========================================

db.exec("PRAGMA foreign_keys = ON");

console.log("SQLite 외래 키 활성화 완료!");

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
// 🌱 농장 상세 정보 조회 API
// ========================================

app.get("/api/farms/:id", (req, res) => {
  try {
    // ========================================
    // 1. 농장 ID 확인
    // ========================================

    const farmId = Number(req.params.id);

    if (!Number.isSafeInteger(farmId) || farmId <= 0) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장 ID가 아닙니다.",
      });
    }

    // ========================================
    // 2. SQLite에서 농장 조회
    // ========================================

    const farm = db
      .prepare(
        `
        SELECT
          id,
          name,
          crop,
          area,
          address,
          pnu,
          farm_uid
        FROM farms
        WHERE id = ?
      `,
      )
      .get(farmId);

    // ========================================
    // 3. 농장 존재 여부 확인
    // ========================================

    if (!farm) {
      return res.status(404).json({
        success: false,
        message: "해당 농장을 찾을 수 없습니다.",
      });
    }

    // ========================================
    // 4. 농장 정보 반환
    // ========================================

    console.log("🌱 농장 상세 조회:", farm.name);

    res.json(farm);
  } catch (error) {
    console.error("농장 상세 조회 오류:", error);

    res.status(500).json({
      success: false,
      message: "농장 정보를 불러오지 못했습니다.",
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
// 🌱 재배 일지 테이블 생성
// ========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS farm_diaries (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    farm_id INTEGER NOT NULL,

    work_date TEXT NOT NULL,

    work_type TEXT NOT NULL,

    memo TEXT NOT NULL DEFAULT '',

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (farm_id)
      REFERENCES farms(id)
      ON DELETE CASCADE
  )
`);

console.log("🌱 재배 일지 테이블 생성 완료!");

// ========================================
// 📸 재배 일지 사진 테이블
// ========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS diary_photos (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    diary_id INTEGER NOT NULL UNIQUE,

    mime_type TEXT NOT NULL,

    image_data BLOB NOT NULL,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (diary_id)
      REFERENCES farm_diaries(id)
      ON DELETE CASCADE
  )
`);

console.log("📸 재배 일지 사진 테이블 생성 완료!");

// ========================================
// 재배 일지 조회 속도 개선
// ========================================

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_farm_diaries_farm_date
  ON farm_diaries(farm_id, work_date DESC, id DESC)
`);

console.log("🌱 재배 일지 인덱스 생성 완료!");

// ========================================
// 🌱 농장별 재배 일지 조회 API
// ========================================

app.get("/api/farms/:id/diaries", (req, res) => {
  try {
    // ========================================
    // 1. 농장 ID 확인
    // ========================================

    const farmId = Number(req.params.id);

    if (!Number.isSafeInteger(farmId) || farmId <= 0) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장 ID가 아닙니다.",
      });
    }

    // ========================================
    // 2. 농장 존재 여부 확인
    // ========================================

    const farm = db.prepare("SELECT id FROM farms WHERE id = ?").get(farmId);

    if (!farm) {
      return res.status(404).json({
        success: false,
        message: "해당 농장을 찾을 수 없습니다.",
      });
    }

    // ========================================
    // 3. 재배 일지 조회
    // ========================================

    const diaries = db
      .prepare(
        `
        SELECT *
        FROM farm_diaries
        WHERE farm_id = ?
        ORDER BY work_date DESC, id DESC
      `,
      )
      .all(farmId);

    // ========================================
    // 4. 조회 결과 반환
    // ========================================

    res.json(diaries);
  } catch (error) {
    console.error("재배 일지 조회 오류:", error);

    res.status(500).json({
      success: false,
      message: "재배 일지를 불러오지 못했습니다.",
    });
  }
});

// ========================================
// 🌱 재배 일지 저장 API
// ========================================

app.post("/api/farms/:id/diaries", (req, res) => {
  try {
    // ========================================
    // 1. 농장 ID
    // ========================================

    const farmId = Number(req.params.id);

    if (!Number.isSafeInteger(farmId) || farmId <= 0) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장 ID가 아닙니다.",
      });
    }

    // ========================================
    // 2. 요청 데이터
    // ========================================

    const { work_date, work_type, memo } = req.body || {};

    // ========================================
    // 3. 입력값 검증
    // ========================================

    if (
      typeof work_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(work_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "올바른 작업 날짜를 입력해주세요.",
      });
    }

    // 실제 존재하는 날짜인지 확인
    const [year, month, day] = work_date.split("-").map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return res.status(400).json({
        success: false,
        message: "존재하지 않는 날짜입니다.",
      });
    }

    // ========================================
    // 작업 종류 검증
    // ========================================

    if (
      typeof work_type !== "string" ||
      !work_type.trim() ||
      work_type.trim().length > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "작업 종류는 1~50자로 입력해주세요.",
      });
    }

    // ========================================
    // 작업 내용 검증
    // ========================================

    if (memo !== undefined && memo !== null && typeof memo !== "string") {
      return res.status(400).json({
        success: false,
        message: "작업 내용은 문자열이어야 합니다.",
      });
    }

    if (typeof memo === "string" && memo.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        message: "작업 내용은 2000자 이하로 입력해주세요.",
      });
    }

    // ========================================
    // 4. 농장 존재 여부 확인
    // ========================================

    const farm = db.prepare("SELECT id FROM farms WHERE id = ?").get(farmId);

    if (!farm) {
      return res.status(404).json({
        success: false,
        message: "해당 농장을 찾을 수 없습니다.",
      });
    }

    // ========================================
    // 5. 재배 일지 저장
    // ========================================

    const result = db
      .prepare(
        `
        INSERT INTO farm_diaries (
          farm_id,
          work_date,
          work_type,
          memo
        )
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(
        farmId,
        work_date,
        work_type.trim(),
        typeof memo === "string" ? memo.trim() : "",
      );

    // ========================================
    // 6. 저장 완료
    // ========================================

    console.log("🌱 재배 일지 저장 완료:", farmId);

    res.status(201).json({
      success: true,
      id: Number(result.lastInsertRowid),
      message: "재배 일지가 저장되었습니다.",
    });
  } catch (error) {
    console.error("재배 일지 저장 오류:", error);

    res.status(500).json({
      success: false,
      message: "재배 일지를 저장하지 못했습니다.",
    });
  }
});

// ========================================
// 📸 재배 일지 사진 저장 API
// ========================================

app.post("/api/farms/:id/diaries/:diaryId/photo", (req, res) => {
  diaryPhotoUpload.single("photo")(req, res, (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        success: false,
        message: "사진 업로드에 실패했습니다. 파일 크기와 형식을 확인해주세요.",
      });
    }

    try {
      // ========================================
      // 1. 농장 및 일지 ID 확인
      // ========================================

      const farmId = Number(req.params.id);
      const diaryId = Number(req.params.diaryId);

      if (
        !Number.isSafeInteger(farmId) ||
        farmId <= 0 ||
        !Number.isSafeInteger(diaryId) ||
        diaryId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "올바른 농장 또는 일지 ID가 아닙니다.",
        });
      }

      // ========================================
      // 2. 사진 확인
      // ========================================

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "사진을 선택해주세요.",
        });
      }

      const mimeType = req.file.mimetype;
      const imageData = req.file.buffer;

      // 실제 파일 내용 검사
      const isJpeg =
        mimeType === "image/jpeg" &&
        imageData.length >= 3 &&
        imageData[0] === 0xff &&
        imageData[1] === 0xd8 &&
        imageData[2] === 0xff;

      const isPng =
        mimeType === "image/png" &&
        imageData.length >= 8 &&
        imageData.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));

      const isWebp =
        mimeType === "image/webp" &&
        imageData.length >= 12 &&
        imageData.toString("ascii", 0, 4) === "RIFF" &&
        imageData.toString("ascii", 8, 12) === "WEBP";

      if (!isJpeg && !isPng && !isWebp) {
        return res.status(400).json({
          success: false,
          message: "JPG, PNG, WebP 사진만 등록할 수 있습니다.",
        });
      }

      // ========================================
      // 3. 해당 농장의 재배 일지인지 확인
      // ========================================

      const diary = db
        .prepare(
          `
          SELECT id
          FROM farm_diaries
          WHERE id = ? AND farm_id = ?
          `,
        )
        .get(diaryId, farmId);

      if (!diary) {
        return res.status(404).json({
          success: false,
          message: "해당 농장의 재배 일지를 찾을 수 없습니다.",
        });
      }

      // ========================================
      // 4. 사진 저장
      // 기존 사진이 있다면 교체
      // ========================================

      db.prepare(
        `
        INSERT INTO diary_photos (
          diary_id,
          mime_type,
          image_data
        )
        VALUES (?, ?, ?)

        ON CONFLICT(diary_id)
        DO UPDATE SET
          mime_type = excluded.mime_type,
          image_data = excluded.image_data
        `,
      ).run(diaryId, mimeType, imageData);

      console.log("📸 재배 일지 사진 저장 완료:", diaryId);

      res.status(201).json({
        success: true,
        message: "사진이 저장되었습니다.",
      });
    } catch (error) {
      console.error("사진 저장 오류:", error);

      res.status(500).json({
        success: false,
        message: "사진을 저장하지 못했습니다.",
      });
    }
  });
});

// ========================================
// 📸 재배 일지 사진 조회 API
// ========================================

app.get("/api/farms/:id/diaries/:diaryId/photo", (req, res) => {
  try {
    const farmId = Number(req.params.id);
    const diaryId = Number(req.params.diaryId);

    if (
      !Number.isSafeInteger(farmId) ||
      farmId <= 0 ||
      !Number.isSafeInteger(diaryId) ||
      diaryId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장 또는 일지 ID가 아닙니다.",
      });
    }

    // ========================================
    // 사진 조회
    // ========================================

    const photo = db
      .prepare(
        `
        SELECT
          p.mime_type,
          p.image_data

        FROM diary_photos p

        JOIN farm_diaries d
          ON p.diary_id = d.id

        WHERE d.id = ?
          AND d.farm_id = ?
        `,
      )
      .get(diaryId, farmId);

    if (!photo) {
      return res.status(404).json({
        success: false,
        message: "등록된 사진이 없습니다.",
      });
    }

    // ========================================
    // 이미지 반환
    // ========================================

    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");

    res.type(photo.mime_type);

    res.send(Buffer.from(photo.image_data));
  } catch (error) {
    console.error("사진 조회 오류:", error);

    res.status(500).json({
      success: false,
      message: "사진을 불러오지 못했습니다.",
    });
  }
});

// ========================================
// 📖 재배 일지 수정 API
// ========================================

app.put("/api/farms/:id/diaries/:diaryId", (req, res) => {
  try {
    // ========================================
    // 1. 농장 ID 및 일지 ID 확인
    // ========================================

    const farmId = Number(req.params.id);

    const diaryId = Number(req.params.diaryId);

    if (
      !Number.isSafeInteger(farmId) ||
      farmId <= 0 ||
      !Number.isSafeInteger(diaryId) ||
      diaryId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장 또는 재배 일지 ID가 아닙니다.",
      });
    }

    // ========================================
    // 2. 수정할 재배 일지 확인
    // ========================================

    const existingDiary = db
      .prepare(
        `
        SELECT *
        FROM farm_diaries
        WHERE id = ? AND farm_id = ?
        `,
      )
      .get(diaryId, farmId);

    if (!existingDiary) {
      return res.status(404).json({
        success: false,
        message: "수정할 재배 일지를 찾을 수 없습니다.",
      });
    }

    // ========================================
    // 3. 요청 데이터
    // ========================================

    const { work_date, work_type, memo } = req.body ?? {};

    // ========================================
    // 4. 작업 날짜 검증
    // ========================================

    if (
      typeof work_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(work_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "올바른 작업 날짜를 입력해주세요.",
      });
    }

    // 실제 존재하는 날짜 확인
    const date = new Date(`${work_date}T00:00:00Z`);

    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== work_date
    ) {
      return res.status(400).json({
        success: false,
        message: "존재하지 않는 날짜입니다.",
      });
    }

    // ========================================
    // 5. 작업 종류 검증
    // ========================================

    if (
      typeof work_type !== "string" ||
      !work_type.trim() ||
      work_type.trim().length > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "작업 종류는 1~50자로 입력해주세요.",
      });
    }

    // ========================================
    // 6. 작업 내용 검증
    // ========================================

    if (memo !== undefined && memo !== null && typeof memo !== "string") {
      return res.status(400).json({
        success: false,
        message: "작업 내용 형식이 올바르지 않습니다.",
      });
    }

    const workMemo = (memo ?? "").trim();

    if (workMemo.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "작업 내용은 2000자 이하로 입력해주세요.",
      });
    }

    // ========================================
    // 7. SQLite 재배 일지 수정
    // ========================================

    db.prepare(
      `
      UPDATE farm_diaries

      SET
        work_date = ?,
        work_type = ?,
        memo = ?

      WHERE id = ? AND farm_id = ?
      `,
    ).run(work_date, work_type.trim(), workMemo, diaryId, farmId);

    // ========================================
    // 8. 수정된 재배 일지 조회
    // ========================================

    const updatedDiary = db
      .prepare(
        `
        SELECT *
        FROM farm_diaries
        WHERE id = ? AND farm_id = ?
        `,
      )
      .get(diaryId, farmId);

    console.log("📖 재배 일지 수정 완료:", diaryId);

    // ========================================
    // 9. 수정 결과 반환
    // ========================================

    res.json({
      success: true,
      message: "재배 일지가 수정되었습니다.",
      diary: updatedDiary,
    });
  } catch (error) {
    console.error("재배 일지 수정 오류:", error);

    res.status(500).json({
      success: false,
      message: "재배 일지를 수정하지 못했습니다.",
    });
  }
});

// ========================================
// 🗑 재배 일지 삭제 API
// ========================================

app.delete("/api/farms/:id/diaries/:diaryId", (req, res) => {
  try {
    // ========================================
    // 1. 농장 ID 및 일지 ID
    // ========================================

    const farmId = Number(req.params.id);

    const diaryId = Number(req.params.diaryId);

    if (
      !Number.isSafeInteger(farmId) ||
      farmId <= 0 ||
      !Number.isSafeInteger(diaryId) ||
      diaryId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장 또는 재배 일지 ID가 아닙니다.",
      });
    }

    // ========================================
    // 2. 삭제할 재배 일지 확인
    // ========================================

    const diary = db
      .prepare(
        `
        SELECT id
        FROM farm_diaries
        WHERE id = ? AND farm_id = ?
        `,
      )
      .get(diaryId, farmId);

    if (!diary) {
      return res.status(404).json({
        success: false,
        message: "삭제할 재배 일지를 찾을 수 없습니다.",
      });
    }

    // ========================================
    // 3. SQLite에서 재배 일지 삭제
    // ========================================

    const result = db
      .prepare(
        `
        DELETE FROM farm_diaries
        WHERE id = ? AND farm_id = ?
        `,
      )
      .run(diaryId, farmId);

    // ========================================
    // 4. 삭제 결과 확인
    // ========================================

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제할 재배 일지가 없습니다.",
      });
    }

    console.log("🗑 재배 일지 삭제 완료:", diaryId);

    // ========================================
    // 5. 삭제 성공 응답
    // ========================================

    res.json({
      success: true,
      message: "재배 일지가 삭제되었습니다.",
      deletedId: diaryId,
    });
  } catch (error) {
    console.error("재배 일지 삭제 오류:", error);

    res.status(500).json({
      success: false,
      message: "재배 일지를 삭제하지 못했습니다.",
    });
  }
});

// ========================================
// 12. 서버 실행
// ========================================

// ========================================
// 🌱 서버 실행
// ========================================

const server = app.listen(PORT, () => {
  console.log("==============================");
  console.log("🌱 농사 가이드 서버 실행 완료!");

  console.log(`서버 포트: ${PORT}`);

  if (process.env.NODE_ENV !== "production") {
    console.log(`로컬 접속: http://127.0.0.1:${PORT}`);
  }

  console.log("데이터베이스 연결 완료!");
  console.log("==============================");
});

server.on("error", (error) => {
  console.error("서버 실행 오류:", error.message);
});
