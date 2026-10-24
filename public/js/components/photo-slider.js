// ========================================
// 🌱 농사 가이드
// 📸 공통 사진 슬라이더 컴포넌트
// ========================================

// ========================================
// 1. 사진 슬라이더 생성
// ========================================

export function createDiaryPhotoSlider(track) {
  if (!(track instanceof HTMLElement)) {
    throw new Error("사진 슬라이더 영역이 올바르지 않습니다.");
  }

  const slider = document.createElement("div");

  slider.className = "diary-slider";

  track.classList.add("diary-slider-track");

  // ========================================
  // 2. 이전 사진 버튼
  // ========================================

  const prevBtn = document.createElement("button");

  prevBtn.type = "button";
  prevBtn.className = "diary-slider-arrow";
  prevBtn.textContent = "‹";

  prevBtn.setAttribute("aria-label", "이전 사진");

  // ========================================
  // 3. 다음 사진 버튼
  // ========================================

  const nextBtn = document.createElement("button");

  nextBtn.type = "button";
  nextBtn.className = "diary-slider-arrow";
  nextBtn.textContent = "›";

  nextBtn.setAttribute("aria-label", "다음 사진");

  slider.append(prevBtn, track, nextBtn);

  // ========================================
  // 4. 좌우 버튼 상태 갱신
  // ========================================

  function updateButtons() {
    if (!slider.isConnected || slider.hidden) {
      return;
    }

    const maxScroll = track.scrollWidth - track.clientWidth;

    const canScroll = maxScroll > 2;

    prevBtn.hidden = !canScroll;
    nextBtn.hidden = !canScroll;

    prevBtn.disabled = !canScroll || track.scrollLeft <= 1;

    nextBtn.disabled = !canScroll || track.scrollLeft >= maxScroll - 1;
  }

  // ========================================
  // 5. 이전 사진 이동
  // ========================================

  prevBtn.addEventListener("click", () => {
    track.scrollBy({
      left: -track.clientWidth * 0.8,
      behavior: "smooth",
    });
  });

  // ========================================
  // 6. 다음 사진 이동
  // ========================================

  nextBtn.addEventListener("click", () => {
    track.scrollBy({
      left: track.clientWidth * 0.8,
      behavior: "smooth",
    });
  });

  track.addEventListener("scroll", updateButtons);

  // ========================================
  // 7. 마우스 드래그 상태
  // ========================================

  let isMouseDown = false;
  let isDragging = false;

  let startX = 0;
  let startScrollLeft = 0;

  let suppressNextClick = false;

  // ========================================
  // 8. 마우스 누르기
  // 클릭과 드래그 구분
  // ========================================

  track.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    // 버튼 등은 드래그 대상에서 제외
    if (
      event.target instanceof Element &&
      event.target.closest("button, a, input")
    ) {
      return;
    }

    isMouseDown = true;
    isDragging = false;

    startX = event.clientX;
    startScrollLeft = track.scrollLeft;

    // 중요:
    // 클릭 시에는 포인터를 캡처하지 않는다.
  });

  // ========================================
  // 9. 마우스 이동
  // 실제 드래그 시작 시에만 포인터 캡처
  // ========================================

  track.addEventListener("pointermove", (event) => {
    if (!isMouseDown || event.pointerType !== "mouse") {
      return;
    }

    const moveX = event.clientX - startX;

    if (!isDragging && Math.abs(moveX) > 5) {
      isDragging = true;

      track.classList.add("is-dragging");

      track.setPointerCapture(event.pointerId);
    }

    if (!isDragging) {
      return;
    }

    track.scrollLeft = startScrollLeft - moveX;
  });

  // ========================================
  // 10. 마우스 드래그 종료
  // ========================================

  function stopMouseDrag(event) {
    if (!isMouseDown) {
      return;
    }

    if (isDragging) {
      suppressNextClick = true;

      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }

    isMouseDown = false;
    isDragging = false;

    track.classList.remove("is-dragging");

    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }

    requestAnimationFrame(updateButtons);
  }

  track.addEventListener("pointerup", stopMouseDrag);

  track.addEventListener("pointercancel", stopMouseDrag);

  // ========================================
  // 11. 드래그 후 클릭 방지
  // ========================================

  track.addEventListener(
    "click",
    (event) => {
      if (!suppressNextClick) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      suppressNextClick = false;
    },
    true,
  );

  // ========================================
  // 12. 이미지 자체 드래그 방지
  // ========================================

  track.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });

  // ========================================
  // 13. 화면 크기 변경 감지
  // ========================================

  const resizeObserver = new ResizeObserver(() => {
    updateButtons();
  });

  resizeObserver.observe(track);

  // ========================================
  // 14. 사진 추가 및 삭제 감지
  // ========================================

  const mutationObserver = new MutationObserver(() => {
    requestAnimationFrame(updateButtons);
  });

  mutationObserver.observe(track, {
    childList: true,
  });

  // ========================================
  // 15. 슬라이더 정리 함수
  // ========================================

  slider.cleanup = () => {
    resizeObserver.disconnect();

    mutationObserver.disconnect();
  };

  requestAnimationFrame(updateButtons);

  return slider;
}

// ========================================
// 16. 슬라이더 제거
// ========================================

export function destroyDiarySlider(slider) {
  if (!slider) {
    return;
  }

  if (typeof slider.cleanup === "function") {
    slider.cleanup();
  }

  slider.remove();
}

// ========================================
// 17. 목록 내부 슬라이더 정리
// ========================================

export function cleanupDiarySliders(container) {
  if (!container) {
    return;
  }

  container.querySelectorAll(".diary-slider").forEach((slider) => {
    if (typeof slider.cleanup === "function") {
      slider.cleanup();
    }
  });
}
