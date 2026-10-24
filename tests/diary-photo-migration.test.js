// ========================================
// 🌱 농사 가이드
// 📸 사진 DB 마이그레이션 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

// ========================================
// 기존에 정상 작동 확인한 SQLite 모듈
// ========================================

const Database = require("better-sqlite3");

const { initializeDatabase } = require("../db/init");

// ========================================
// 1. 해시 컬럼 존재 여부 확인
// ========================================

function hasContentHash(db) {
  const columns = db.prepare("PRAGMA table_info(diary_photos)").all();

  return columns.some((column) => column.name === "content_hash");
}

// ========================================
// 2. 기존 사진 테이블 생성
// ========================================

function createLegacyDatabase(withHash = false) {
  const db = new Database(":memory:");

  const hashColumn = withHash ? "content_hash TEXT," : "";

  db.exec(`
    CREATE TABLE farms (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE farm_diaries (
      id INTEGER PRIMARY KEY,
      farm_id INTEGER NOT NULL,
      work_date TEXT NOT NULL,
      work_type TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE diary_photos (
      id INTEGER PRIMARY KEY,
      diary_id INTEGER NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      image_data BLOB NOT NULL,
      ${hashColumn}
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO farms (id, name)
    VALUES (1, '테스트 농장');

    INSERT INTO farm_diaries (
      id,
      farm_id,
      work_date,
      work_type
    )
    VALUES (
      1,
      1,
      '2026-10-23',
      '기타'
    );
  `);

  const imageData = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  if (withHash) {
    db.prepare(
      `
      INSERT INTO diary_photos (
        id,
        diary_id,
        mime_type,
        image_data,
        content_hash
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(1, 1, "image/png", imageData, "test-photo-hash");
  } else {
    db.prepare(
      `
      INSERT INTO diary_photos (
        id,
        diary_id,
        mime_type,
        image_data
      )
      VALUES (?, ?, ?, ?)
    `,
    ).run(1, 1, "image/png", imageData);
  }

  return db;
}

// ========================================
// 3. 신규 DB 초기화 테스트
// ========================================

test("신규 DB에 사진 해시 컬럼이 생성된다", () => {
  const db = new Database(":memory:");

  try {
    initializeDatabase(db);

    assert.equal(hasContentHash(db), true);

    console.log("✅ 신규 DB 해시 컬럼 생성");

    // ========================================
    // 초기화 중복 실행 확인
    // ========================================

    initializeDatabase(db);

    assert.equal(hasContentHash(db), true);

    console.log("✅ DB 초기화 중복 실행 정상");
  } finally {
    db.close();
  }
});

// ========================================
// 4. 기존 사진 데이터 보존 테스트
// ========================================

test("기존 사진을 유지하면서 해시 컬럼을 추가한다", () => {
  const db = createLegacyDatabase(false);

  try {
    initializeDatabase(db);

    assert.equal(hasContentHash(db), true);

    const photo = db
      .prepare(
        `
      SELECT *
      FROM diary_photos
      WHERE id = 1
    `,
      )
      .get();

    assert.ok(photo);

    assert.equal(photo.diary_id, 1);

    assert.equal(photo.mime_type, "image/png");

    assert.equal(photo.content_hash, null);

    assert.equal(photo.file_size, 8);

    assert.deepEqual(
      photo.image_data,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    console.log("✅ 기존 사진 데이터 보존");
    console.log("✅ 기존 사진 해시 컬럼 추가");
  } finally {
    db.close();
  }
});

// ========================================
// 5. 기존 해시값 보존 테스트
// ========================================

test("마이그레이션 후 기존 사진 해시값을 유지한다", () => {
  const db = createLegacyDatabase(true);

  try {
    initializeDatabase(db);

    const photo = db
      .prepare(
        `
      SELECT content_hash
      FROM diary_photos
      WHERE id = 1
    `,
      )
      .get();

    assert.ok(photo);

    assert.equal(photo.content_hash, "test-photo-hash");

    console.log("✅ 기존 사진 해시값 보존");
  } finally {
    db.close();
  }
});

// ========================================
// 6. 기존 DB 컬럼 추가 테스트
// ========================================

test("기존 사진 테이블에 해시 컬럼만 추가한다", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE diary_photos (
        id INTEGER PRIMARY KEY,
        diary_id INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        image_data BLOB,
        storage_provider TEXT,
        storage_key TEXT,
        file_size INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    initializeDatabase(db);

    assert.equal(hasContentHash(db), true);

    console.log("✅ 기존 DB 해시 컬럼 추가 성공");
  } finally {
    db.close();
  }
});
