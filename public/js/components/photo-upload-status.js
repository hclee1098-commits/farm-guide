// ========================================
// 🌱 농사 가이드
// 📸 공통 사진 업로드 상태 컴포넌트
// ========================================

// ========================================
// 1. 사진 업로드 상태 컴포넌트 생성
// ========================================

export function createPhotoUploadStatus(target, options = {}) {
  // ========================================
  // 2. 설정
  // ========================================

  const maxPhotos = options.maxPhotos || 10;

  // ========================================
  // 3. 상태 표시 영역 생성
  // ========================================

  const container = document.createElement("div");

  container.className = "fg-photo-upload-status";

  container.setAttribute("role", "status");

  container.setAttribute("aria-live", "polite");

  // ========================================
  // 4. 제목
  // ========================================

  const title = document.createElement("strong");

  title.className = "fg-photo-upload-status__title";

  title.textContent = "📸 사진 등록 상태";

  // ========================================
  // 5. 이미 저장된 사진
  // ========================================

  const savedText = document.createElement("p");

  savedText.className = "fg-photo-upload-status__saved";

  // ========================================
  // 6. 새로 선택한 사진
  // ========================================

  const pendingText = document.createElement("p");

  pendingText.className = "fg-photo-upload-status__pending";

  // ========================================
  // 7. 전체 사진 개수
  // ========================================

  const totalText = document.createElement("p");

  totalText.className = "fg-photo-upload-status__total";

  // ========================================
  // 8. 안내 메시지
  // ========================================

  const message = document.createElement("p");

  message.className = "fg-photo-upload-status__message";

  // ========================================
  // 9. 컴포넌트 조립
  // ========================================

  container.append(title, savedText, pendingText, totalText, message);

  // ========================================
  // 10. 대상 요소 아래에 삽입
  // ========================================

  target.insertAdjacentElement("afterend", container);

  // ========================================
  // 11. 상태 갱신
  // ========================================

  function update({
    savedCount = 0,
    pendingCount = 0,
    loading = false,
    saving = false,
    error = "",
  } = {}) {
    // ========================================
    // 사진 개수 정리
    // ========================================

    const saved = Math.max(0, savedCount);

    const pending = Math.max(0, pendingCount);

    const total = saved + pending;

    // ========================================
    // 저장된 사진
    // ========================================

    savedText.textContent = loading
      ? "⏳ 등록된 사진을 확인하는 중..."
      : `✅ 이미 등록된 사진: ${saved}장`;

    // ========================================
    // 새로 선택한 사진
    // ========================================

    pendingText.textContent = `🟡 새로 선택한 사진: ${pending}장`;

    // ========================================
    // 전체 사진 개수
    // ========================================

    totalText.textContent = loading
      ? `새로 선택한 사진 ${pending}장 / 최대 ${maxPhotos}장`
      : `총 ${total} / ${maxPhotos}장`;

    // ========================================
    // 상태별 안내
    // ========================================

    if (error) {
      container.dataset.state = "error";

      message.textContent = error;

      return;
    }

    if (saving) {
      container.dataset.state = "saving";

      message.textContent = "⏳ 사진을 저장하고 있습니다. 잠시 기다려주세요.";

      return;
    }

    if (pending > 0) {
      container.dataset.state = "pending";

      message.textContent =
        `⚠️ 선택한 사진 ${pending}장은 아직 저장되지 않았습니다. ` +
        "아래 저장 버튼을 눌러주세요.";

      return;
    }

    // ========================================
    // 기본 상태
    // ========================================

    container.dataset.state = "idle";

    message.textContent = "사진을 선택하면 아래에서 미리 확인할 수 있습니다.";
  }

  // ========================================
  // 12. 초기 상태
  // ========================================

  update();

  // ========================================
  // 13. 외부에서 사용할 기능
  // ========================================

  return {
    update,

    destroy() {
      container.remove();
    },
  };
}
