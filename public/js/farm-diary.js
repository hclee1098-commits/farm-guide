// ========================================
// 🌱 농사 가이드 - 재배 일지 관리
// ========================================

// ========================================
// 1. 전역 상태 관리
// ========================================

let diaryFormInitialized = false;

let diarySession = 0;
let diaryListRequestId = 0;

let editingDiaryId = null;
let editingDiaryItem = null;
let editingDiaryData = null;

let diaryFormAnchor = null;
let formRevision = 0;

let currentFarmGetter = null;
let formControls = null;

// ========================================
// 📸 새로 선택한 사진 관리
// ========================================

let selectedDiaryPhotos = [];
let photoPreviewUrls = [];

// ========================================
// 📸 기존 사진 관리
// ========================================

let existingPhotoBox = null;
let existingPhotoList = null;

let existingDiaryPhotoCount = 0;
let existingPhotoRequestId = 0;

let existingPhotosLoaded = true;
let photoMutationInProgress = false;

// ========================================
// 📸 사진 제한 설정
// ========================================

const MAX_DIARY_PHOTOS = 10;
const MAX_DIARY_PHOTO_SIZE = 3 * 1024 * 1024;

const ALLOWED_DIARY_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ========================================
// 2. 현재 농장 확인
// ========================================

function getCurrentFarmId() {
  if (typeof currentFarmGetter !== "function") {
    return null;
  }

  return Number(currentFarmGetter());
}

// ========================================
// 3. 현재 농장 화면 확인
// ========================================

function isFarmScreenActive(farmId, session) {
  const farmView = document.getElementById("farmView");

  return (
    diarySession === session &&
    getCurrentFarmId() === farmId &&
    farmView !== null &&
    !farmView.hidden
  );
}

// ========================================
// 📸 사진 가로 슬라이더 생성
// ========================================

function createDiaryPhotoSlider(track) {
  const slider = document.createElement("div");

  slider.className = "diary-slider";

  track.classList.add("diary-slider-track");

  // ========================================
  // 이전 사진 버튼
  // ========================================

  const prevBtn = document.createElement("button");

  prevBtn.type = "button";
  prevBtn.className = "diary-slider-arrow";
  prevBtn.textContent = "‹";

  prevBtn.setAttribute("aria-label", "이전 사진");

  // ========================================
  // 다음 사진 버튼
  // ========================================

  const nextBtn = document.createElement("button");

  nextBtn.type = "button";
  nextBtn.className = "diary-slider-arrow";
  nextBtn.textContent = "›";

  nextBtn.setAttribute("aria-label", "다음 사진");

  slider.append(prevBtn, track, nextBtn);

  // ========================================
  // 좌우 버튼 상태 갱신
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
  // 좌우 화살표 이동
  // ========================================

  prevBtn.addEventListener("click", () => {
    track.scrollBy({
      left: -track.clientWidth * 0.8,
      behavior: "smooth",
    });
  });

  nextBtn.addEventListener("click", () => {
    track.scrollBy({
      left: track.clientWidth * 0.8,
      behavior: "smooth",
    });
  });

  track.addEventListener("scroll", updateButtons);

  // ========================================
  // 🖱 마우스 드래그 기능
  // ========================================

  let isMouseDown = false;
  let isDragging = false;

  let startX = 0;
  let startScrollLeft = 0;

  let suppressNextClick = false;

  // ========================================
  // 마우스 누르기
  // ========================================

  track.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    // 삭제 버튼 등은 드래그 대상에서 제외
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

    track.setPointerCapture(event.pointerId);
  });

  // ========================================
  // 마우스 이동
  // ========================================

  track.addEventListener("pointermove", (event) => {
    if (!isMouseDown || event.pointerType !== "mouse") {
      return;
    }

    const moveX = event.clientX - startX;

    if (!isDragging && Math.abs(moveX) > 5) {
      isDragging = true;

      track.classList.add("is-dragging");
    }

    if (!isDragging) {
      return;
    }

    track.scrollLeft = startScrollLeft - moveX;
  });

  // ========================================
  // 마우스 드래그 종료
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
  // 드래그 후 잘못된 클릭 방지
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
  // 이미지 자체 드래그 방지
  // ========================================

  track.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });

  // ========================================
  // 화면 크기 변경 감지
  // ========================================

  const resizeObserver = new ResizeObserver(() => {
    updateButtons();
  });

  resizeObserver.observe(track);

  // ========================================
  // 사진 추가 및 삭제 감지
  // ========================================

  const mutationObserver = new MutationObserver(() => {
    requestAnimationFrame(updateButtons);
  });

  mutationObserver.observe(track, {
    childList: true,
  });

  // ========================================
  // 슬라이더 제거 시 감시 정리
  // ========================================

  slider.cleanup = () => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };

  requestAnimationFrame(updateButtons);

  return slider;
}

// ========================================
// 📸 슬라이더 정리
// ========================================

function destroyDiarySlider(slider) {
  if (!slider) {
    return;
  }

  if (typeof slider.cleanup === "function") {
    slider.cleanup();
  }

  slider.remove();
}

// ========================================
// 📸 목록 내부 슬라이더 정리
// ========================================

function cleanupDiarySliders(container) {
  if (!container) {
    return;
  }

  container.querySelectorAll(".diary-slider").forEach((slider) => {
    if (typeof slider.cleanup === "function") {
      slider.cleanup();
    }
  });
}

// ========================================
// 📸 새 사진 미리보기 초기화
// ========================================

function resetDiaryPhotoPreview() {
  const preview = document.getElementById("diaryPhotoPreview");

  const photoInput = document.getElementById("diaryPhoto");

  photoPreviewUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });

  photoPreviewUrls = [];
  selectedDiaryPhotos = [];

  if (photoInput) {
    photoInput.value = "";
  }

  if (preview) {
    preview.replaceChildren();
    preview.hidden = true;

    const slider = preview.closest(".diary-slider");

    if (slider) {
      slider.hidden = true;
    }
  }
}

// ========================================
// 📸 새 사진 여러 장 미리보기
// ========================================

function renderDiaryPhotoPreviews() {
  const preview = document.getElementById("diaryPhotoPreview");

  if (!preview) {
    return;
  }

  const slider = preview.closest(".diary-slider");

  // 기존 임시 URL 정리
  photoPreviewUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });

  photoPreviewUrls = [];

  preview.replaceChildren();

  // ========================================
  // 선택한 사진이 없는 경우
  // ========================================

  if (selectedDiaryPhotos.length === 0) {
    preview.hidden = true;

    if (slider) {
      slider.hidden = true;
    }

    return;
  }

  preview.hidden = false;

  if (slider) {
    slider.hidden = false;
  }

  // ========================================
  // 사진 카드 생성
  // ========================================

  selectedDiaryPhotos.forEach((file, index) => {
    const item = document.createElement("div");

    item.className = "diary-photo-preview-item";

    // 사진 이미지
    const image = document.createElement("img");

    image.className = "diary-photo-preview-image";

    const imageUrl = URL.createObjectURL(file);

    photoPreviewUrls.push(imageUrl);

    image.src = imageUrl;
    image.alt = file.name;
    image.draggable = false;

    // ========================================
    // 선택 취소 버튼
    // ========================================

    const removeBtn = document.createElement("button");

    removeBtn.type = "button";
    removeBtn.className = "diary-photo-remove-btn";
    removeBtn.textContent = "✕";

    removeBtn.setAttribute("aria-label", `${file.name} 선택 취소`);

    removeBtn.addEventListener("click", () => {
      if (formControls?.saveBtn.disabled || photoMutationInProgress) {
        return;
      }

      selectedDiaryPhotos.splice(index, 1);

      renderDiaryPhotoPreviews();
    });

    // 파일 이름
    const fileName = document.createElement("span");

    fileName.className = "diary-photo-file-name";
    fileName.textContent = file.name;

    item.append(image, removeBtn, fileName);

    preview.appendChild(item);
  });
}

// ========================================
// 📸 수정 화면 기존 사진 조회
// ========================================

async function showExistingDiaryPhoto(diary) {
  if (!existingPhotoBox || !existingPhotoList) {
    return;
  }

  const requestId = ++existingPhotoRequestId;

  const photoInput = document.getElementById("diaryPhoto");

  existingPhotoList.replaceChildren();

  existingDiaryPhotoCount = 0;
  existingPhotosLoaded = false;

  existingPhotoBox.hidden = true;

  // ========================================
  // 수정 상태가 아닌 경우
  // ========================================

  if (!diary) {
    existingPhotosLoaded = true;

    if (photoInput) {
      photoInput.disabled = false;
    }

    return;
  }

  const farmId = getCurrentFarmId();

  if (!Number.isSafeInteger(farmId) || farmId <= 0) {
    return;
  }

  const session = diarySession;
  const revision = formRevision;

  // ========================================
  // 현재 수정 화면 확인
  // ========================================

  const isCurrent = () => {
    return (
      existingPhotoRequestId === requestId &&
      diarySession === session &&
      formRevision === revision &&
      editingDiaryId === diary.id &&
      getCurrentFarmId() === farmId
    );
  };

  existingPhotoBox.hidden = false;

  existingPhotoList.textContent = "📸 사진을 불러오는 중...";

  // 조회 완료 전 사진 추가 방지
  if (photoInput) {
    photoInput.disabled = true;
  }

  try {
    // ========================================
    // 기존 사진 목록 조회
    // ========================================

    const response = await fetch(
      `/api/farms/${farmId}/diaries/${diary.id}/photos`,
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "사진 목록 조회 실패");
    }

    if (!isCurrent()) {
      return;
    }

    if (!result.success || !Array.isArray(result.photos)) {
      throw new Error("올바른 사진 목록이 아닙니다.");
    }

    // ========================================
    // 기존 사진 개수 저장
    // ========================================

    existingDiaryPhotoCount = result.photos.length;

    existingPhotosLoaded = true;

    diary.has_photo = existingDiaryPhotoCount > 0 ? 1 : 0;

    existingPhotoList.replaceChildren();

    // ========================================
    // 사진이 없는 경우
    // ========================================

    if (existingDiaryPhotoCount === 0) {
      existingPhotoBox.hidden = true;
      return;
    }

    // ========================================
    // 기존 사진 카드 생성
    // ========================================

    result.photos.forEach((photo) => {
      const item = document.createElement("div");

      item.className = "diary-gallery-item";
      item.dataset.photoId = String(photo.id);

      // 사진 이미지
      const image = document.createElement("img");

      image.className = "diary-gallery-image";

      image.src =
        `/api/farms/${farmId}` + `/diaries/${diary.id}` + `/photos/${photo.id}`;

      image.alt = "현재 등록된 재배 일지 사진";
      image.loading = "lazy";
      image.draggable = false;

      // ========================================
      // 사진 개별 삭제 버튼
      // ========================================

      const deleteBtn = document.createElement("button");

      deleteBtn.type = "button";
      deleteBtn.className = "diary-gallery-delete";
      deleteBtn.textContent = "✕";

      deleteBtn.setAttribute("aria-label", `사진 ${photo.id} 삭제`);

      // ========================================
      // 기존 사진 개별 삭제
      // ========================================

      deleteBtn.addEventListener("click", async () => {
        if (
          !isCurrent() ||
          formControls.saveBtn.disabled ||
          photoMutationInProgress
        ) {
          return;
        }

        const confirmed = confirm(
          "이 사진을 삭제하시겠습니까?\n\n" +
            "재배 일지 내용은 삭제되지 않습니다.",
        );

        if (!confirmed) {
          return;
        }

        // ========================================
        // 중복 작업 방지
        // ========================================

        photoMutationInProgress = true;

        deleteBtn.disabled = true;
        formControls.saveBtn.disabled = true;

        if (photoInput) {
          photoInput.disabled = true;
        }

        try {
          // ========================================
          // SQLite 사진 한 장 삭제
          // ========================================

          const deleteResponse = await fetch(
            `/api/farms/${farmId}` +
              `/diaries/${diary.id}` +
              `/photos/${photo.id}`,
            {
              method: "DELETE",
            },
          );

          const deleteResult = await deleteResponse.json().catch(() => ({}));

          if (!deleteResponse.ok) {
            throw new Error(deleteResult.message || "사진 삭제 실패");
          }

          if (!isCurrent()) {
            return;
          }

          // ========================================
          // 삭제한 사진만 제거
          // ========================================

          item.remove();

          existingDiaryPhotoCount = Math.max(0, existingDiaryPhotoCount - 1);

          diary.has_photo = existingDiaryPhotoCount > 0 ? 1 : 0;

          // ========================================
          // 모든 사진 삭제 시 영역 숨김
          // ========================================

          if (existingDiaryPhotoCount === 0) {
            existingPhotoBox.hidden = true;
          }

          // ========================================
          // 목록 사진 갤러리 갱신
          // ========================================

          const gallery = editingDiaryItem?.querySelector(
            ".diary-photo-gallery",
          );

          if (gallery) {
            await loadDiaryPhotoGallery(farmId, diary.id, gallery, () =>
              isFarmScreenActive(farmId, session),
            );
          }

          console.log("🗑 기존 사진 삭제 완료:", photo.id);
        } catch (error) {
          console.error("사진 삭제 오류:", error);

          if (isCurrent()) {
            alert(error.message);
          }
        } finally {
          if (isCurrent()) {
            photoMutationInProgress = false;

            deleteBtn.disabled = false;
            formControls.saveBtn.disabled = false;

            if (photoInput) {
              photoInput.disabled = false;
            }
          }
        }
      });

      item.append(image, deleteBtn);

      existingPhotoList.appendChild(item);
    });

    console.log("📸 수정 화면 기존 사진:", existingDiaryPhotoCount);
  } catch (error) {
    console.error("기존 사진 조회 오류:", error);

    if (isCurrent()) {
      existingPhotoList.textContent = "사진 목록을 불러오지 못했습니다.";
    }
  } finally {
    if (isCurrent() && photoInput) {
      photoInput.disabled = !existingPhotosLoaded;
    }
  }
}

// ========================================
// 4. 재배 일지 작성 / 수정 폼 닫기
// ========================================

function closeDiaryForm() {
  if (!formControls) {
    return;
  }

  const { form, writeBtn, saveBtn, defaultSaveText } = formControls;

  // 이전 작업 무효화
  formRevision++;

  // 수정 카드 상태 복구
  if (editingDiaryItem) {
    editingDiaryItem.classList.remove("is-editing");
    editingDiaryItem = null;
  }

  // 작성 폼 원래 위치로 이동
  if (diaryFormAnchor?.parentNode) {
    diaryFormAnchor.after(form);
  }

  editingDiaryId = null;
  editingDiaryData = null;

  photoMutationInProgress = false;

  // 기존 사진 상태 초기화
  showExistingDiaryPhoto(null);

  // 입력값 초기화
  form.reset();

  resetDiaryPhotoPreview();

  form.hidden = true;

  writeBtn.setAttribute("aria-expanded", "false");

  saveBtn.disabled = false;
  saveBtn.textContent = defaultSaveText;
}

// ========================================
// 📸 재배 일지 목록 사진 갤러리
// 조회 전용 / 삭제 버튼 없음
// ========================================

async function loadDiaryPhotoGallery(farmId, diaryId, gallery, screenCurrent) {
  // 이전 갤러리 요청 구분
  const requestId = Number(gallery.dataset.requestId || 0) + 1;

  gallery.dataset.requestId = String(requestId);

  const isActive = () => {
    return (
      screenCurrent() &&
      gallery.isConnected &&
      Number(gallery.dataset.requestId) === requestId
    );
  };

  try {
    const response = await fetch(
      `/api/farms/${farmId}/diaries/${diaryId}/photos`,
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "사진 목록 조회 실패");
    }

    if (!isActive()) {
      return;
    }

    if (!result.success || !Array.isArray(result.photos)) {
      throw new Error("올바른 사진 목록이 아닙니다.");
    }

    gallery.replaceChildren();

    // ========================================
    // 사진이 없는 경우
    // ========================================

    if (result.photos.length === 0) {
      const slider = gallery.closest(".diary-slider");

      destroyDiarySlider(slider);

      return;
    }

    // ========================================
    // 사진 카드 생성
    // ========================================

    result.photos.forEach((photo) => {
      const item = document.createElement("div");

      item.className = "diary-gallery-item";
      item.dataset.photoId = String(photo.id);

      const image = document.createElement("img");

      image.className = "diary-gallery-image";

      image.src =
        `/api/farms/${farmId}` + `/diaries/${diaryId}` + `/photos/${photo.id}`;

      image.alt = "재배 일지 작업 사진";
      image.loading = "lazy";
      image.draggable = false;

      image.addEventListener("error", () => {
        console.error("사진 로딩 실패:", photo.id);

        image.hidden = true;
      });

      // 목록에는 삭제 버튼 없음
      item.appendChild(image);

      gallery.appendChild(item);
    });
  } catch (error) {
    console.error("사진 갤러리 조회 오류:", error);

    if (isActive()) {
      gallery.textContent = "사진을 불러오지 못했습니다.";
    }
  }
}

// ========================================
// 5. 재배 일지 목록 조회
// ========================================

export async function loadFarmDiaries(farmId, isCurrent = () => true) {
  const id = Number(farmId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    console.error("올바르지 않은 농장 ID:", farmId);

    return;
  }

  const diaryList = document.getElementById("detailDiaryList");

  if (!diaryList) {
    console.error("재배 일지 목록 영역이 없습니다.");

    return;
  }

  const requestSession = diarySession;
  const currentRequest = ++diaryListRequestId;

  const canRender = () => {
    return (
      isCurrent() &&
      diarySession === requestSession &&
      currentRequest === diaryListRequestId
    );
  };

  const screenCurrent = () => {
    return isCurrent() && isFarmScreenActive(id, requestSession);
  };

  if (!canRender()) {
    return;
  }

  // 수정 폼 보호
  if (formControls?.form && diaryList.contains(formControls.form)) {
    closeDiaryForm();
  }

  // 기존 슬라이더 감시 정리
  cleanupDiarySliders(diaryList);

  diaryList.textContent = "📖 재배 일지를 불러오는 중...";

  try {
    const response = await fetch(`/api/farms/${id}/diaries`);

    if (!response.ok) {
      throw new Error("재배 일지 조회 실패");
    }

    const diaries = await response.json();

    if (!canRender()) {
      return;
    }

    if (!Array.isArray(diaries)) {
      throw new Error("올바른 재배 일지 데이터가 아닙니다.");
    }

    diaryList.replaceChildren();

    if (diaries.length === 0) {
      diaryList.textContent = "아직 등록된 재배 일지가 없습니다.";

      return;
    }

    // ========================================
    // 재배 일지 카드 생성
    // ========================================

    diaries.forEach((diary) => {
      const item = document.createElement("div");

      item.className = "diary-item";

      // 작업 날짜 및 종류
      const title = document.createElement("h3");

      title.textContent =
        `📅 ${diary.work_date || "날짜 없음"} · ` +
        `${diary.work_type || "작업 종류 미입력"}`;

      // 작업 내용
      const memo = document.createElement("p");

      memo.textContent = diary.memo || "작업 내용 없음";

      // 수정 / 삭제 버튼 영역
      const actions = document.createElement("div");

      actions.className = "diary-actions";

      // ========================================
      // 수정 버튼
      // ========================================

      const editBtn = document.createElement("button");

      editBtn.type = "button";
      editBtn.className = "diary-edit-btn";
      editBtn.textContent = "✏️ 수정";

      editBtn.addEventListener("click", () => {
        if (!screenCurrent()) {
          return;
        }

        openEditDiary(diary, item);
      });

      // ========================================
      // 재배 일지 삭제 버튼
      // ========================================

      const deleteBtn = document.createElement("button");

      deleteBtn.type = "button";
      deleteBtn.className = "diary-delete-btn";
      deleteBtn.textContent = "🗑 삭제";

      deleteBtn.addEventListener("click", async () => {
        if (!screenCurrent()) {
          return;
        }

        const confirmed = confirm(
          `${diary.work_date} 재배 일지를 삭제하시겠습니까?`,
        );

        if (!confirmed) {
          return;
        }

        deleteBtn.disabled = true;

        try {
          const response = await fetch(`/api/farms/${id}/diaries/${diary.id}`, {
            method: "DELETE",
          });

          const result = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(result.message || "재배 일지 삭제 실패");
          }

          if (!screenCurrent()) {
            return;
          }

          if (editingDiaryId === diary.id) {
            closeDiaryForm();
          }

          await loadFarmDiaries(id, screenCurrent);

          if (screenCurrent()) {
            alert("재배 일지가 삭제되었습니다.");
          }
        } catch (error) {
          console.error("재배 일지 삭제 오류:", error);

          if (screenCurrent()) {
            alert(error.message);
          }
        } finally {
          deleteBtn.disabled = false;
        }
      });

      actions.append(editBtn, deleteBtn);

      item.append(title, memo);

      // ========================================
      // 📸 목록 사진 가로 슬라이더
      // ========================================

      if (diary.has_photo) {
        const gallery = document.createElement("div");

        gallery.className = "diary-photo-gallery";

        gallery.textContent = "📸 사진을 불러오는 중...";

        const slider = createDiaryPhotoSlider(gallery);

        item.appendChild(slider);

        // 비동기 사진 조회
        loadDiaryPhotoGallery(id, diary.id, gallery, screenCurrent);
      }

      // 수정 / 삭제 버튼은 사진 아래
      item.appendChild(actions);

      diaryList.appendChild(item);
    });

    console.log("📖 재배 일지 표시 완료:", diaries.length);
  } catch (error) {
    if (!canRender()) {
      return;
    }

    console.error("재배 일지 조회 오류:", error);

    diaryList.textContent = "재배 일지를 불러오지 못했습니다.";
  }
}

// ========================================
// 6. 재배 일지 인라인 수정
// ========================================

function openEditDiary(diary, item) {
  if (!formControls || !item) {
    return;
  }

  const { form, writeBtn, saveBtn, dateInput, typeInput, memoInput } =
    formControls;

  // 기존 폼 정리
  closeDiaryForm();

  formRevision++;

  editingDiaryId = diary.id;
  editingDiaryItem = item;
  editingDiaryData = diary;

  item.classList.add("is-editing");

  // 기존 데이터 입력
  dateInput.value = diary.work_date || "";

  if (
    diary.work_type &&
    typeInput instanceof HTMLSelectElement &&
    !Array.from(typeInput.options).some(
      (option) => option.value === diary.work_type,
    )
  ) {
    typeInput.add(new Option(diary.work_type, diary.work_type));
  }

  typeInput.value = diary.work_type || "";
  memoInput.value = diary.memo || "";

  // 해당 카드 안으로 폼 이동
  const actions = item.querySelector(".diary-actions");

  if (actions) {
    actions.before(form);
  } else {
    item.appendChild(form);
  }

  form.hidden = false;

  writeBtn.setAttribute("aria-expanded", "false");

  saveBtn.textContent = "💾 수정 저장";

  // ========================================
  // 기존 사진 여러 장 조회
  // ========================================

  showExistingDiaryPhoto(diary);

  form.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  dateInput.focus({
    preventScroll: true,
  });

  console.log("✏️ 재배 일지 수정 시작:", diary.id);
}

// ========================================
// 7. 재배 일지 작성 폼 초기화
// ========================================

export function initFarmDiary(getFarmId) {
  if (diaryFormInitialized) {
    return;
  }

  const writeBtn = document.getElementById("diaryWriteBtn");

  const form = document.getElementById("diaryForm");

  const cancelBtn = document.getElementById("diaryCancelBtn");

  const saveBtn = document.getElementById("diarySaveBtn");

  const dateInput = document.getElementById("diaryWorkDate");

  const typeInput = document.getElementById("diaryWorkType");

  const memoInput = document.getElementById("diaryMemo");

  const photoInput = document.getElementById("diaryPhoto");

  const photoPreview = document.getElementById("diaryPhotoPreview");

  if (
    !writeBtn ||
    !form ||
    !cancelBtn ||
    !saveBtn ||
    !dateInput ||
    !typeInput ||
    !memoInput ||
    !photoInput ||
    !photoPreview
  ) {
    console.error("재배 일지 작성 폼을 찾을 수 없습니다.");

    return;
  }

  currentFarmGetter = getFarmId;

  // 여러 장 선택 허용
  photoInput.multiple = true;

  photoInput.accept = "image/jpeg,image/png,image/webp";

  formControls = {
    writeBtn,
    form,
    cancelBtn,
    saveBtn,
    dateInput,
    typeInput,
    memoInput,
    photoInput,
    defaultSaveText: saveBtn.textContent,
  };

  // ========================================
  // 작성 폼 원래 위치 기억
  // ========================================

  diaryFormAnchor = document.createComment("재배 일지 작성 폼 원래 위치");

  form.before(diaryFormAnchor);

  // ========================================
  // 📸 기존 사진 표시 영역 생성
  // ========================================

  existingPhotoBox = document.createElement("div");

  existingPhotoBox.id = "diaryExistingPhoto";

  existingPhotoBox.className = "diary-existing-photo";

  existingPhotoBox.hidden = true;

  // 제목
  const existingPhotoTitle = document.createElement("p");

  existingPhotoTitle.textContent = "📸 현재 등록된 사진";

  // 기존 사진 목록
  existingPhotoList = document.createElement("div");

  existingPhotoList.className = "diary-existing-photo-list diary-photo-gallery";

  // ========================================
  // 기존 사진 가로 슬라이더 연결
  // ========================================

  const existingSlider = createDiaryPhotoSlider(existingPhotoList);

  existingPhotoBox.append(existingPhotoTitle, existingSlider);

  photoInput.before(existingPhotoBox);

  // ========================================
  // 📸 새 사진 미리보기 슬라이더
  // ========================================

  // 원래 위치에 임시 표시를 먼저 생성
  const previewAnchor = document.createComment("새 사진 미리보기 위치");

  photoPreview.before(previewAnchor);

  const previewSlider = createDiaryPhotoSlider(photoPreview);

  // 슬라이더를 원래 미리보기 위치에 삽입
  previewAnchor.replaceWith(previewSlider);

  previewSlider.hidden = true;

  photoPreview.hidden = true;

  // ========================================
  // 📸 사진 여러 장 선택
  // ========================================

  photoInput.addEventListener("change", () => {
    if (saveBtn.disabled || photoMutationInProgress) {
      photoInput.value = "";
      return;
    }

    // 기존 사진 조회 실패 시 추가 금지
    if (editingDiaryId !== null && !existingPhotosLoaded) {
      photoInput.value = "";

      alert("기존 사진 목록을 확인한 후 추가해주세요.");

      return;
    }

    const files = Array.from(photoInput.files || []);

    photoInput.value = "";

    if (files.length === 0) {
      return;
    }

    // ========================================
    // 파일 형식 및 크기 검사
    // ========================================

    for (const file of files) {
      if (!ALLOWED_DIARY_PHOTO_TYPES.includes(file.type)) {
        alert("JPG, PNG, WebP 사진만 등록할 수 있습니다.");

        return;
      }

      if (file.size > MAX_DIARY_PHOTO_SIZE) {
        alert(`${file.name}\n` + "사진 크기는 최대 3MB까지 가능합니다.");

        return;
      }
    }

    // ========================================
    // 중복 사진 제외
    // ========================================

    const newFiles = [];

    const isSameFile = (a, b) => {
      return (
        a.name === b.name &&
        a.size === b.size &&
        a.lastModified === b.lastModified
      );
    };

    for (const file of files) {
      const alreadySelected = selectedDiaryPhotos.some((selected) =>
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
    // 기존 사진 + 새 사진 최대 10장
    // ========================================

    const existingCount = editingDiaryId !== null ? existingDiaryPhotoCount : 0;

    const newCount = selectedDiaryPhotos.length + newFiles.length;

    const totalCount = existingCount + newCount;

    if (totalCount > MAX_DIARY_PHOTOS) {
      alert(
        `현재 등록된 사진: ${existingCount}장\n` +
          `새로 선택한 사진: ${newCount}장\n\n` +
          `재배 일지에는 최대 ${MAX_DIARY_PHOTOS}장까지 등록할 수 있습니다.`,
      );

      return;
    }

    selectedDiaryPhotos.push(...newFiles);

    renderDiaryPhotoPreviews();

    console.log("📸 새로 선택한 사진:", selectedDiaryPhotos.length);
  });

  // ========================================
  // 8. 새 일지 작성 버튼
  // ========================================

  writeBtn.addEventListener("click", () => {
    if (!form.hidden && editingDiaryId === null) {
      closeDiaryForm();
      return;
    }

    closeDiaryForm();

    formRevision++;

    editingDiaryId = null;

    form.reset();

    resetDiaryPhotoPreview();

    form.hidden = false;

    writeBtn.setAttribute("aria-expanded", "true");

    saveBtn.textContent = formControls.defaultSaveText;

    // 오늘 날짜
    const today = new Date();

    const year = today.getFullYear();

    const month = String(today.getMonth() + 1).padStart(2, "0");

    const day = String(today.getDate()).padStart(2, "0");

    dateInput.value = `${year}-${month}-${day}`;

    dateInput.focus();

    console.log("📖 새 재배 일지 작성");
  });

  // ========================================
  // 9. 취소 버튼
  // ========================================

  cancelBtn.addEventListener("click", () => {
    closeDiaryForm();
  });

  // ========================================
  // 10. 재배 일지 저장 / 수정
  // ========================================

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (saveBtn.disabled || photoMutationInProgress) {
      return;
    }

    const farmId = getCurrentFarmId();

    const saveSession = diarySession;
    const saveRevision = formRevision;

    const diaryId = editingDiaryId;

    if (!Number.isSafeInteger(farmId) || farmId <= 0) {
      alert("농장 정보를 확인할 수 없습니다.");

      return;
    }

    // ========================================
    // 기존 사진 조회 완료 확인
    // ========================================

    if (diaryId !== null && !existingPhotosLoaded) {
      alert("기존 사진 목록을 불러온 후 저장해주세요.");

      return;
    }

    const work_date = dateInput.value;
    const work_type = typeInput.value;
    const memo = memoInput.value.trim();

    if (!work_date || !work_type) {
      alert("작업 날짜와 종류를 입력해주세요.");

      return;
    }

    // ========================================
    // 저장할 사진 목록 복사
    // ========================================

    const photoFiles = [...selectedDiaryPhotos];

    const existingCount = diaryId !== null ? existingDiaryPhotoCount : 0;

    const totalPhotoCount = existingCount + photoFiles.length;

    if (totalPhotoCount > MAX_DIARY_PHOTOS) {
      alert(
        `현재 사진은 총 ${totalPhotoCount}장입니다.\n` +
          `최대 ${MAX_DIARY_PHOTOS}장까지 등록할 수 있습니다.`,
      );

      return;
    }

    // ========================================
    // 사진 형식 및 크기 재검사
    // ========================================

    for (const file of photoFiles) {
      if (
        !ALLOWED_DIARY_PHOTO_TYPES.includes(file.type) ||
        file.size > MAX_DIARY_PHOTO_SIZE
      ) {
        alert("사진 형식 또는 크기를 확인해주세요.");

        return;
      }
    }

    // ========================================
    // 작성 / 수정 구분
    // ========================================

    const isEditMode = diaryId !== null;

    const method = isEditMode ? "PUT" : "POST";

    const url = isEditMode
      ? `/api/farms/${farmId}/diaries/${diaryId}`
      : `/api/farms/${farmId}/diaries`;

    const isStillCurrent = () => {
      return isFarmScreenActive(farmId, saveSession);
    };

    saveBtn.disabled = true;
    photoInput.disabled = true;

    saveBtn.textContent = isEditMode ? "수정 중..." : "저장 중...";

    try {
      // ========================================
      // SQLite 재배 일지 저장 / 수정
      // ========================================

      const response = await fetch(url, {
        method,

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          work_date,
          work_type,
          memo,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.message ||
            (isEditMode ? "재배 일지 수정 실패" : "재배 일지 저장 실패"),
        );
      }

      console.log("📖 재배 일지 저장 완료:", result);

      // ========================================
      // 📸 사진 여러 장 업로드
      // ========================================

      let photoError = null;

      if (photoFiles.length > 0) {
        try {
          const savedDiaryId = isEditMode ? diaryId : Number(result.id);

          if (!Number.isSafeInteger(savedDiaryId) || savedDiaryId <= 0) {
            throw new Error("재배 일지 ID를 확인할 수 없습니다.");
          }

          const formData = new FormData();

          photoFiles.forEach((file) => {
            formData.append("photos", file);
          });

          const photoResponse = await fetch(
            `/api/farms/${farmId}` + `/diaries/${savedDiaryId}/photos`,
            {
              method: "POST",
              body: formData,
            },
          );

          const photoResult = await photoResponse.json().catch(() => ({}));

          if (!photoResponse.ok) {
            throw new Error(photoResult.message || "사진 저장에 실패했습니다.");
          }

          console.log(
            "📸 사진 업로드 완료:",
            savedDiaryId,
            photoResult.uploadedCount,
          );
        } catch (error) {
          console.error("사진 업로드 오류:", error);

          photoError = error;
        }
      }

      // ========================================
      // 현재 화면 확인
      // ========================================

      if (!isStillCurrent()) {
        return;
      }

      // 작성 / 수정 폼 닫기
      if (formRevision === saveRevision) {
        closeDiaryForm();
      }

      // ========================================
      // 재배 일지 목록 갱신
      // ========================================

      await loadFarmDiaries(farmId, isStillCurrent);

      // ========================================
      // 저장 결과 안내
      // ========================================

      if (isStillCurrent()) {
        if (photoError) {
          alert(
            "재배 일지는 정상적으로 저장되었습니다.\n" +
              "하지만 사진 저장에 실패했습니다.\n\n" +
              photoError.message,
          );
        } else {
          alert(
            isEditMode
              ? "✏️ 재배 일지가 수정되었습니다!"
              : "🌱 재배 일지가 저장되었습니다!",
          );
        }
      }
    } catch (error) {
      console.error("재배 일지 저장 오류:", error);

      if (isStillCurrent()) {
        alert(error.message);
      }
    } finally {
      if (isStillCurrent() && formRevision === saveRevision) {
        saveBtn.disabled = false;
        photoInput.disabled = false;

        saveBtn.textContent = isEditMode
          ? "💾 수정 저장"
          : formControls.defaultSaveText;
      }
    }
  });

  diaryFormInitialized = true;

  console.log("📖 재배 일지 관리 기능 초기화 완료!");
}

// ========================================
// 11. SPA 농장 전환 시 폼 초기화
// ========================================

export function resetFarmDiaryForm() {
  diarySession++;

  diaryListRequestId++;

  closeDiaryForm();

  console.log("📖 재배 일지 입력 폼 초기화 완료!");
}
