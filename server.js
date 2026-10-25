// ========================================
// 🌱 농사 가이드 백엔드 서버
// ========================================

// 모듈 불러오기
const express = require("express");
// const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

// ========================================
// 🌱 데이터베이스 관리 모듈
// ========================================

const db = require("./db/database");

const { initializeDatabase } = require("./db/init");

// ========================================
// 🌱 농장 API 라우터
// ========================================

const createFarmRouter = require("./routes/farm.routes");

// ========================================
// 📖 재배 일지 API
// ========================================

const createDiaryRouter = require("./routes/diary.routes");

// ========================================
// 🌱 팜맵 API 라우터
// ========================================

const farmmapRouter = require("./routes/farmmap.routes");

// ========================================
// 📸 재배 일지 사진 API
// ========================================

const createDiaryPhotoRouter = require("./routes/diary-photo.routes");

// ========================================
// 📸 고아 사진 자동 탐지
// ========================================

const scanOrphanPhotos = require("./services/storage/photo-orphan-scanner");

require("dotenv").config();

// ========================================
// 1. 서버 기본 설정
// ========================================

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ========================================
// 🌱 JSON 응답 보기 좋게 정렬
// 개발 환경에서만 적용
// ========================================

if (process.env.NODE_ENV !== "production") {
  app.set("json spaces", 2);
}

// ========================================
// JSON 데이터 처리
// ========================================

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
// 🌱 팜맵 API 라우터 등록
// ========================================

app.use("/api/farmmap", farmmapRouter);

// ========================================
// 4. 데이터베이스 초기화
// ========================================

initializeDatabase(db);

// ========================================
// 🌱 농장 API 라우터 연결
// ========================================

app.use("/api/farms", createFarmRouter(db));

// ========================================
// 📖 재배 일지 API 라우터 연결
// ========================================

app.use("/api/farms", createDiaryRouter(db));

// ========================================
// 📸 재배 일지 사진 API
// ========================================

app.use("/api/farms", createDiaryPhotoRouter(db));

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

  // ========================================
  // 📸 서버 시작 시 고아 사진 자동 탐지
  //
  // 1. 실제 저장소 사진 검사
  // 2. DB에 등록된 사진 보호
  // 3. 최근 24시간 사진 보호
  // 4. 고아 사진 정리 작업 등록
  //
  // 주의!
  // 이 단계에서는 실제 파일을 삭제하지 않는다.
  // ========================================

  console.log("📸 서버 시작 고아 사진 검사 요청");

  scanOrphanPhotos(db)
    .then((result) => {
      console.log("==============================");
      console.log("📸 서버 시작 고아 사진 검사 완료");

      console.log("검사한 사진:", result.scanned);

      console.log("DB 등록 사진:", result.referenced);

      console.log("최근 사진:", result.recent);

      console.log("신규 정리 작업:", result.queued);

      console.log("기존 정리 작업:", result.alreadyQueued);

      console.log("==============================");
    })
    .catch((error) => {
      // ========================================
      // 고아 사진 검사 실패
      //
      // 사진 검사 실패가 서버 전체 장애로
      // 이어지지 않도록 별도 처리한다.
      // ========================================

      console.error("📸 서버 시작 고아 사진 검사 실패:", error);
    });
});

// ========================================
// 🌱 서버 실행 오류 처리
// ========================================

server.on("error", (error) => {
  console.error("서버 실행 오류:", error.message);
});
