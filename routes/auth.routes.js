const express = require("express");

const {
  randomBytes,
  createHash
} = require("node:crypto");

const {
  hashPassword,
  verifyPassword
} = require("../services/auth/password");

const COOKIE_NAME = "fg_session";

const SESSION_SECONDS = 7 * 24 * 60 * 60;

function createAuthRouter(db) {
  const router = express.Router();

  // ========================================
  // 요청 횟수 제한
  // ========================================

  const attempts = new Map();

  const RATE_WINDOW = 15 * 60 * 1000;
  const RATE_LIMIT = 10;

  function rateLimit(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let entry = attempts.get(key);

    if (!entry || entry.expires <= now) {
      entry = {
        count: 0,
        expires: now + RATE_WINDOW
      };

      attempts.set(key, entry);
    }

    if (entry.count >= RATE_LIMIT) {
      return res.status(429).json({
        success: false,
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
      });
    }

    entry.count++;

    next();
  }

  // ========================================
  // 오래된 요청 기록 정리
  // ========================================

  const cleanupTimer = setInterval(() => {
    const now = Date.now();

    for (const [key, entry] of attempts) {
      if (entry.expires <= now) {
        attempts.delete(key);
      }
    }
  }, RATE_WINDOW);

  cleanupTimer.unref();

  // ========================================
  // 다른 사이트에서 보낸 변경 요청 차단
  // ========================================

  router.use((req, res, next) => {
    if (req.method !== "POST") {
      return next();
    }

    if (req.get("sec-fetch-site") === "cross-site") {
      return res.sendStatus(403);
    }

    const origin = req.get("origin");

    if (origin) {
      try {
        const parsed = new URL(origin);

        if (
          !["http:", "https:"].includes(parsed.protocol) ||
          parsed.host !== req.get("host")
        ) {
          return res.sendStatus(403);
        }
      } catch {
        return res.sendStatus(403);
      }
    }

    next();
  });

  // ========================================
  // 쿠키 처리
  // ========================================

  function cookieOptions(maxAge) {
    const secure =
      process.env.NODE_ENV === "production"
        ? "; Secure"
        : "";

    return [
      "HttpOnly",
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${maxAge}`
    ].join("; ") + secure;
  }

  function setSessionCookie(res, token) {
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${token}; ${cookieOptions(SESSION_SECONDS)}`
    );
  }

  function clearSessionCookie(res) {
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=; ${cookieOptions(0)}`
    );
  }

  function readSessionToken(req) {
    const header = req.headers.cookie || "";

    const item = header
      .split(";")
      .map(value => value.trim())
      .find(value => value.startsWith(`${COOKIE_NAME}=`));

    if (!item) {
      return null;
    }

    const token = item.slice(COOKIE_NAME.length + 1);

    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return null;
    }

    return token;
  }

  function tokenHash(token) {
    return createHash("sha256")
      .update(token)
      .digest("hex");
  }

  // ========================================
  // 세션 생성
  // ========================================

  function createSession(userId, res) {
    const token = randomBytes(32).toString("base64url");

    const expiresAt =
      Date.now() + SESSION_SECONDS * 1000;

    db.prepare(`
      INSERT INTO auth_sessions (
        token_hash,
        user_id,
        expires_at
      )
      VALUES (?, ?, ?)
    `).run(
      tokenHash(token),
      userId,
      expiresAt
    );

    setSessionCookie(res, token);
  }

  // ========================================
  // 회원가입
  // ========================================

  router.post("/register", rateLimit, async (req, res) => {
    try {
      const {
        username,
        password,
        displayName
      } = req.body || {};

      if (
        typeof username !== "string" ||
        !/^[a-z][a-z0-9_]{3,19}$/i.test(username)
      ) {
        return res.status(400).json({
          success: false,
          message: "아이디는 영문으로 시작하는 4~20자의 영문, 숫자, 밑줄만 사용할 수 있습니다."
        });
      }

      if (
        typeof password !== "string" ||
        password.length < 12 ||
        Buffer.byteLength(password, "utf8") > 256
      ) {
        return res.status(400).json({
          success: false,
          message: "비밀번호는 12자 이상, UTF-8 기준 256바이트 이하로 입력해주세요."
        });
      }

      const normalizedUsername = username.toLowerCase();

      const name =
        typeof displayName === "string"
          ? displayName.trim()
          : normalizedUsername;

      if (!name || name.length > 40) {
        return res.status(400).json({
          success: false,
          message: "이름은 1~40자로 입력해주세요."
        });
      }

      const existing = db.prepare(`
        SELECT user_id
        FROM user_credentials
        WHERE username = ?
      `).get(normalizedUsername);

      if (existing) {
        return res.status(409).json({
          success: false,
          message: "이미 사용 중인 아이디입니다."
        });
      }

      const {
        passwordHash,
        passwordSalt
      } = await hashPassword(password);

      let userId;
      let transactionStarted = false;

      try {
        db.exec("BEGIN IMMEDIATE");
        transactionStarted = true;

        const user = db.prepare(`
          INSERT INTO users (
            internal_key,
            display_name,
            role
          )
          VALUES (?, ?, 'user')
        `).run(
          `local:${normalizedUsername}`,
          name
        );

        userId = Number(user.lastInsertRowid);

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
          normalizedUsername,
          passwordHash,
          passwordSalt
        );

        db.exec("COMMIT");
        transactionStarted = false;

      } catch (error) {
        if (transactionStarted) {
          db.exec("ROLLBACK");
        }

        if (
          /UNIQUE constraint failed: (users\.internal_key|user_credentials\.username)/.test(
            String(error.message)
          )
        ) {
          return res.status(409).json({
            success: false,
            message: "이미 사용 중인 아이디입니다."
          });
        }

        throw error;
      }

      createSession(userId, res);

      return res.status(201).json({
        success: true,
        user: {
          id: userId,
          username: normalizedUsername,
          displayName: name,
          role: "user"
        }
      });

    } catch (error) {
      console.error("회원가입 오류:", error);

      return res.status(500).json({
        success: false,
        message: "회원가입 처리에 실패했습니다."
      });
    }
  });

  // ========================================
  // 로그인
  // ========================================

  router.post("/login", rateLimit, async (req, res) => {
    try {
      const {
        username,
        password
      } = req.body || {};

      if (
        typeof username !== "string" ||
        typeof password !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "아이디와 비밀번호를 입력해주세요."
        });
      }

      const user = db.prepare(`
        SELECT
          u.id,
          u.display_name,
          u.role,
          c.username,
          c.password_hash,
          c.password_salt
        FROM user_credentials c
        JOIN users u ON u.id = c.user_id
        WHERE c.username = ?
      `).get(username.trim());

      const valid = user
        ? await verifyPassword(
            password,
            user.password_hash,
            user.password_salt
          )
        : false;

      if (!valid) {
        return res.status(401).json({
          success: false,
          message: "아이디 또는 비밀번호가 올바르지 않습니다."
        });
      }

      // 기존 로그인 세션이 있으면 무효화
      const previousToken = readSessionToken(req);

      if (previousToken) {
        db.prepare(`
          DELETE FROM auth_sessions
          WHERE token_hash = ?
        `).run(tokenHash(previousToken));
      }

      createSession(user.id, res);

      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          role: user.role
        }
      });

    } catch (error) {
      console.error("로그인 오류:", error);

      return res.status(500).json({
        success: false,
        message: "로그인 처리에 실패했습니다."
      });
    }
  });

  // ========================================
  // 현재 로그인 사용자
  // ========================================

  router.get("/me", (req, res) => {
    try {
      const token = readSessionToken(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "로그인이 필요합니다."
        });
      }

      const user = db.prepare(`
        SELECT
          u.id,
          u.display_name,
          u.role,
          c.username
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        JOIN user_credentials c ON c.user_id = u.id
        WHERE s.token_hash = ?
          AND s.expires_at > ?
      `).get(
        tokenHash(token),
        Date.now()
      );

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "로그인 세션이 만료되었습니다."
        });
      }

      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          role: user.role
        }
      });

    } catch (error) {
      console.error("로그인 상태 확인 오류:", error);

      return res.status(500).json({
        success: false,
        message: "로그인 상태를 확인하지 못했습니다."
      });
    }
  });

  // ========================================
  // 로그아웃
  // ========================================

  router.post("/logout", (req, res) => {
    try {
      const token = readSessionToken(req);

      if (token) {
        db.prepare(`
          DELETE FROM auth_sessions
          WHERE token_hash = ?
        `).run(tokenHash(token));
      }

      clearSessionCookie(res);

      return res.json({
        success: true,
        message: "로그아웃되었습니다."
      });

    } catch (error) {
      console.error("로그아웃 오류:", error);

      return res.status(500).json({
        success: false,
        message: "로그아웃 처리에 실패했습니다."
      });
    }
  });

  return router;
}

module.exports = createAuthRouter;