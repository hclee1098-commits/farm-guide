// ========================================
// 🌱 농사 가이드
// 🔔 공통 Toast 알림 컴포넌트
// ========================================

// ========================================
// 1. 현재 알림 상태
// ========================================

let activeToast = null;

let activeTimer = null;

// ========================================
// 2. 알림 종류
// ========================================

const TOAST_TYPES = {
  success: {
    icon: "✅",
    defaultDuration: 7000,
  },

  error: {
    icon: "❌",
    defaultDuration: 0,
  },

  warning: {
    icon: "⚠️",
    defaultDuration: 0,
  },

  info: {
    icon: "ℹ️",
    defaultDuration: 7000,
  },
};

// ========================================
// 3. 기존 알림 제거
// ========================================

function removeActiveToast() {
  // ========================================
  // 기존 타이머 정리
  // ========================================

  if (activeTimer !== null) {
    clearTimeout(activeTimer);

    activeTimer = null;
  }

  // ========================================
  // 기존 알림 제거
  // ========================================

  if (activeToast) {
    activeToast.remove();

    activeToast = null;
  }
}

// ========================================
// 4. 공통 알림 표시
// ========================================

export function showToast(message, { type = "success", duration } = {}) {
  // ========================================
  // 5. 알림 종류 검증
  // ========================================

  const toastType = Object.hasOwn(TOAST_TYPES, type) ? type : "info";

  const config = TOAST_TYPES[toastType];

  // ========================================
  // 6. 표시 시간 결정
  // ========================================

  const displayDuration =
    Number.isFinite(duration) && duration >= 0
      ? duration
      : config.defaultDuration;

  // ========================================
  // 7. 기존 알림 정리
  // ========================================

  removeActiveToast();

  // ========================================
  // 8. 알림 요소 생성
  // ========================================

  const toast = document.createElement("div");

  toast.className = `fg-toast fg-toast--${toastType}`;

  // ========================================
  // 9. 접근성 설정
  // ========================================

  const isImportant = toastType === "error" || toastType === "warning";

  toast.setAttribute("role", isImportant ? "alert" : "status");

  // ========================================
  // 10. 알림 아이콘
  // ========================================

  const icon = document.createElement("span");

  icon.className = "fg-toast__icon";

  icon.textContent = config.icon;

  icon.setAttribute("aria-hidden", "true");

  // ========================================
  // 11. 알림 메시지
  // ========================================

  const messageElement = document.createElement("p");

  messageElement.className = "fg-toast__message";

  // HTML이 아닌 일반 텍스트로 표시
  messageElement.textContent = String(message);

  // ========================================
  // 12. 닫기 버튼
  // ========================================

  const closeButton = document.createElement("button");

  closeButton.type = "button";

  closeButton.className = "fg-toast__close";

  closeButton.textContent = "✕";

  closeButton.setAttribute("aria-label", "알림 닫기");

  // ========================================
  // 13. 알림 닫기
  // ========================================

  function closeToast() {
    // 이전 알림의 닫기 함수가
    // 새 알림을 제거하지 않도록 확인
    if (activeToast !== toast) {
      return;
    }

    removeActiveToast();
  }

  closeButton.addEventListener("click", closeToast);

  // ========================================
  // 14. 알림 구성
  // ========================================

  toast.append(icon, messageElement, closeButton);

  // ========================================
  // 15. 화면에 알림 표시
  // ========================================

  document.body.appendChild(toast);

  activeToast = toast;

  // ========================================
  // 16. 자동 닫기
  // ========================================

  if (displayDuration > 0) {
    activeTimer = setTimeout(() => {
      closeToast();
    }, displayDuration);
  }

  // ========================================
  // 17. 외부에서 닫을 수 있도록 반환
  // ========================================

  return closeToast;
}
