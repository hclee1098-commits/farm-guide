// ========================================
// 🌱 농사 가이드
// 💬 공통 확인 대화상자 컴포넌트
// ========================================

// ========================================
// 1. 현재 열려 있는 확인창
// ========================================

let activeDialog = null;

// ========================================
// 2. 공통 확인창 생성
// ========================================

export function confirmAction({
  title = "확인",
  message = "계속 진행하시겠습니까?",
  confirmText = "확인",
  cancelText = "취소",
  variant = "normal",
} = {}) {
  // ========================================
  // 3. 확인창 중복 실행 방지
  // ========================================

  if (activeDialog) {
    return Promise.resolve(false);
  }

  // ========================================
  // 4. 기존 포커스 위치 기억
  // ========================================

  const previousFocus = document.activeElement;

  // ========================================
  // 5. 확인창 요소 생성
  // ========================================

  const dialog = document.createElement("dialog");

  dialog.className = "fg-confirm-dialog";

  // ========================================
  // 6. 확인창 제목
  // ========================================

  const titleElement = document.createElement("h2");

  titleElement.className = "fg-confirm-dialog__title";

  titleElement.textContent = title;

  // ========================================
  // 7. 확인창 설명
  // ========================================

  const messageElement = document.createElement("p");

  messageElement.className = "fg-confirm-dialog__message";

  messageElement.textContent = message;

  // ========================================
  // 8. 접근성 ID 생성
  // ========================================

  const uniqueId = crypto.randomUUID();

  titleElement.id = `fg-confirm-title-${uniqueId}`;

  messageElement.id = `fg-confirm-message-${uniqueId}`;

  dialog.setAttribute("aria-labelledby", titleElement.id);

  dialog.setAttribute("aria-describedby", messageElement.id);

  // ========================================
  // 9. 버튼 영역
  // ========================================

  const actions = document.createElement("div");

  actions.className = "fg-confirm-dialog__actions";

  // ========================================
  // 10. 취소 버튼
  // ========================================

  const cancelButton = document.createElement("button");

  cancelButton.type = "button";

  cancelButton.className =
    "fg-confirm-dialog__button " + "fg-confirm-dialog__button--cancel";

  cancelButton.textContent = cancelText;

  // ========================================
  // 11. 확인 버튼
  // ========================================

  const confirmButton = document.createElement("button");

  confirmButton.type = "button";

  confirmButton.className =
    "fg-confirm-dialog__button " +
    (variant === "danger"
      ? "fg-confirm-dialog__button--danger"
      : "fg-confirm-dialog__button--confirm");

  confirmButton.textContent = confirmText;

  // ========================================
  // 12. 확인창 구성
  // ========================================

  actions.append(cancelButton, confirmButton);

  dialog.append(titleElement, messageElement, actions);

  // ========================================
  // 13. 확인 결과 반환
  // ========================================

  return new Promise((resolve) => {
    // ========================================
    // 확인창 상태 등록
    // ========================================

    activeDialog = dialog;

    // ========================================
    // 취소 버튼
    // ========================================

    cancelButton.addEventListener("click", () => {
      dialog.close("cancel");
    });

    // ========================================
    // 확인 버튼
    // ========================================

    confirmButton.addEventListener("click", () => {
      dialog.close("confirm");
    });

    // ========================================
    // 확인창 종료 처리
    // ========================================

    dialog.addEventListener(
      "close",
      () => {
        const confirmed = dialog.returnValue === "confirm";

        // DOM에서 제거
        dialog.remove();

        // 상태 초기화
        activeDialog = null;

        // ========================================
        // 기존 포커스 복원
        // ========================================

        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
          previousFocus.focus({
            preventScroll: true,
          });
        }

        // 결과 반환
        resolve(confirmed);
      },
      {
        once: true,
      },
    );

    // ========================================
    // 14. 화면에 확인창 추가
    // ========================================

    document.body.appendChild(dialog);

    // ========================================
    // 15. 모달 확인창 표시
    // ========================================

    dialog.showModal();

    // ========================================
    // 16. 기본 포커스
    //
    // 실수로 삭제하는 것을 방지하기 위해
    // 취소 버튼에 먼저 포커스
    // ========================================

    cancelButton.focus();
  });
}

// ========================================
// 17. 외부에서 확인창 닫기
// ========================================

export function closeConfirmDialog() {
  // ========================================
  // 열려 있는 확인창 확인
  // ========================================

  if (!activeDialog) {
    return;
  }

  // ========================================
  // 이미 닫힌 확인창 확인
  // ========================================

  if (!activeDialog.open) {
    return;
  }

  // ========================================
  // 취소 처리로 확인창 종료
  // ========================================

  activeDialog.close("cancel");
}
