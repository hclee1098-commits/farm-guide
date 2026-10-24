// ========================================
// 🌱 농사 가이드
// 📸 공통 사진 업로드 컴포넌트
// ========================================

// ========================================
// 1. 공통 사진 업로드 컴포넌트 생성
// ========================================

export function createPhotoUploader({
  input,
  preview,

  maxPhotos = 10,
  maxFileSize = 3 * 1024 * 1024,

  allowedTypes = ["image/jpeg", "image/png", "image/webp"],

  getExistingCount = () => 0,

  canSelect = () => true,

  onBlocked = () => {},
}) {
  // ========================================
  // 2. 요소 검증
  // ========================================

  if (
    !(input instanceof HTMLInputElement) ||
    !(preview instanceof HTMLElement)
  ) {
    throw new Error("사진 업로드 컴포넌트 요소가 올바르지 않습니다.");
  }

  // ========================================
  // 3. 내부 상태
  // ========================================

  let selectedFiles = [];

  let previewUrls = [];

  // ========================================
  // 4. 사진 입력 설정
  // ========================================

  input.multiple = true;

  input.accept = allowedTypes.join(",");

  // ========================================
  // 5. 슬라이더 확인
  // ========================================

  const slider = preview.closest(".diary-slider");

  // ========================================
  // 6. 선택 상태 안내 영역
  // ========================================

  const status = document.createElement("p");

  status.className = "diary-photo-selection-status";

  status.setAttribute("role", "status");

  status.setAttribute("aria-live", "polite");

  status.hidden = true;

  // 미리보기 위에 상태 안내 배치
  if (slider) {
    slider.before(status);
  } else {
    preview.before(status);
  }

  // ========================================
  // 7. 임시 사진 URL 정리
  // ========================================

  function clearPreviewUrls() {
    previewUrls.forEach((url) => {
      URL.revokeObjectURL(url);
    });

    previewUrls = [];
  }

  // ========================================
  // 8. 사진 중복 확인
  // ========================================

  function isSameFile(a, b) {
    return (
      a.name === b.name &&
      a.size === b.size &&
      a.lastModified === b.lastModified
    );
  }

  // ========================================
  // 9. 사진 형식 및 용량 검사
  // ========================================

  function validateFile(file) {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(
        `${file.name}\n\n` + "JPG, PNG, WebP 사진만 등록할 수 있습니다.",
      );
    }

    if (file.size === 0) {
      throw new Error(
        `${file.name}\n\n` + "내용이 없는 사진은 등록할 수 없습니다.",
      );
    }

    if (file.size > maxFileSize) {
      const maxMB = maxFileSize / (1024 * 1024);

      throw new Error(
        `${file.name}\n\n` + `사진 한 장의 크기는 최대 ${maxMB}MB입니다.`,
      );
    }
  }

  // ========================================
  // 10. 선택 상태 안내
  // ========================================

  function updateStatus() {
    const count = selectedFiles.length;

    if (count === 0) {
      status.hidden = true;

      status.textContent = "";

      return;
    }

    status.hidden = false;

    status.textContent =
      `📸 새로 추가할 사진: ${count}장\n` +
      "⚠️ 아직 저장되지 않았습니다. " +
      "아래 저장 버튼을 누르면 등록됩니다.";
  }

  // ========================================
  // 11. 사진 미리보기 표시
  // ========================================

  function render() {
    // 기존 임시 URL 정리
    clearPreviewUrls();

    preview.replaceChildren();

    // ========================================
    // 선택한 사진이 없는 경우
    // ========================================

    if (selectedFiles.length === 0) {
      preview.hidden = true;

      if (slider) {
        slider.hidden = true;
      }

      updateStatus();

      return;
    }

    preview.hidden = false;

    if (slider) {
      slider.hidden = false;
    }

    // ========================================
    // 사진 카드 생성
    // ========================================

    selectedFiles.forEach((file, index) => {
      const item = document.createElement("div");

      item.className = "diary-photo-preview-item";

      // ========================================
      // 사진 이미지
      // ========================================

      const image = document.createElement("img");

      image.className = "diary-photo-preview-image";

      const imageUrl = URL.createObjectURL(file);

      previewUrls.push(imageUrl);

      image.src = imageUrl;

      image.alt = file.name;

      image.draggable = false;

      // ========================================
      // 사진 선택 취소 버튼
      // ========================================

      const removeBtn = document.createElement("button");

      removeBtn.type = "button";

      removeBtn.className = "diary-photo-remove-btn";

      removeBtn.textContent = "✕";

      removeBtn.setAttribute("aria-label", `${file.name} 선택 취소`);

      removeBtn.addEventListener("click", () => {
        if (!canSelect()) {
          onBlocked();

          return;
        }

        selectedFiles.splice(index, 1);

        render();
      });

      // ========================================
      // 파일 이름
      // ========================================

      const fileName = document.createElement("span");

      fileName.className = "diary-photo-file-name";

      fileName.textContent = file.name;

      // ========================================
      // 카드 완성
      // ========================================

      item.append(image, removeBtn, fileName);

      preview.appendChild(item);
    });

    updateStatus();

    // 슬라이더 버튼 상태 갱신
    requestAnimationFrame(() => {
      if (preview.isConnected) {
        preview.dispatchEvent(new Event("scroll"));
      }
    });
  }

  // ========================================
  // 12. 사진 선택 처리
  // ========================================

  function handleFileChange() {
    const files = Array.from(input.files || []);

    // 같은 파일 다시 선택 가능
    input.value = "";

    if (!canSelect()) {
      onBlocked();

      return;
    }

    if (files.length === 0) {
      return;
    }

    try {
      // ========================================
      // 파일 검증
      // ========================================

      files.forEach(validateFile);

      // ========================================
      // 중복 사진 제외
      // ========================================

      const newFiles = [];

      for (const file of files) {
        const alreadySelected = selectedFiles.some((selected) =>
          isSameFile(selected, file),
        );

        const alreadyAdded = newFiles.some((selected) =>
          isSameFile(selected, file),
        );

        if (!alreadySelected && !alreadyAdded) {
          newFiles.push(file);
        }
      }

      // ========================================
      // 기존 사진 개수 확인
      // ========================================

      const existingCount = Number(getExistingCount());

      if (!Number.isSafeInteger(existingCount) || existingCount < 0) {
        throw new Error("기존 사진 개수를 확인할 수 없습니다.");
      }

      // ========================================
      // 최대 사진 개수 검사
      // ========================================

      const newCount = selectedFiles.length + newFiles.length;

      const totalCount = existingCount + newCount;

      if (totalCount > maxPhotos) {
        throw new Error(
          `현재 등록된 사진: ${existingCount}장\n` +
            `새로 선택한 사진: ${newCount}장\n\n` +
            `사진은 최대 ${maxPhotos}장까지 등록할 수 있습니다.`,
        );
      }

      // ========================================
      // 선택한 사진 추가
      // ========================================

      selectedFiles.push(...newFiles);

      render();

      console.log("📸 사진 선택 완료:", selectedFiles.length);
    } catch (error) {
      alert(error.message);
    }
  }

  // ========================================
  // 13. 사진 선택 이벤트
  // ========================================

  input.addEventListener("change", handleFileChange);

  // ========================================
  // 14. 선택한 사진 목록 반환
  // ========================================

  function getFiles() {
    return [...selectedFiles];
  }

  // ========================================
  // 15. 선택한 사진 개수
  // ========================================

  function getCount() {
    return selectedFiles.length;
  }

  // ========================================
  // 16. 사진 선택 초기화
  // ========================================

  function reset() {
    selectedFiles = [];

    input.value = "";

    render();
  }

  // ========================================
  // 17. 컴포넌트 정리
  // ========================================

  function destroy() {
    input.removeEventListener("change", handleFileChange);

    clearPreviewUrls();

    selectedFiles = [];

    preview.replaceChildren();

    preview.hidden = true;

    if (slider) {
      slider.hidden = true;
    }

    status.remove();
  }

  // ========================================
  // 18. 초기 화면 설정
  // ========================================

  render();

  // ========================================
  // 19. 외부에서 사용할 함수
  // ========================================

  return {
    getFiles,
    getCount,
    reset,
    destroy,
  };
}
