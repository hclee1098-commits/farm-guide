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

  console.log("🌱 농장 테이블 구조 확인 완료!");

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
  // 8. 재배 일지 사진 테이블 생성
  // ========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS diary_photos (

      id INTEGER PRIMARY KEY AUTOINCREMENT,

      diary_id INTEGER NOT NULL,

      mime_type TEXT NOT NULL,

      image_data BLOB NOT NULL,

      created_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (diary_id)
        REFERENCES farm_diaries(id)
        ON DELETE CASCADE
    )
  `);

  console.log("📸 재배 일지 사진 테이블 확인 완료!");

  // ========================================
  // 9. 기존 사진 테이블 구조 확인
  // ========================================

  const photoIndexes = db.prepare("PRAGMA index_list('diary_photos')").all();

  // ========================================
  // 10. 기존 UNIQUE 제약 조건 확인
  // ========================================

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
  // 11. 기존 사진 테이블 마이그레이션
  // ========================================

  if (hasUniqueDiaryId) {
    console.log("📸 기존 사진 테이블 구조 변경 시작...");

    let transactionStarted = false;

    try {
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

          image_data BLOB NOT NULL,

          created_at TEXT DEFAULT CURRENT_TIMESTAMP,

          FOREIGN KEY (diary_id)
            REFERENCES farm_diaries(id)
            ON DELETE CASCADE
        )
      `);

      // ========================================
      // 기존 사진 데이터 복사
      // ========================================

      db.exec(`
        INSERT INTO diary_photos_new (

          id,
          diary_id,
          mime_type,
          image_data,
          created_at

        )

        SELECT

          id,
          diary_id,
          mime_type,
          image_data,
          created_at

        FROM diary_photos
      `);

      // ========================================
      // 기존 사진 테이블 제거
      // ========================================

      db.exec("DROP TABLE diary_photos");

      // ========================================
      // 새로운 사진 테이블 이름 변경
      // ========================================

      db.exec(`
        ALTER TABLE diary_photos_new
        RENAME TO diary_photos
      `);

      // ========================================
      // 트랜잭션 완료
      // ========================================

      db.exec("COMMIT");

      transactionStarted = false;

      console.log("📸 사진 테이블 마이그레이션 완료!");
    } catch (error) {
      if (transactionStarted) {
        try {
          db.exec("ROLLBACK");
        } catch (rollbackError) {
          console.error("사진 테이블 복구 오류:", rollbackError);
        }
      }

      console.error("사진 테이블 마이그레이션 실패:", error);

      throw error;
    }
  }

  // ========================================
  // 12. 사진 조회 인덱스 생성
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_diary_photos_diary_id

    ON diary_photos(diary_id, id DESC)
  `);

  console.log("📸 사진 조회 인덱스 확인 완료!");

  // ========================================
  // 13. 재배 일지 조회 인덱스 생성
  // ========================================

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_farm_diaries_farm_date

    ON farm_diaries(farm_id, work_date DESC, id DESC)
  `);

  console.log("🌱 재배 일지 조회 인덱스 확인 완료!");

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
