const test = require("node:test");

const assert = require("node:assert/strict");

const express = require("express");

const {
  randomBytes,
  createHash
} = require("node:crypto");

const { DatabaseSync } = require("node:sqlite");

const { initializeDatabase } = require("../db/init");

const createRequireAuth = require("../middleware/auth");

test("로그인 인증 미들웨어 통합 검증", async () => {
  const db = new DatabaseSync(":memory:");

  let server;

  try {
    db.exec("PRAGMA foreign_keys = ON");

    initializeDatabase(db);

    // ========================================
    // 테스트 사용자 생성
    // ========================================

    const result = db.prepare(`
      INSERT INTO users (
        internal_key,
        display_name,
        role
      )
      VALUES (?, ?, ?)
    `).run(
      "middleware-test-user",
      "Middleware Test",
      "user"
    );

    const userId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO user_credentials (
        user_id,
        username,
        password_hash,
        password_salt
      )
      VALUES (?, ?, ?, ?)
    `).run(
      userId,
      "middlewareuser",
      "test-hash",
      "test-salt"
    );

    // ========================================
    // 테스트 세션 생성
    // ========================================

    const token = randomBytes(32).toString("base64url");

    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    db.prepare(`
      INSERT INTO auth_sessions (
        token_hash,
        user_id,
        expires_at
      )
      VALUES (?, ?, ?)
    `).run(
      tokenHash,
      userId,
      Date.now() + 3600000
    );

    // ========================================
    // 테스트 서버
    // ========================================

    const app = express();

    app.use(express.json());

    const requireAuth = createRequireAuth(db);

    app.use("/private", requireAuth);

    app.get("/private/me", (req, res) => {
      res.json({
        success: true,
        user: req.user
      });
    });

    app.post("/private/me", (req, res) => {
      res.json({
        success: true,
        user: req.user
      });
    });

    server = await new Promise(resolve => {
      const instance = app.listen(
        0,
        "127.0.0.1",
        () => resolve(instance)
      );
    });

    const base =
      `http://127.0.0.1:${server.address().port}`;

    async function request(cookie, method = "GET", body) {
      const headers = {};

      if (cookie) {
        headers.Cookie = cookie;
      }

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(
        base + "/private/me",
        {
          method,
          headers,
          body: body === undefined
            ? undefined
            : JSON.stringify(body)
        }
      );

      return {
        status: response.status,
        data: await response.json()
      };
    }

    // ========================================
    // TEST 1: 비로그인 접근 차단
    // ========================================

    const guest = await request();

    assert.equal(guest.status, 401);

    console.log("PASS 1: Guest rejected");

    // ========================================
    // TEST 2: 정상 로그인 사용자
    // ========================================

    const valid = await request(
      `fg_session=${token}`
    );

    assert.equal(valid.status, 200);

    assert.equal(valid.data.user.id, userId);

    console.log("PASS 2: Valid session accepted");

    // ========================================
    // TEST 3: 사용자 정보 확인
    // ========================================

    assert.equal(
      valid.data.user.username,
      "middlewareuser"
    );

    assert.equal(
      valid.data.user.role,
      "user"
    );

    console.log("PASS 3: User identity attached");

    // ========================================
    // TEST 4: 위조 토큰 차단
    // ========================================

    const fakeToken = randomBytes(32)
      .toString("base64url");

    const forged = await request(
      `fg_session=${fakeToken}`
    );

    assert.equal(forged.status, 401);

    console.log("PASS 4: Forged session rejected");

    // ========================================
    // TEST 5: 잘못된 쿠키 차단
    // ========================================

    const malformed = await request(
      "fg_session=invalid"
    );

    assert.equal(malformed.status, 401);

    console.log("PASS 5: Malformed cookie rejected");

    // ========================================
    // TEST 6: 중복 쿠키 차단
    // ========================================

    const duplicate = await request(
      `fg_session=${token}; fg_session=${fakeToken}`
    );

    assert.equal(duplicate.status, 401);

    console.log("PASS 6: Duplicate cookies rejected");

    // ========================================
    // TEST 7: 클라이언트 사용자 위조 차단
    // ========================================

    const spoofed = await request(
      null,
      "POST",
      {
        user: {
          id: userId,
          role: "admin"
        }
      }
    );

    assert.equal(spoofed.status, 401);

    console.log("PASS 7: Client identity spoof rejected");

    // ========================================
    // TEST 8: 만료 세션 차단
    // ========================================

    db.prepare(`
      UPDATE auth_sessions
      SET expires_at = ?
      WHERE token_hash = ?
    `).run(
      Date.now() - 1000,
      tokenHash
    );

    const expired = await request(
      `fg_session=${token}`
    );

    assert.equal(expired.status, 401);

    console.log("PASS 8: Expired session rejected");

    // ========================================
    // TEST 9: 삭제된 세션 차단
    // ========================================

    db.prepare(`
      DELETE FROM auth_sessions
      WHERE token_hash = ?
    `).run(tokenHash);

    const revoked = await request(
      `fg_session=${token}`
    );

    assert.equal(revoked.status, 401);

    console.log("PASS 9: Revoked session rejected");

    // ========================================
    // TEST 10: 데이터베이스 무결성
    // ========================================

    assert.equal(
      db.prepare("PRAGMA integrity_check")
        .get().integrity_check,
      "ok"
    );

    assert.equal(
      db.prepare("PRAGMA foreign_key_check")
        .all().length,
      0
    );

    console.log("PASS 10: Database integrity");

    console.log("================================");
    console.log("ALL 10 AUTH MIDDLEWARE CHECKS PASSED");
    console.log("================================");

  } finally {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    db.close();
  }
});