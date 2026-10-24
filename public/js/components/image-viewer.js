// ========================================
// 🌱 농사 가이드
// 📸 공통 이미지 확대 뷰어
// ========================================

// ========================================
// 1. 이미지 뷰어 상태
// ========================================

let viewer = null;

let viewerImages = [];

let currentImageIndex = 0;

let previousFocusedElement = null;

let previousBodyOverflow = "";

// ========================================
// 2. 이미지 뷰어 생성
// ========================================

function createImageViewer() {
  if (viewer) {
    return viewer;
  }

  // ========================================
  // 전체 화면 배경
  // ========================================

  viewer = document.createElement("div");

  viewer.className = "fg-image-viewer";

  viewer.hidden = true;

  viewer.setAttribute("role", "dialog");

  viewer.setAttribute("aria-modal", "true");

  viewer.setAttribute("aria-label", "사진 확대 보기");

  // ========================================
  // 이미지 뷰어 내부 구조
  // ========================================

  viewer.innerHTML = `
    <div class="fg-image-viewer__dialog">

      <button
        type="button"
        class="fg-image-viewer__close"
        aria-label="사진 확대 화면 닫기"
      >
        ✕
      </button>

      <div class="fg-image-viewer__stage">

        <button
          type="button"
          class="fg-image-viewer__prev"
          aria-label="이전 사진"
        >
          ‹
        </button>

        <img
          class="fg-image-viewer__image"
          alt="확대된 사진"
          draggable="false"
        >

        <button
          type="button"
          class="fg-image-viewer__next"
          aria-label="다음 사진"
        >
          ›
        </button>

      </div>

      <p
        class="fg-image-viewer__counter"
        aria-live="polite"
      ></p>

      <p
        class="fg-image-viewer__message"
        aria-live="polite"
      ></p>

    </div>
  `;

  document.body.appendChild(viewer);

  // ========================================
  // 3. 내부 요소
  // ========================================

  const closeBtn = viewer.querySelector(".fg-image-viewer__close");

  const prevBtn = viewer.querySelector(".fg-image-viewer__prev");

  const nextBtn = viewer.querySelector(".fg-image-viewer__next");

  const image = viewer.querySelector(".fg-image-viewer__image");

  const stage = viewer.querySelector(".fg-image-viewer__stage");

  const message = viewer.querySelector(".fg-image-viewer__message");

  // ========================================
  // 4. 닫기 버튼
  // ========================================

  closeBtn.addEventListener("click", () => {
    closeImageViewer();
  });

  // ========================================
  // 5. 이전 사진
  // ========================================

  prevBtn.addEventListener("click", () => {
    changeImage(-1);
  });

  // ========================================
  // 6. 다음 사진
  // ========================================

  nextBtn.addEventListener("click", () => {
    changeImage(1);
  });

  // ========================================
  // 7. 배경 클릭 시 닫기
  // ========================================

  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) {
      closeImageViewer();
    }
  });

  // ========================================
  // 8. 사진 로딩 오류
  // ========================================

  image.addEventListener("error", () => {
    message.textContent = "사진을 불러오지 못했습니다.";
  });

  image.addEventListener("load", () => {
    message.textContent = "";
  });

  // ========================================
  // 9. 모바일 좌우 스와이프
  // ========================================

  let touchStartX = 0;
  let touchStartY = 0;
  let touchPointerId = null;

  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      return;
    }

    touchPointerId = event.pointerId;

    touchStartX = event.clientX;
    touchStartY = event.clientY;
  });

  stage.addEventListener("pointerup", (event) => {
    if (event.pointerId !== touchPointerId) {
      return;
    }

    touchPointerId = null;

    const distanceX = event.clientX - touchStartX;

    const distanceY = event.clientY - touchStartY;

    // 작은 움직임은 무시
    if (Math.abs(distanceX) < 50) {
      return;
    }

    // 세로 움직임이 더 크면 무시
    if (Math.abs(distanceX) <= Math.abs(distanceY)) {
      return;
    }

    if (distanceX > 0) {
      changeImage(-1);
    } else {
      changeImage(1);
    }
  });

  stage.addEventListener("pointercancel", () => {
    touchPointerId = null;
  });

  // ========================================
  // 10. 키보드 조작
  // ========================================

  document.addEventListener("keydown", (event) => {
    if (!viewer || viewer.hidden) {
      return;
    }

    // ESC 닫기
    if (event.key === "Escape") {
      event.preventDefault();

      closeImageViewer();

      return;
    }

    // 이전 사진
    if (event.key === "ArrowLeft") {
      event.preventDefault();

      changeImage(-1);

      return;
    }

    // 다음 사진
    if (event.key === "ArrowRight") {
      event.preventDefault();

      changeImage(1);

      return;
    }

    // ========================================
    // Tab 키 이동 제한
    // ========================================

    if (event.key === "Tab") {
      const buttons = Array.from(viewer.querySelectorAll("button")).filter(
        (button) => {
          return !button.hidden && !button.disabled;
        },
      );

      if (buttons.length === 0) {
        return;
      }

      const first = buttons[0];

      const last = buttons[buttons.length - 1];

      const active = document.activeElement;

      if (!viewer.contains(active)) {
        event.preventDefault();

        first.focus();

        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();

        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();

        first.focus();
      }
    }
  });

  return viewer;
}

// ========================================
// 11. 현재 사진 표시
// ========================================

function renderCurrentImage() {
  if (!viewer || viewerImages.length === 0) {
    return;
  }

  const image = viewer.querySelector(".fg-image-viewer__image");

  const counter = viewer.querySelector(".fg-image-viewer__counter");

  const prevBtn = viewer.querySelector(".fg-image-viewer__prev");

  const nextBtn = viewer.querySelector(".fg-image-viewer__next");

  const message = viewer.querySelector(".fg-image-viewer__message");

  const current = viewerImages[currentImageIndex];

  // ========================================
  // 이미지 표시
  // ========================================

  message.textContent = "";

  image.src = current.src;

  image.alt = current.alt || "확대된 사진";

  // ========================================
  // 사진 순서
  // ========================================

  counter.textContent = `${currentImageIndex + 1} / ${viewerImages.length}`;

  // ========================================
  // 사진이 한 장인 경우
  // ========================================

  const hasMultiple = viewerImages.length > 1;

  prevBtn.hidden = !hasMultiple;

  nextBtn.hidden = !hasMultiple;
}

// ========================================
// 12. 이전 / 다음 사진 이동
// ========================================

function changeImage(direction) {
  if (viewerImages.length <= 1) {
    return;
  }

  currentImageIndex =
    (currentImageIndex + direction + viewerImages.length) % viewerImages.length;

  renderCurrentImage();
}

// ========================================
// 13. 이미지 뷰어 열기
// ========================================

export function openImageViewer(images, startIndex = 0, trigger = null) {
  if (!Array.isArray(images) || images.length === 0) {
    return;
  }

  // ========================================
  // 이미지 데이터 정리
  // ========================================

  const normalizedImages = images
    .map((item) => {
      if (typeof item === "string") {
        return {
          src: item,
          alt: "확대된 사진",
        };
      }

      return {
        src: item?.src,
        alt: item?.alt || "확대된 사진",
      };
    })
    .filter((item) => {
      return typeof item.src === "string" && item.src.length > 0;
    });

  if (normalizedImages.length === 0) {
    return;
  }

  // ========================================
  // 뷰어 생성
  // ========================================

  createImageViewer();

  const wasHidden = viewer.hidden;

  if (wasHidden) {
    previousFocusedElement =
      trigger instanceof HTMLElement ? trigger : document.activeElement;

    previousBodyOverflow = document.body.style.overflow;
  }

  // ========================================
  // 이미지 목록 설정
  // ========================================

  viewerImages = normalizedImages;

  currentImageIndex =
    Number.isInteger(startIndex) &&
    startIndex >= 0 &&
    startIndex < viewerImages.length
      ? startIndex
      : 0;

  // ========================================
  // 화면 표시
  // ========================================

  viewer.hidden = false;

  document.body.style.overflow = "hidden";

  renderCurrentImage();

  // 닫기 버튼에 키보드 초점
  viewer.querySelector(".fg-image-viewer__close").focus();
}

// ========================================
// 14. 이미지 뷰어 닫기
// ========================================

export function closeImageViewer() {
  if (!viewer || viewer.hidden) {
    return;
  }

  viewer.hidden = true;

  // ========================================
  // 배경 스크롤 복구
  // ========================================

  document.body.style.overflow = previousBodyOverflow;

  // ========================================
  // 이미지 상태 초기화
  // ========================================

  const image = viewer.querySelector(".fg-image-viewer__image");

  image.removeAttribute("src");

  viewerImages = [];

  currentImageIndex = 0;

  // ========================================
  // 이전 위치로 키보드 초점 복구
  // ========================================

  if (
    previousFocusedElement instanceof HTMLElement &&
    previousFocusedElement.isConnected
  ) {
    previousFocusedElement.focus({
      preventScroll: true,
    });
  }

  previousFocusedElement = null;
}
