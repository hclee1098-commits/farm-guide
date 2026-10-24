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
// 🌱 팜맵 API 라우터
// ========================================

const farmmapRouter = require("./routes/farmmap.routes");

// ========================================
// 📸 재배 일지 사진 업로드
// 여러 장 첨부 지원
// ========================================

const multer = require("multer");

const diaryPhotoUpload = multer({
  // ========================================
  // 업로드 파일 메모리 임시 저장
  // ========================================

  storage: multer.memoryStorage(),

  // ========================================
  // 업로드 제한
  // ========================================

  limits: {
    // 사진 한 장당 최대 3MB
    fileSize: 3 * 1024 * 1024,

    // 한 번에 최대 10장
    files: 10,
  },
});

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
    // 📖 재배 일지 조회
    // 사진 첨부 여부 포함
    // ========================================

    const diaries = db
      .prepare(
        `
    SELECT
      d.*,

      EXISTS (
        SELECT 1
        FROM diary_photos p
        WHERE p.diary_id = d.id
      ) AS has_photo

    FROM farm_diaries d

    WHERE d.farm_id = ?

    ORDER BY d.work_date DESC, d.id DESC
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
      // 현재 단계에서는 기존 사진 교체 방식 유지
      // ========================================

      // ========================================
      // 기존 사진 조회
      // ========================================

      const existingPhoto = db
        .prepare(
          `
    SELECT id
    FROM diary_photos
    WHERE diary_id = ?
    ORDER BY id DESC
    LIMIT 1
    `,
        )
        .get(diaryId);

      // ========================================
      // 기존 사진이 있으면 교체
      // ========================================

      if (existingPhoto) {
        db.prepare(
          `
    UPDATE diary_photos

    SET
      mime_type = ?,
      image_data = ?

    WHERE id = ?
    `,
        ).run(mimeType, imageData, existingPhoto.id);

        console.log("📸 기존 사진 교체 완료:", diaryId);
      } else {
        // ========================================
        // 기존 사진이 없으면 새로 저장
        // ========================================

        db.prepare(
          `
    INSERT INTO diary_photos (
      diary_id,
      mime_type,
      image_data
    )

    VALUES (?, ?, ?)
    `,
        ).run(diaryId, mimeType, imageData);

        console.log("📸 새로운 사진 저장 완료:", diaryId);
      }

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
// 📸 재배 일지 사진 여러 장 저장 API
// ========================================

app.post("/api/farms/:id/diaries/:diaryId/photos", (req, res) => {
  // ========================================
  // 1. 사진 여러 장 업로드 처리
  // ========================================

  diaryPhotoUpload.array("photos", 10)(req, res, (uploadError) => {
    // ========================================
    // 업로드 오류 확인
    // ========================================

    if (uploadError) {
      return res.status(400).json({
        success: false,
        message:
          "사진 업로드에 실패했습니다. " +
          "사진은 최대 10장, 한 장당 3MB까지 가능합니다.",
      });
    }

    let transactionStarted = false;

    try {
      // ========================================
      // 2. 농장 및 재배 일지 ID 확인
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
      // 3. 업로드된 사진 확인
      // ========================================

      const files = req.files || [];

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "등록할 사진을 선택해주세요.",
        });
      }

      // ========================================
      // 4. 해당 농장의 재배 일지 확인
      // ========================================

      const diary = db
        .prepare(
          `
            SELECT id
            FROM farm_diaries

            WHERE id = ?
              AND farm_id = ?
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
      // 5. 사진 형식 검사
      // ========================================

      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

      for (const file of files) {
        const mimeType = file.mimetype;

        const imageData = file.buffer;

        // ========================================
        // MIME 형식 검사
        // ========================================

        if (!allowedTypes.includes(mimeType)) {
          return res.status(400).json({
            success: false,
            message: "JPG, PNG, WebP 사진만 등록할 수 있습니다.",
          });
        }

        // ========================================
        // 실제 파일 내용 검사
        // ========================================

        const isJpeg =
          mimeType === "image/jpeg" &&
          imageData.length >= 3 &&
          imageData[0] === 0xff &&
          imageData[1] === 0xd8 &&
          imageData[2] === 0xff;

        const isPng =
          mimeType === "image/png" &&
          imageData.length >= 8 &&
          imageData
            .subarray(0, 8)
            .equals(Buffer.from("89504e470d0a1a0a", "hex"));

        const isWebp =
          mimeType === "image/webp" &&
          imageData.length >= 12 &&
          imageData.toString("ascii", 0, 4) === "RIFF" &&
          imageData.toString("ascii", 8, 12) === "WEBP";

        if (!isJpeg && !isPng && !isWebp) {
          return res.status(400).json({
            success: false,
            message: "올바른 이미지 파일이 아닙니다.",
          });
        }
      }

      // ========================================
      // 6. 데이터베이스 트랜잭션 시작
      // ========================================

      db.exec("BEGIN IMMEDIATE");

      transactionStarted = true;

      // ========================================
      // 7. 기존 사진 개수 확인
      // ========================================

      const photoCount = db
        .prepare(
          `
            SELECT COUNT(*) AS count

            FROM diary_photos

            WHERE diary_id = ?
            `,
        )
        .get(diaryId);

      const existingCount = Number(photoCount.count);

      // ========================================
      // 8. 최대 10장 제한
      // ========================================

      if (existingCount + files.length > 10) {
        db.exec("ROLLBACK");

        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message:
            `현재 ${existingCount}장의 사진이 등록되어 있습니다. ` +
            "재배 일지 하나에는 최대 10장까지 등록할 수 있습니다.",
        });
      }

      // ========================================
      // 9. 사진 저장 SQL 준비
      // ========================================

      const insertPhoto = db.prepare(
        `
          INSERT INTO diary_photos (
            diary_id,
            mime_type,
            image_data
          )

          VALUES (?, ?, ?)
          `,
      );

      // ========================================
      // 10. 사진 여러 장 저장
      // ========================================

      const savedPhotoIds = [];

      for (const file of files) {
        const result = insertPhoto.run(diaryId, file.mimetype, file.buffer);

        savedPhotoIds.push(Number(result.lastInsertRowid));
      }

      // ========================================
      // 11. 트랜잭션 완료
      // ========================================

      db.exec("COMMIT");

      transactionStarted = false;

      console.log(
        "📸 재배 일지 사진 여러 장 저장 완료:",
        diaryId,
        savedPhotoIds.length,
      );

      // ========================================
      // 12. 저장 결과 반환
      // ========================================

      return res.status(201).json({
        success: true,

        message: `${savedPhotoIds.length}장의 사진이 저장되었습니다.`,

        diaryId,

        uploadedCount: savedPhotoIds.length,

        photoIds: savedPhotoIds,
      });
    } catch (error) {
      // ========================================
      // 저장 중 오류 발생 시 복구
      // ========================================

      if (transactionStarted) {
        try {
          db.exec("ROLLBACK");
        } catch (rollbackError) {
          console.error("사진 저장 복구 오류:", rollbackError);
        }
      }

      console.error("📸 사진 여러 장 저장 오류:", error);

      return res.status(500).json({
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
    // 📸 재배 일지 사진 조회
    // 가장 최근 사진 한 장 표시
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

    ORDER BY p.id DESC

    LIMIT 1
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
// 📸 재배 일지 사진 여러 장 목록 조회 API
// ========================================

app.get("/api/farms/:id/diaries/:diaryId/photos", (req, res) => {
  try {
    // ========================================
    // 1. 농장 ID 및 재배 일지 ID 확인
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
    // 2. 해당 농장의 재배 일지인지 확인
    // ========================================

    const diary = db
      .prepare(
        `
        SELECT id

        FROM farm_diaries

        WHERE id = ?
          AND farm_id = ?
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
    // 3. 사진 목록 조회
    // ========================================

    const photos = db
      .prepare(
        `
        SELECT
          id,
          mime_type,
          created_at

        FROM diary_photos

        WHERE diary_id = ?

        ORDER BY id DESC
        `,
      )
      .all(diaryId);

    // ========================================
    // 4. 조회 결과 로그
    // ========================================

    console.log("📸 재배 일지 사진 목록 조회 완료:", diaryId, photos.length);

    // ========================================
    // 5. 사진 목록 반환
    // ========================================

    return res.json({
      success: true,

      diaryId,

      count: photos.length,

      photos,
    });
  } catch (error) {
    // ========================================
    // 6. 오류 처리
    // ========================================

    console.error("📸 사진 목록 조회 오류:", error);

    return res.status(500).json({
      success: false,
      message: "사진 목록을 불러오지 못했습니다.",
    });
  }
});

// ========================================
// 📸 재배 일지 사진 개별 조회 API
// ========================================

app.get("/api/farms/:id/diaries/:diaryId/photos/:photoId", (req, res) => {
  try {
    // ========================================
    // 1. 농장 / 재배 일지 / 사진 ID 확인
    // ========================================

    const farmId = Number(req.params.id);

    const diaryId = Number(req.params.diaryId);

    const photoId = Number(req.params.photoId);

    if (
      !Number.isSafeInteger(farmId) ||
      farmId <= 0 ||
      !Number.isSafeInteger(diaryId) ||
      diaryId <= 0 ||
      !Number.isSafeInteger(photoId) ||
      photoId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장, 재배 일지 또는 사진 ID가 아닙니다.",
      });
    }

    // ========================================
    // 2. 사진 조회
    // 해당 농장의 재배 일지에 속한 사진만 조회
    // ========================================

    const photo = db
      .prepare(
        `
        SELECT
          p.id,
          p.mime_type,
          p.image_data

        FROM diary_photos p

        JOIN farm_diaries d
          ON p.diary_id = d.id

        WHERE p.id = ?
          AND p.diary_id = ?
          AND d.farm_id = ?
        `,
      )
      .get(photoId, diaryId, farmId);

    // ========================================
    // 3. 사진 존재 여부 확인
    // ========================================

    if (!photo) {
      return res.status(404).json({
        success: false,
        message: "해당 사진을 찾을 수 없습니다.",
      });
    }

    // ========================================
    // 4. 이미지 응답 설정
    // ========================================

    res.set("Cache-Control", "no-store");

    res.set("X-Content-Type-Options", "nosniff");

    res.type(photo.mime_type);

    // ========================================
    // 5. 이미지 반환
    // ========================================

    return res.send(Buffer.from(photo.image_data));
  } catch (error) {
    console.error("📸 재배 일지 사진 개별 조회 오류:", error);

    return res.status(500).json({
      success: false,
      message: "사진을 불러오지 못했습니다.",
    });
  }
});

// ========================================
// 🗑 재배 일지 사진 개별 삭제 API
// ========================================

app.delete("/api/farms/:id/diaries/:diaryId/photos/:photoId", (req, res) => {
  try {
    // ========================================
    // 1. 농장 / 재배 일지 / 사진 ID 확인
    // ========================================

    const farmId = Number(req.params.id);

    const diaryId = Number(req.params.diaryId);

    const photoId = Number(req.params.photoId);

    if (
      !Number.isSafeInteger(farmId) ||
      farmId <= 0 ||
      !Number.isSafeInteger(diaryId) ||
      diaryId <= 0 ||
      !Number.isSafeInteger(photoId) ||
      photoId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "올바른 농장, 재배 일지 또는 사진 ID가 아닙니다.",
      });
    }

    // ========================================
    // 2. 해당 농장에 속한 사진인지 확인
    // ========================================

    const photo = db
      .prepare(
        `
        SELECT p.id

        FROM diary_photos p

        JOIN farm_diaries d
          ON p.diary_id = d.id

        WHERE p.id = ?
          AND p.diary_id = ?
          AND d.farm_id = ?
        `,
      )
      .get(photoId, diaryId, farmId);

    if (!photo) {
      return res.status(404).json({
        success: false,
        message: "삭제할 사진을 찾을 수 없습니다.",
      });
    }

    // ========================================
    // 3. 해당 사진 한 장만 삭제
    // ========================================

    const result = db
      .prepare(
        `
        DELETE FROM diary_photos

        WHERE id = ?
          AND diary_id = ?
        `,
      )
      .run(photoId, diaryId);

    // ========================================
    // 4. 삭제 결과 확인
    // ========================================

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제할 사진이 없습니다.",
      });
    }

    // ========================================
    // 5. 삭제 완료
    // ========================================

    console.log("🗑 재배 일지 사진 개별 삭제 완료:", photoId);

    return res.json({
      success: true,
      message: "사진이 삭제되었습니다.",
      deletedPhotoId: photoId,
    });
  } catch (error) {
    console.error("🗑 재배 일지 사진 개별 삭제 오류:", error);

    return res.status(500).json({
      success: false,
      message: "사진을 삭제하지 못했습니다.",
    });
  }
});

// ========================================
// 🗑 재배 일지 사진 삭제 API
// ========================================

app.delete("/api/farms/:id/diaries/:diaryId/photo", (req, res) => {
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
        message: "올바른 농장 또는 일지 ID가 아닙니다.",
      });
    }

    // ========================================
    // 2. 해당 농장의 재배 일지인지 확인
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
    // 3. SQLite 사진 삭제
    // ========================================

    const result = db
      .prepare(
        `
        DELETE FROM diary_photos
        WHERE diary_id = ?
        `,
      )
      .run(diaryId);

    // ========================================
    // 4. 삭제 결과 확인
    // ========================================

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제할 사진이 없습니다.",
      });
    }

    // ========================================
    // 5. 삭제 완료
    // ========================================

    console.log("🗑 재배 일지 사진 삭제 완료:", diaryId);

    res.json({
      success: true,
      message: "사진이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("재배 일지 사진 삭제 오류:", error);

    res.status(500).json({
      success: false,
      message: "사진을 삭제하지 못했습니다.",
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
