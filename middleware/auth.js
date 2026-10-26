const { createHash } = require("node:crypto");

const COOKIE_NAME = "fg_session";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// ========================================
// 로그인 쿠키 추출
// ========================================

function readSessionToken(req) {
  const header = req.headers.cookie;

  if (typeof header !== "string") {
    return null;
  }

  const matches = header
    .split(";")
    .map(value => value.trim())
    .filter(value =>
      value.startsWith(`${COOKIE_NAME}=`)
    );

  // 중복 세션 쿠키 차단
  if (matches.length !== 1) {
    return null;
  }

  const token = matches[0].slice(
    COOKIE_NAME.length + 1
  );

  if (!TOKEN_PATTERN.test(token)) {
    return null;
  }

  return token;
}

// ========================================
// 세션 토큰 SHA-256 변환
// ========================================

function hashToken(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

// ========================================
// 인증 미들웨어 생성
// ========================================

function createRequireAuth(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError(
      "유효한 데이터베이스 연결이 필요합니다."
    );
  }

  // ========================================
  // 로그인 사용자 조회
  // ========================================

  const findSession = db.prepare(`
    SELECT
      u.id,
      u.display_name,
      u.role,
      c.username

    FROM auth_sessions s

    JOIN users u
      ON u.id = s.user_id

    JOIN user_credentials c
      ON c.user_id = u.id

    WHERE s.token_hash = ?
      AND s.expires_at > ?
  `);

  // ========================================
  // 실제 인증 처리
  // ========================================

  return function requireAuth(req, res, next) {
    try {
      const token = readSessionToken(req);

      // 로그인 쿠키 없음
      if (!token) {
        return res.status(401).json({
          success: false,
          message: "로그인이 필요합니다."
        });
      }

      // ========================================
      // 세션 조회
      // ========================================

      const session = findSession.get(
        hashToken(token),
        Date.now()
      );

      // 세션 없음 또는 만료
      if (!session) {
        return res.status(401).json({
          success: false,
          message: "로그인 세션이 유효하지 않습니다."
        });
      }

      // ========================================
      // 로그인 사용자 정보 설정
      // ========================================

      req.user = {
        id: session.id,
        username: session.username,
        displayName: session.display_name,
        role: session.role
      };

      // ========================================
      // 다음 API 처리
      // ========================================

      return next();

    } catch (error) {
      console.error("인증 미들웨어 오류:", error);

      return res.status(500).json({
        success: false,
        message: "인증 처리 중 오류가 발생했습니다."
      });
    }
  };
}

module.exports = createRequireAuth;