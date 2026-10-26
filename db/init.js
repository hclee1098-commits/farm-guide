// ========================================
// 🌱 농사 가이드 데이터베이스 초기화
// ========================================

// ========================================
// 1. 데이터베이스 초기화 함수
// ========================================

function initializeDatabase(db) {
  console.log("==============================");
  console.log("🌱 데이터베이스 구조 확인 시작");
  console.log("==============================");

  // ========================================
  // 2. 농장 테이블 생성
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

  console.log("🌱 농장 테이블 확인 완료!");

  // ========================================
  // 3. 기존 농장 테이블 컬럼 확인
  // ========================================

  // ========================================
  // 사용자 계정 테이블 초기화
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

  console.log("사용자 테이블 확인 완료!");

  // ========================================
  // 사용자 로그인 정보 테이블
  // ========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_credentials (

      user_id INTEGER PRIMARY KEY,

      username TEXT NOT NULL
        COLLATE NOCASE UNIQUE,

      password_hash TEXT NOT NULL,

      password_salt TEXT NOT NULL,

      created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  console.log("사용자 로그인 정보 테이블 확인 완료!");

  // ========================================
  // 로그인 세션 테이블
  // ========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (

      token_hash TEXT PRIMARY KEY,

      user_id INTEGER NOT NULL,

      expires_at INTEGER NOT NULL,

      created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  console.log("로그인 세션 테이블 확인 완료!");

  // ========================================
  // 로그인 세션 조회 인덱스
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON auth_sessions(user_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
    ON auth_sessions(expires_at)
  `);

  console.log("로그인 세션 인덱스 확인 완료!");


  // ========================================
  // 농장 소유권 컬럼 초기화
  // ========================================

  const ownershipColumns = db
    .prepare("PRAGMA table_info(farms)")
    .all();

  const hasOwnerColumn = ownershipColumns.some(
    (column) => column.name === "owner_user_id"
  );

  if (!hasOwnerColumn) {
    db.exec(`
      ALTER TABLE farms
      ADD COLUMN owner_user_id INTEGER
      REFERENCES users(id)
    `);

    console.log("농장 소유권 컬럼 추가 완료!");
  }

  // ========================================
  // 농장 소유권 조회 인덱스
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_farms_owner_user_id
    ON farms(owner_user_id)
  `);

  console.log("농장 소유권 인덱스 확인 완료!");
  const columns = db.prepare("PRAGMA table_info(farms)").all();

  const columnNames = columns.map((column) => column.name);

  // ========================================
  // 4. 농지 주소 컬럼 추가
  // ========================================

  if (!columnNames.includes("address")) {
    db.exec(`
      ALTER TABLE farms
      ADD COLUMN address TEXT
    `);

    console.log("농지 주소 컬럼 추가 완료!");
  }

  // ========================================
  // 5. PNU 컬럼 추가
  // ========================================

  if (!columnNames.includes("pnu")) {
    db.exec(`
      ALTER TABLE farms
      ADD COLUMN pnu TEXT
    `);

    console.log("PNU 컬럼 추가 완료!");
  }

  // ========================================
  // 6. 팜맵 농지 UID 컬럼 추가
  // ========================================

  if (!columnNames.includes("farm_uid")) {
    db.exec(`
      ALTER TABLE farms
      ADD COLUMN farm_uid TEXT
    `);

    console.log("농지 UID 컬럼 추가 완료!");
  }

  // ========================================
  // 🌱 농장 소프트 삭제 컬럼 추가
  // ========================================

  if (!columnNames.includes("is_deleted")) {
    db.exec(`
      ALTER TABLE farms
      ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0
      CHECK (is_deleted IN (0, 1))
    `);

    console.log("🌱 농장 삭제 상태 컬럼 추가 완료!");
  }

  // ========================================
  // 🌱 농장 삭제 일시 컬럼 추가
  // ========================================

  if (!columnNames.includes("deleted_at")) {
    db.exec(`
      ALTER TABLE farms
      ADD COLUMN deleted_at TEXT
    `);

    console.log("🌱 농장 삭제 일시 컬럼 추가 완료!");
  }

  console.log("🌱 농장 테이블 구조 확인 완료!");

  // ========================================
  // 🌱 활성 농지 UID 중복 등록 방지
  // ========================================

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS
      idx_farms_active_uid_unique

    ON farms (
      TRIM(farm_uid)
    )

    WHERE is_deleted = 0
      AND farm_uid IS NOT NULL
      AND TRIM(farm_uid) <> ''
  `);

  console.log("🌱 활성 농지 UID 중복 방지 인덱스 확인 완료!");

  // ========================================
  // 7. 재배 일지 테이블 생성
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

  console.log("🌱 재배 일지 테이블 확인 완료!");

  // ========================================
  // 📖 재배 일지 테이블 컬럼 확인
  // ========================================

  const diaryColumns = db.prepare("PRAGMA table_info(farm_diaries)").all();

  const diaryColumnNames = new Set(diaryColumns.map((column) => column.name));

  // ========================================
  // 📖 재배 일지 소프트 삭제 컬럼 추가
  // ========================================

  if (!diaryColumnNames.has("is_deleted")) {
    db.exec(`
      ALTER TABLE farm_diaries
      ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0
      CHECK (is_deleted IN (0, 1))
    `);

    console.log("📖 재배 일지 삭제 상태 컬럼 추가 완료!");
  }

  // ========================================
  // 📖 재배 일지 삭제 일시 컬럼 추가
  // ========================================

  if (!diaryColumnNames.has("deleted_at")) {
    db.exec(`
      ALTER TABLE farm_diaries
      ADD COLUMN deleted_at TEXT
    `);

    console.log("📖 재배 일지 삭제 일시 컬럼 추가 완료!");
  }

  // ========================================
  // 8. 재배 일지 사진 테이블 생성
  // 로컬 파일 저장 및 삭제 상태 관리 지원
  // ========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS diary_photos (

      id INTEGER PRIMARY KEY AUTOINCREMENT,

      diary_id INTEGER NOT NULL,

      mime_type TEXT NOT NULL,

      image_data BLOB,

      storage_provider TEXT,

      storage_key TEXT,

      file_size INTEGER,

      content_hash TEXT,

      is_deleted INTEGER NOT NULL DEFAULT 0
        CHECK (is_deleted IN (0, 1)),

      deleted_at TEXT,

      created_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (diary_id)
        REFERENCES farm_diaries(id)
        ON DELETE CASCADE,

      CHECK (
        image_data IS NOT NULL
        OR storage_key IS NOT NULL
      )
    )
  `);

  console.log("📸 재배 일지 사진 테이블 확인 완료!");

  // ========================================
  // 9. 기존 사진 테이블 컬럼 확인
  // ========================================

  const photoColumns = db.prepare("PRAGMA table_info(diary_photos)").all();

  const photoColumnNames = new Set(photoColumns.map((column) => column.name));

  // ========================================
  // 10. 기존 UNIQUE 제약 조건 확인
  // diary_id에 UNIQUE가 있으면 여러 장 등록 불가
  // ========================================

  const photoIndexes = db.prepare("PRAGMA index_list('diary_photos')").all();

  const hasUniqueDiaryId = photoIndexes.some((index) => {
    if (index.unique !== 1) {
      return false;
    }

    const safeIndexName = index.name.replaceAll("'", "''");

    const indexColumns = db
      .prepare(`PRAGMA index_info('${safeIndexName}')`)
      .all();

    return indexColumns.length === 1 && indexColumns[0].name === "diary_id";
  });

  // ========================================
  // 11. 기존 BLOB NOT NULL 제약 조건 확인
  // ========================================

  const imageDataColumn = photoColumns.find(
    (column) => column.name === "image_data",
  );

  const hasRequiredBlob = imageDataColumn?.notnull === 1;

  // ========================================
  // 12. 사진 테이블 변경 필요 여부
  // ========================================

  const requiredPhotoColumns = [
    "storage_provider",
    "storage_key",
    "file_size",
    "is_deleted",
    "deleted_at",
  ];

  const hasMissingColumns = requiredPhotoColumns.some(
    (columnName) => !photoColumnNames.has(columnName),
  );

  const needsPhotoMigration =
    hasUniqueDiaryId || hasRequiredBlob || hasMissingColumns;

  // ========================================
  // 13. 기존 사진 테이블 마이그레이션
  // ========================================

  if (needsPhotoMigration) {
    console.log("📸 사진 테이블 구조 변경 시작...");

    let transactionStarted = false;

    try {
      // ========================================
      // 기존 컬럼에 따라 복사할 값 결정
      // ========================================

      function oldColumn(name, fallback) {
        return photoColumnNames.has(name) ? name : fallback;
      }

      const oldImageData = oldColumn("image_data", "NULL");

      const oldStorageProvider = oldColumn("storage_provider", "NULL");

      const oldStorageKey = oldColumn("storage_key", "NULL");

      const oldFileSize = oldColumn("file_size", "LENGTH(image_data)");

      // ========================================
      // 기존 사진 해시값 보존
      // ========================================

      const oldContentHash = oldColumn("content_hash", "NULL");

      const oldIsDeleted = oldColumn("is_deleted", "0");

      const oldDeletedAt = oldColumn("deleted_at", "NULL");

      const oldCreatedAt = oldColumn("created_at", "CURRENT_TIMESTAMP");

      // ========================================
      // 트랜잭션 시작
      // ========================================

      db.exec("BEGIN IMMEDIATE");

      transactionStarted = true;

      // ========================================
      // 새로운 사진 테이블 생성
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

          content_hash TEXT,

          is_deleted INTEGER NOT NULL DEFAULT 0
            CHECK (is_deleted IN (0, 1)),

          deleted_at TEXT,

          created_at TEXT DEFAULT CURRENT_TIMESTAMP,

          FOREIGN KEY (diary_id)
            REFERENCES farm_diaries(id)
            ON DELETE CASCADE,

          CHECK (
            image_data IS NOT NULL
            OR storage_key IS NOT NULL
          )
        )
      `);

      // ========================================
      // 기존 사진 데이터 복사
      // 기존 사진 ID 유지
      // ========================================

      db.exec(`
        INSERT INTO diary_photos_new (

          id,
          diary_id,
          mime_type,
          image_data,
          storage_provider,
          storage_key,
          file_size,
          content_hash,
          is_deleted,
          deleted_at,
          created_at

        )

        SELECT

          id,
          diary_id,
          mime_type,
          ${oldImageData},
          ${oldStorageProvider},
          ${oldStorageKey},
          ${oldFileSize},
          ${oldContentHash},
          ${oldIsDeleted},
          ${oldDeletedAt},
          ${oldCreatedAt}

        FROM diary_photos
      `);

      // ========================================
      // 기존 테이블 제거
      // ========================================

      db.exec("DROP TABLE diary_photos");

      // ========================================
      // 새로운 테이블 이름 변경
      // ========================================

      db.exec(`
        ALTER TABLE diary_photos_new
        RENAME TO diary_photos
      `);

      // ========================================
      // 변경 완료
      // ========================================

      db.exec("COMMIT");

      transactionStarted = false;

      console.log("📸 사진 테이블 구조 변경 완료!");
    } catch (error) {
      if (transactionStarted) {
        try {
          db.exec("ROLLBACK");
        } catch (rollbackError) {
          console.error("사진 테이블 롤백 오류:", rollbackError);
        }
      }

      console.error("사진 테이블 마이그레이션 실패:", error);

      throw error;
    }
  } else {
    console.log("📸 사진 테이블 구조 최신 상태!");
  }

  // ========================================
  // 📸 사진 내용 해시 컬럼 확인
  // 기존 데이터베이스 호환
  // ========================================

  const latestPhotoColumns = db
    .prepare("PRAGMA table_info(diary_photos)")
    .all();

  const hasContentHash = latestPhotoColumns.some(
    (column) => column.name === "content_hash",
  );

  if (!hasContentHash) {
    db.exec(`
      ALTER TABLE diary_photos
      ADD COLUMN content_hash TEXT
    `);

    console.log("📸 사진 내용 해시 컬럼 추가 완료!");
  }

  // ========================================
  // 14. 사진 조회 인덱스 생성
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_diary_photos_diary_id

    ON diary_photos(diary_id, id DESC)
  `);

  // ========================================
  // 15. 삭제되지 않은 사진 조회 인덱스
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_diary_photos_active

    ON diary_photos(
      diary_id,
      is_deleted,
      id DESC
    )
  `);

  // ========================================
  // 16. 삭제된 사진 정리용 인덱스
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_diary_photos_deleted

    ON diary_photos(
      is_deleted,
      deleted_at
    )
  `);

  // ========================================
  // 17. 사진 저장 위치 중복 방지
  // ========================================

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_photos_storage_key

    ON diary_photos(storage_key)

    WHERE storage_key IS NOT NULL
  `);

  console.log("📸 사진 테이블 인덱스 확인 완료!");

  // ========================================
  // 13. 재배 일지 조회 인덱스 생성
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_farm_diaries_farm_date

    ON farm_diaries(farm_id, work_date DESC, id DESC)
  `);

  console.log("🌱 재배 일지 조회 인덱스 확인 완료!");

  // ========================================
  // 🌱 농장 삭제 데이터 정리 인덱스
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_farms_deleted

    ON farms (
      is_deleted,
      deleted_at
    )
  `);

  // ========================================
  // 📖 재배 일지 삭제 데이터 정리 인덱스
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_farm_diaries_deleted

    ON farm_diaries (
      is_deleted,
      deleted_at
    )
  `);

  // ========================================
  // 📖 활성 재배 일지 조회 인덱스
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_farm_diaries_active

    ON farm_diaries (
      farm_id,
      work_date DESC,
      id DESC
    )

    WHERE is_deleted = 0
  `);

  console.log("🌱 소프트 삭제 관련 인덱스 확인 완료!");

  // ========================================
  // 14. 초기화 완료
  // ========================================

  console.log("==============================");
  console.log("🌱 데이터베이스 구조 확인 완료!");
  console.log("==============================");
}

// ========================================
// 15. 초기화 함수 내보내기
// ========================================

module.exports = {
  initializeDatabase,
};
