// ========================================
// 🌱 농사 가이드
// 📸 재배 일지 사진 저장 구조 마이그레이션
// ========================================

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

// ========================================
// 1. 데이터베이스 경로
// ========================================

const dbPath = path.join(__dirname, "..", "farm-guide.db");

// 잘못된 경로에 빈 DB가 생성되는 것 방지
if (!fs.existsSync(dbPath)) {
  throw new Error(`데이터베이스 파일을 찾을 수 없습니다: ${dbPath}`);
}

// ========================================
// 2. 데이터베이스 연결
// ========================================

const db = new DatabaseSync(dbPath);

db.exec("PRAGMA foreign_keys = ON");

// ========================================
// 3. 마이그레이션 실행
// ========================================

function migrateDiaryPhotoStorage() {
  console.log("==============================");
  console.log("📸 사진 저장 구조 변경 시작");
  console.log("==============================");

  // ========================================
  // 기존 테이블 확인
  // ========================================

  const table = db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'diary_photos'
      `,
    )
    .get();

  if (!table) {
    throw new Error("diary_photos 테이블을 찾을 수 없습니다.");
  }

  // ========================================
  // 기존 컬럼 확인
  // ========================================

  const columns = db.prepare("PRAGMA table_info(diary_photos)").all();

  const columnNames = new Set(columns.map((column) => column.name));

  const hasColumn = (name) => columnNames.has(name);

  // ========================================
  // 필수 컬럼 확인
  // ========================================

  const requiredColumns = [
    "id",
    "diary_id",
    "mime_type",
    "image_data",
    "created_at",
  ];

  for (const column of requiredColumns) {
    if (!hasColumn(column)) {
      throw new Error(`기존 사진 테이블에 ${column} 컬럼이 없습니다.`);
    }
  }

  // ========================================
  // 기존 사진 개수 확인
  // ========================================

  const beforeCount = db
    .prepare("SELECT COUNT(*) AS count FROM diary_photos")
    .get().count;

  console.log("📸 기존 사진 개수:", beforeCount);

  // ========================================
  // 새로운 컬럼 목록
  // ========================================

  const newColumns = [
    "storage_provider",
    "storage_key",
    "file_size",
    "is_deleted",
    "deleted_at",
  ];

  // ========================================
  // 기존 BLOB 제약 확인
  // ========================================

  const imageColumn = columns.find((column) => column.name === "image_data");

  const imageDataNotNull = imageColumn.notnull === 1;

  // ========================================
  // 구조 변경 필요 여부
  // ========================================

  const needsMigration =
    imageDataNotNull || newColumns.some((column) => !hasColumn(column));

  // ========================================
  // 알 수 없는 인덱스 및 트리거 확인
  // ========================================

  // 테이블을 재구성하면 기존 인덱스와
  // 트리거도 제거되므로 예상하지 못한
  // 구조가 있으면 작업을 중단한다.

  if (needsMigration) {
    const indexes = db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'index'
          AND tbl_name = 'diary_photos'
          AND name NOT LIKE 'sqlite_autoindex%'
        `,
      )
      .all();

    const knownIndexes = new Set([
      "idx_diary_photos_diary_id",
      "idx_diary_photos_active",
      "idx_diary_photos_storage_key",
    ]);

    const unknownIndexes = indexes.filter(
      (index) => !knownIndexes.has(index.name),
    );

    if (unknownIndexes.length > 0) {
      throw new Error("확인되지 않은 사진 테이블 인덱스가 있습니다.");
    }

    const triggers = db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'trigger'
          AND tbl_name = 'diary_photos'
        `,
      )
      .all();

    if (triggers.length > 0) {
      throw new Error("사진 테이블에 트리거가 있어 자동 변경을 중단합니다.");
    }
  }

  // ========================================
  // 마이그레이션 트랜잭션
  // ========================================

  let transactionStarted = false;

  try {
    db.exec("BEGIN IMMEDIATE");

    transactionStarted = true;

    if (needsMigration) {
      console.log("📸 사진 테이블 구조 변경 중...");

      // ========================================
      // 기존 컬럼 데이터 유지
      // ========================================

      const existingValue = (column, fallback) =>
        hasColumn(column) ? column : fallback;

      // ========================================
      // 1. 새로운 테이블 생성
      // ========================================

      db.exec(`
        CREATE TABLE diary_photos_new (

          id INTEGER PRIMARY KEY AUTOINCREMENT,

          diary_id INTEGER NOT NULL,

          mime_type TEXT NOT NULL,

          image_data BLOB,

          storage_provider TEXT,

          storage_key TEXT,

          file_size INTEGER,

          is_deleted INTEGER NOT NULL DEFAULT 0
            CHECK (is_deleted IN (0, 1)),

          deleted_at TEXT,

          created_at TEXT DEFAULT CURRENT_TIMESTAMP,

          FOREIGN KEY (diary_id)
            REFERENCES farm_diaries(id)
            ON DELETE CASCADE,

          CHECK (
            image_data IS NOT NULL
            OR (
              storage_provider IS NOT NULL
              AND storage_key IS NOT NULL
              AND file_size IS NOT NULL
            )
          )
        )
      `);

      // ========================================
      // 2. 기존 사진 데이터 복사
      // ========================================

      const storageProvider = existingValue("storage_provider", "NULL");

      const storageKey = existingValue("storage_key", "NULL");

      const fileSize = hasColumn("file_size")
        ? "COALESCE(file_size, LENGTH(image_data))"
        : "LENGTH(image_data)";

      const isDeleted = existingValue("is_deleted", "0");

      const deletedAt = existingValue("deleted_at", "NULL");

      db.exec(`
        INSERT INTO diary_photos_new (

          id,
          diary_id,
          mime_type,
          image_data,
          storage_provider,
          storage_key,
          file_size,
          is_deleted,
          deleted_at,
          created_at

        )

        SELECT

          id,
          diary_id,
          mime_type,
          image_data,
          ${storageProvider},
          ${storageKey},
          ${fileSize},
          ${isDeleted},
          ${deletedAt},
          created_at

        FROM diary_photos
      `);

      // ========================================
      // 3. 기존 테이블 제거
      // ========================================

      db.exec("DROP TABLE diary_photos");

      // ========================================
      // 4. 새로운 테이블 이름 변경
      // ========================================

      db.exec(`
        ALTER TABLE diary_photos_new
        RENAME TO diary_photos
      `);

      console.log("📸 사진 테이블 구조 변경 완료");
    } else {
      console.log("📸 사진 테이블 구조 변경 불필요");
    }

    // ========================================
    // 5. 사진 조회 인덱스
    // ========================================

    db.exec(`
      CREATE INDEX IF NOT EXISTS
        idx_diary_photos_diary_id

      ON diary_photos(diary_id, id DESC)
    `);

    // ========================================
    // 6. 삭제되지 않은 사진 조회 인덱스
    // ========================================

    db.exec(`
      CREATE INDEX IF NOT EXISTS
        idx_diary_photos_active

      ON diary_photos(diary_id, id DESC)

      WHERE is_deleted = 0
    `);

    // ========================================
    // 7. 사진 저장 위치 중복 방지
    // ========================================

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        idx_diary_photos_storage_key

      ON diary_photos(
        storage_provider,
        storage_key
      )

      WHERE storage_key IS NOT NULL
    `);

    // ========================================
    // 8. 사진 개수 검증
    // ========================================

    const afterCount = db
      .prepare("SELECT COUNT(*) AS count FROM diary_photos")
      .get().count;

    if (beforeCount !== afterCount) {
      throw new Error("마이그레이션 전후 사진 개수가 일치하지 않습니다.");
    }

    // ========================================
    // 9. 외래 키 무결성 검사
    // ========================================

    const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyErrors.length > 0) {
      throw new Error("데이터베이스 외래 키 무결성 검사 실패");
    }

    // ========================================
    // 10. 변경 완료
    // ========================================

    db.exec("COMMIT");

    transactionStarted = false;

    console.log("==============================");
    console.log("✅ 사진 저장 구조 변경 성공");
    console.log("📸 사진 개수:", afterCount);
    console.log("==============================");
  } catch (error) {
    // ========================================
    // 오류 발생 시 롤백
    // ========================================

    if (transactionStarted) {
      db.exec("ROLLBACK");
    }

    throw error;
  }
}

// ========================================
// 4. 실행
// ========================================

try {
  migrateDiaryPhotoStorage();
} catch (error) {
  console.error("❌ 사진 저장 구조 변경 실패:", error);

  process.exitCode = 1;
} finally {
  db.close();
}
