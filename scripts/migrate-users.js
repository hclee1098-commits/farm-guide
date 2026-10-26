// ========================================
// FARM GUIDE - 사용자 소유권 마이그레이션
// ========================================
//
// 목적:
// 1. users 테이블 생성
// 2. 기존 관리자 계정 생성
// 3. farms 테이블에 owner_user_id 추가
// 4. 기존 농장을 관리자 계정에 연결
// 5. 기존 농장/일지/사진 데이터 보존
//
// 주의:
// 서버 종료 후 실행
// 기존 DB 백업 필수
// ========================================

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// ========================================
// 1. 경로 설정
// ========================================

const ROOT = path.resolve(__dirname, "..");

const DB_PATH = path.join(ROOT, "farm-guide.db");

const BACKUP_ROOT = path.join(ROOT, "backup");

const MIGRATION_NAME = "001_farm_ownership";

// ========================================
// 2. DB 및 백업 확인
// ========================================

if (!fs.existsSync(DB_PATH)) {
  throw new Error("기존 farm-guide.db 파일이 없습니다.");
}

if (!fs.existsSync(BACKUP_ROOT)) {
  throw new Error("백업 폴더가 없습니다.");
}

const backupDirs = fs
  .readdirSync(BACKUP_ROOT, { withFileTypes: true })
  .filter((item) => item.isDirectory() && item.name.startsWith("pre-auth-"))
  .map((item) => path.join(BACKUP_ROOT, item.name))
  .sort()
  .reverse();

const sourcePhotos = path.join(ROOT, "storage", "photos");

const validBackup = backupDirs.find((dir) => {
  const backupDb = path.join(dir, "farm-guide.db");

  if (!fs.existsSync(backupDb)) {
    return false;
  }

  if (fs.statSync(backupDb).size === 0) {
    return false;
  }

  if (fs.existsSync(sourcePhotos) && !fs.existsSync(path.join(dir, "photos"))) {
    return false;
  }

  return true;
});

if (!validBackup) {
  throw new Error("유효한 사전 백업을 찾지 못했습니다. 작업을 중단합니다.");
}

console.log("백업 확인:", validBackup);

// ========================================
// 3. DB 연결
// ========================================

const db = new DatabaseSync(DB_PATH);

let transactionStarted = false;

try {
  db.exec("PRAGMA foreign_keys = ON");

  // ========================================
  // 4. 트랜잭션 시작
  // ========================================

  db.exec("BEGIN IMMEDIATE");

  transactionStarted = true;

  // ========================================
  // 5. 마이그레이션 기록 테이블
  // ========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ========================================
  // 6. 사용자 테이블 생성
  // ========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      internal_key TEXT NOT NULL UNIQUE,

      display_name TEXT NOT NULL,

      role TEXT NOT NULL DEFAULT 'user'
        CHECK (role IN ('admin', 'user')),

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ========================================
  // 7. 기존 마이그레이션 확인
  // ========================================

  const alreadyMigrated = db
    .prepare(
      `
    SELECT name
    FROM schema_migrations
    WHERE name = ?
  `,
    )
    .get(MIGRATION_NAME);

  // ========================================
  // 8. 농장 소유권 컬럼 확인
  // ========================================

  const farmColumns = db.prepare("PRAGMA table_info(farms)").all();

  const hasOwnerColumn = farmColumns.some(
    (column) => column.name === "owner_user_id",
  );

  if (!hasOwnerColumn) {
    if (alreadyMigrated) {
      throw new Error(
        "마이그레이션 기록과 농장 테이블 구조가 일치하지 않습니다.",
      );
    }

    db.exec(`
      ALTER TABLE farms
      ADD COLUMN owner_user_id INTEGER
      REFERENCES users(id)
    `);

    console.log("농장 소유권 컬럼 생성 완료");
  }

  // ========================================
  // 9. 소유권 조회 인덱스
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_farms_owner_user_id
    ON farms(owner_user_id)
  `);

  // ========================================
  // 10. 최초 관리자 및 기존 농장 연결
  // ========================================

  if (!alreadyMigrated) {
    db.prepare(
      `
      INSERT OR IGNORE INTO users (
        internal_key,
        display_name,
        role
      )
      VALUES (?, ?, ?)
    `,
    ).run("legacy-admin", "기존 농장 관리자", "admin");

    const admin = db
      .prepare(
        `
      SELECT id, role
      FROM users
      WHERE internal_key = ?
    `,
      )
      .get("legacy-admin");

    if (!admin || admin.role !== "admin") {
      throw new Error("관리자 계정 생성에 실패했습니다.");
    }

    const result = db
      .prepare(
        `
      UPDATE farms
      SET owner_user_id = ?
      WHERE owner_user_id IS NULL
    `,
      )
      .run(admin.id);

    db.prepare(
      `
      INSERT INTO schema_migrations (name)
      VALUES (?)
    `,
    ).run(MIGRATION_NAME);

    console.log("관리자 ID:", admin.id);
    console.log("관리자에게 연결된 농장:", result.changes);
  } else {
    console.log("이미 완료된 마이그레이션입니다.");
  }

  // ========================================
  // 11. 데이터 무결성 검사
  // ========================================

  const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all();

  if (foreignKeyErrors.length > 0) {
    throw new Error("외래키 무결성 검사 실패");
  }

  const integrity = db.prepare("PRAGMA integrity_check").get();

  if (integrity.integrity_check !== "ok") {
    throw new Error("데이터베이스 무결성 검사 실패");
  }

  // ========================================
  // 12. 변경 확정
  // ========================================

  db.exec("COMMIT");

  transactionStarted = false;

  const result = db
    .prepare(
      `
    SELECT
      COUNT(*) AS total,
      COUNT(owner_user_id) AS assigned
    FROM farms
  `,
    )
    .get();

  console.log("==============================");
  console.log("사용자 소유권 마이그레이션 완료");
  console.log("전체 농장:", result.total);
  console.log("소유자 연결 농장:", result.assigned);
  console.log("DB 무결성 검사: 정상");
  console.log("==============================");
} catch (error) {
  // ========================================
  // 실패 시 전체 롤백
  // ========================================

  if (transactionStarted) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackError) {
      console.error("롤백 실패:", rollbackError);
    }
  }

  console.error("마이그레이션 실패:", error);

  process.exitCode = 1;
} finally {
  db.close();
}
