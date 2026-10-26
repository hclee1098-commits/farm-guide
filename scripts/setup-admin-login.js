const fs = require("node:fs");
const path = require("node:path");

const {
  hashPassword,
  verifyPassword
} = require("../services/auth/password");

async function main() {

  // ========================================
  // 표준 입력에서 로그인 정보 수신
  // ========================================

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of process.stdin) {
    totalBytes += chunk.length;

    if (totalBytes > 4096) {
      throw new Error("입력 데이터가 너무 큽니다.");
    }

    chunks.push(chunk);
  }

  const input = JSON.parse(
    Buffer.concat(chunks).toString("utf8")
  );

  const username =
    typeof input.username === "string"
      ? input.username.trim().toLowerCase()
      : "";

  const password = input.password;

  // ========================================
  // 아이디 검증
  // ========================================

  if (!/^[a-z][a-z0-9_]{3,19}$/.test(username)) {
    throw new Error(
      "아이디는 영문으로 시작하는 4~20자의 영문, 숫자, 밑줄만 허용됩니다."
    );
  }

  // ========================================
  // 비밀번호 검증
  // ========================================

  if (
    typeof password !== "string" ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 256
  ) {
    throw new Error(
      "비밀번호는 12자 이상, UTF-8 기준 256바이트 이하여야 합니다."
    );
  }

  // ========================================
  // 실제 서버 DB 연결
  // ========================================

  const db = require("../db/database");

  try {

    db.exec("PRAGMA foreign_keys = ON");

    // ========================================
    // 실제 DB 경로 검증
    // ========================================

    const databaseInfo = db.prepare(
      "PRAGMA database_list"
    ).all();

    const mainDatabase = databaseInfo.find(
      item => item.name === "main"
    );

    const expectedPath = path.resolve(
      "farm-guide.db"
    );

    if (
      !mainDatabase?.file ||
      path.resolve(mainDatabase.file) !== expectedPath
    ) {
      throw new Error(
        "서버 DB 경로와 진단한 DB 경로가 다릅니다. 작업을 중단합니다."
      );
    }

    // ========================================
    // 기존 관리자 확인
    // ========================================

    const admin = db.prepare(`
      SELECT id, role
      FROM users
      WHERE id = 1
    `).get();

    if (!admin || admin.role !== "admin") {
      throw new Error(
        "기존 관리자 ID 1을 확인할 수 없습니다."
      );
    }

    // ========================================
    // 기존 로그인 정보 확인
    // ========================================

    const existing = db.prepare(`
      SELECT user_id
      FROM user_credentials
      WHERE user_id = 1
    `).get();

    if (existing) {
      throw new Error(
        "관리자 로그인 정보가 이미 존재합니다."
      );
    }

    // ========================================
    // 아이디 중복 확인
    // ========================================

    const duplicate = db.prepare(`
      SELECT user_id
      FROM user_credentials
      WHERE username = ?
    `).get(username);

    if (duplicate) {
      throw new Error(
        "이미 사용 중인 아이디입니다."
      );
    }

    // ========================================
    // 기존 농장 개수 저장
    // ========================================

    const farmsBefore = db.prepare(`
      SELECT COUNT(*) AS total
      FROM farms
    `).get().total;

    // ========================================
    // DB 무결성 사전 확인
    // ========================================

    const integrity = db.prepare(
      "PRAGMA integrity_check"
    ).get();

    if (integrity.integrity_check !== "ok") {
      throw new Error("DB 무결성 검사 실패");
    }

    if (
      db.prepare("PRAGMA foreign_key_check")
        .all().length !== 0
    ) {
      throw new Error("외래키 무결성 검사 실패");
    }

    // ========================================
    // SQLite 일관성 백업
    // ========================================

    const backupDir = path.resolve("backup");

    fs.mkdirSync(backupDir, {
      recursive: true
    });

    const backupPath = path.join(
      backupDir,
      `pre-admin-login-${Date.now()}-${process.pid}.db`
    );

    const escapedPath = backupPath.replace(
      /'/g,
      "''"
    );

    db.exec(`VACUUM INTO '${escapedPath}'`);

    console.log("DB backup:", backupPath);

    // ========================================
    // 비밀번호 암호화
    // ========================================

    const {
      passwordHash,
      passwordSalt
    } = await hashPassword(password);

    // ========================================
    // 트랜잭션 시작
    // ========================================

    db.exec("BEGIN IMMEDIATE");

    let transactionOpen = true;

    try {

      // 중복 실행 및 관리자 상태 재확인

      const currentAdmin = db.prepare(`
        SELECT id, role
        FROM users
        WHERE id = 1
      `).get();

      const currentCredentials = db.prepare(`
        SELECT user_id
        FROM user_credentials
        WHERE user_id = 1 OR username = ?
      `).get(username);

      if (
        !currentAdmin ||
        currentAdmin.role !== "admin" ||
        currentCredentials
      ) {
        throw new Error(
          "관리자 상태가 변경되었습니다."
        );
      }

      // ========================================
      // 기존 관리자 로그인 정보 연결
      // ========================================

      db.prepare(`
        INSERT INTO user_credentials (
          user_id,
          username,
          password_hash,
          password_salt
        )
        VALUES (?, ?, ?, ?)
      `).run(
        1,
        username,
        passwordHash,
        passwordSalt
      );

      db.exec("COMMIT");

      transactionOpen = false;

    } catch (error) {

      if (transactionOpen) {
        db.exec("ROLLBACK");
      }

      throw error;
    }

    // ========================================
    // 로그인 정보 검증
    // ========================================

    const credentials = db.prepare(`
      SELECT
        password_hash,
        password_salt
      FROM user_credentials
      WHERE user_id = 1
    `).get();

    const valid = await verifyPassword(
      password,
      credentials.password_hash,
      credentials.password_salt
    );

    if (!valid) {
      throw new Error(
        "비밀번호 검증 실패"
      );
    }

    // ========================================
    // 기존 농장 보존 확인
    // ========================================

    const farmsAfter = db.prepare(`
      SELECT COUNT(*) AS total
      FROM farms
    `).get().total;

    if (farmsBefore !== farmsAfter) {
      throw new Error(
        "농장 개수가 변경되었습니다."
      );
    }

    // ========================================
    // 최종 DB 무결성 확인
    // ========================================

    const finalIntegrity = db.prepare(
      "PRAGMA integrity_check"
    ).get();

    const fkErrors = db.prepare(
      "PRAGMA foreign_key_check"
    ).all();

    if (
      finalIntegrity.integrity_check !== "ok" ||
      fkErrors.length !== 0
    ) {
      throw new Error(
        "최종 DB 무결성 검사 실패"
      );
    }

    console.log("================================");
    console.log("ADMIN LOGIN SETUP SUCCESS");
    console.log("================================");

    console.log("Admin ID:", 1);
    console.log("Username:", username);
    console.log("Password verification: PASS");
    console.log("Existing farms:", farmsAfter);
    console.log("Database integrity: OK");

    console.log("================================");

  } finally {

    db.close();

  }
}

main().catch(error => {

  console.error(
    "ADMIN SETUP FAILED:",
    error.message
  );

  process.exitCode = 1;

});