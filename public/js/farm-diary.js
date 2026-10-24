// ========================================
// 🌱 농사 가이드
// 📖 재배 일지 관리
// ========================================

// ========================================
// 📸 공통 사진 업로드 상태 컴포넌트
// ========================================

import { createPhotoUploadStatus } from "./components/photo-upload-status.js";

// ========================================
// 🔔 공통 Toast 알림 컴포넌트
// ========================================

import { showToast } from "./components/toast.js";

// ========================================
// 💬 공통 확인 대화상자
// ========================================

import { confirmAction } from "./components/confirm-dialog.js";

// ========================================
// 📸 공통 사진 업로드 컴포넌트
// ========================================

import { createPhotoUploader } from "./components/photo-uploader.js";

// ========================================
// 📸 공통 이미지 확대 컴포넌트
// ========================================

import {
  openImageViewer,
  closeImageViewer,
} from "./components/image-viewer.js";

// ========================================
// 📸 공통 사진 슬라이더 컴포넌트
// ========================================

import {
  createDiaryPhotoSlider,
  destroyDiarySlider,
  cleanupDiarySliders,
} from "./components/photo-slider.js";

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
// 📸 공통 사진 업로드 컴포넌트
// ========================================

let diaryPhotoUploader = null;

// ========================================
// 📸 공통 사진 업로드 상태 컴포넌트
// ========================================

let diaryPhotoStatus = null;

// ========================================
// 📸 사진 저장 상태
// ========================================

let diaryPhotoSaving = false;

// ========================================
// 📸 사진 상태 오류
// ========================================

let diaryPhotoStatusError = "";

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

  const farmId = Number(currentFarmGetter());

  if (!Number.isSafeInteger(farmId) || farmId <= 0) {
    return null;
  }

  return farmId;
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
// 4. 재배 일지 사진 등록 상태 갱신
// ========================================

function refreshDiaryPhotoStatus() {
  // ========================================
  // 컴포넌트 생성 여부 확인
  // ========================================

  if (!diaryPhotoStatus || !diaryPhotoUploader) {
    return;
  }

  // ========================================
  // 기존 등록 사진 개수
  // ========================================

  const savedCount = editingDiaryId !== null ? existingDiaryPhotoCount : 0;

  // ========================================
  // 새로 선택한 사진 개수
  // ========================================

  const pendingCount = diaryPhotoUploader.getCount();

  // ========================================
  // 기존 사진 조회 상태
  // ========================================

  const loading = editingDiaryId !== null && !existingPhotosLoaded;

  // ========================================
  // 공통 상태 컴포넌트 갱신
  // ========================================

  diaryPhotoStatus.update({
    savedCount,

    pendingCount,

    loading,

    saving: diaryPhotoSaving,

    error: diaryPhotoStatusError,
  });
}

// ========================================
// 5. 재배 일지 사진 확대 연결
// ========================================

function enableDiaryImageViewer(image, container) {
  if (!image || !container) {
    return;
  }

  // ========================================
  // 키보드 접근성
  // ========================================

  image.tabIndex = 0;

  image.setAttribute("role", "button");

  image.setAttribute("aria-label", `${image.alt || "사진"} 확대 보기`);

  // ========================================
  // 사진 확대 실행
  // ========================================

  function openViewer() {
    const images = Array.from(container.querySelectorAll("img")).filter(
      (img) => {
        return !img.hidden && Boolean(img.src);
      },
    );

    if (images.length === 0) {
      return;
    }

    const index = images.indexOf(image);

    if (index === -1) {
      return;
    }

    // ========================================
    // 공통 이미지 뷰어 데이터
    // ========================================

    const viewerImages = images.map((img) => {
      return {
        src: img.currentSrc || img.src,

        alt: img.alt || "재배 일지 사진",
      };
    });

    // ========================================
    // 이미지 확대
    // ========================================

    openImageViewer(viewerImages, index, image);
  }

  // ========================================
  // 마우스 클릭
  // ========================================

  image.addEventListener("click", openViewer);

  // ========================================
  // 키보드 Enter / Space
  // ========================================

  image.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      openViewer();
    }
  });
}

// ========================================
// 6. 재배 일지 목록 갤러리 찾기
// ========================================

function getDiaryListGallery(item) {
  if (!item) {
    return null;
  }

  // ========================================
  // 수정 폼 안의 기존 사진 갤러리와
  // 목록 사진 갤러리를 구분한다.
  // ========================================

  return item.querySelector(":scope > .diary-slider .diary-photo-gallery");
}

// ========================================
// 7. 수정 화면 기존 사진 조회
// ========================================

async function showExistingDiaryPhoto(diary, { preserveError = false } = {}) {
  if (!existingPhotoBox || !existingPhotoList) {
    return;
  }

  // ========================================
  // 이전 사진 조회 요청 무효화
  // ========================================

  const requestId = ++existingPhotoRequestId;

  const photoInput = formControls?.photoInput;

  // ========================================
  // 기존 사진 화면 초기화
  // ========================================

  existingPhotoList.replaceChildren();

  existingDiaryPhotoCount = 0;

  existingPhotosLoaded = false;

  existingPhotoBox.hidden = true;

  // ========================================
  // 오류 상태 초기화
  // ========================================

  if (!preserveError) {
    diaryPhotoStatusError = "";
  }

  refreshDiaryPhotoStatus();

  // ========================================
  // 수정 상태가 아닌 경우
  // ========================================

  if (!diary) {
    existingPhotosLoaded = true;

    existingDiaryPhotoCount = 0;

    if (photoInput) {
      photoInput.disabled = diaryPhotoSaving;
    }

    refreshDiaryPhotoStatus();

    return;
  }

  // ========================================
  // 현재 농장 확인
  // ========================================

  const farmId = getCurrentFarmId();

  if (farmId === null) {
    diaryPhotoStatusError = "농장 정보를 확인할 수 없습니다.";

    refreshDiaryPhotoStatus();

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

  // ========================================
  // 기존 사진 조회 중 표시
  // ========================================

  existingPhotoBox.hidden = false;

  existingPhotoList.textContent = "📸 사진을 불러오는 중...";

  // ========================================
  // 조회 완료 전 사진 추가 방지
  // ========================================

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

    // ========================================
    // 이전 요청 결과 무시
    // ========================================

    if (!isCurrent()) {
      return;
    }

    // ========================================
    // 응답 데이터 검증
    // ========================================

    if (!result.success || !Array.isArray(result.photos)) {
      throw new Error("올바른 사진 목록이 아닙니다.");
    }

    // ========================================
    // 기존 사진 개수 저장
    // ========================================

    existingDiaryPhotoCount = result.photos.length;

    existingPhotosLoaded = true;

    diary.has_photo = existingDiaryPhotoCount > 0 ? 1 : 0;

    // ========================================
    // 사진 등록 상태 갱신
    // ========================================

    refreshDiaryPhotoStatus();

    existingPhotoList.replaceChildren();

    // ========================================
    // 기존 사진이 없는 경우
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

      // ========================================
      // 사진 이미지
      // ========================================

      const image = document.createElement("img");

      image.className = "diary-gallery-image";

      image.src =
        `/api/farms/${farmId}` + `/diaries/${diary.id}` + `/photos/${photo.id}`;

      image.alt = "현재 등록된 재배 일지 사진";

      image.loading = "lazy";

      image.draggable = false;

      // ========================================
      // 기존 사진 확대
      // ========================================

      enableDiaryImageViewer(image, existingPhotoList);

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
          !formControls ||
          formControls.saveBtn.disabled ||
          diaryPhotoSaving ||
          photoMutationInProgress
        ) {
          return;
        }

        // ========================================
        // 공통 삭제 확인창
        // ========================================

        const confirmed = await confirmAction({
          title: "📸 사진 삭제",

          message:
            "이 사진을 삭제하시겠습니까?\n\n" +
            "재배 일지 내용은 삭제되지 않습니다.",

          confirmText: "삭제하기",

          cancelText: "취소",

          variant: "danger",
        });

        if (!confirmed) {
          return;
        }

        // ========================================
        // 확인창이 열린 동안
        // 화면 상태가 변경되었는지 재확인
        // ========================================

        if (
          !isCurrent() ||
          formControls.saveBtn.disabled ||
          diaryPhotoSaving ||
          photoMutationInProgress
        ) {
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

          if (!deleteResponse.ok || deleteResult.success === false) {
            throw new Error(deleteResult.message || "사진 삭제 실패");
          }

          if (!isCurrent()) {
            return;
          }

          // ========================================
          // 확대 화면 닫기
          // ========================================

          closeImageViewer();

          // ========================================
          // 삭제한 사진 제거
          // ========================================

          item.remove();

          existingDiaryPhotoCount = Math.max(0, existingDiaryPhotoCount - 1);

          diary.has_photo = existingDiaryPhotoCount > 0 ? 1 : 0;

          // ========================================
          // 사진 등록 상태 갱신
          // ========================================

          diaryPhotoStatusError = "";

          refreshDiaryPhotoStatus();

          // ========================================
          // 모든 사진 삭제 시 영역 숨김
          // ========================================

          if (existingDiaryPhotoCount === 0) {
            existingPhotoBox.hidden = true;
          }

          // ========================================
          // 목록 사진 갤러리 갱신
          // ========================================

          const gallery = getDiaryListGallery(editingDiaryItem);

          if (gallery) {
            await loadDiaryPhotoGallery(farmId, diary.id, gallery, () =>
              isFarmScreenActive(farmId, session),
            );
          }

          // ========================================
          // 삭제 완료 안내
          // ========================================

          if (isCurrent()) {
            showToast("사진이 삭제되었습니다.", {
              type: "success",
            });
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
              photoInput.disabled = !existingPhotosLoaded;
            }

            refreshDiaryPhotoStatus();
          }
        }
      });

      // ========================================
      // 사진 카드 완성
      // ========================================

      item.append(image, deleteBtn);

      existingPhotoList.appendChild(item);
    });

    console.log("📸 수정 화면 기존 사진:", existingDiaryPhotoCount);
  } catch (error) {
    console.error("기존 사진 조회 오류:", error);

    if (!isCurrent()) {
      return;
    }

    // ========================================
    // 사진 조회 실패 상태
    // ========================================

    existingPhotosLoaded = false;

    existingPhotoList.replaceChildren();

    const errorText = document.createElement("p");

    errorText.textContent = "사진 목록을 불러오지 못했습니다.";

    // ========================================
    // 다시 시도 버튼
    // ========================================

    const retryBtn = document.createElement("button");

    retryBtn.type = "button";

    retryBtn.textContent = "🔄 다시 시도";

    retryBtn.className = "diary-photo-retry-btn";

    retryBtn.addEventListener("click", () => {
      if (!isCurrent() || diaryPhotoSaving || photoMutationInProgress) {
        return;
      }

      showExistingDiaryPhoto(diary);
    });

    existingPhotoList.append(errorText, retryBtn);

    // ========================================
    // 오류 상태 표시
    // ========================================

    diaryPhotoStatusError =
      "기존 사진을 확인하지 못했습니다. 다시 시도해주세요.";

    refreshDiaryPhotoStatus();
  } finally {
    if (isCurrent() && photoInput) {
      photoInput.disabled =
        !existingPhotosLoaded || diaryPhotoSaving || photoMutationInProgress;
    }
  }
}

// ========================================
// 8. 재배 일지 작성 / 수정 폼 닫기
// ========================================

function closeDiaryForm({ force = false } = {}) {
  if (!formControls) {
    return false;
  }

  // ========================================
  // 저장 / 삭제 진행 중 폼 닫기 방지
  // ========================================

  if (!force && (diaryPhotoSaving || photoMutationInProgress)) {
    return false;
  }

  const { form, writeBtn, saveBtn, photoInput, defaultSaveText } = formControls;

  // ========================================
  // 이전 비동기 작업 무효화
  // ========================================

  formRevision++;

  existingPhotoRequestId++;

  // ========================================
  // 수정 카드 상태 복구
  // ========================================

  if (editingDiaryItem) {
    editingDiaryItem.classList.remove("is-editing");

    editingDiaryItem = null;
  }

  // ========================================
  // 작성 폼 원래 위치로 이동
  // ========================================

  if (diaryFormAnchor?.parentNode) {
    diaryFormAnchor.after(form);
  }

  // ========================================
  // 수정 상태 초기화
  // ========================================

  editingDiaryId = null;

  editingDiaryData = null;

  photoMutationInProgress = false;

  // ========================================
  // 사진 저장 상태 초기화
  // ========================================

  diaryPhotoSaving = false;

  diaryPhotoStatusError = "";

  // ========================================
  // 기존 사진 상태 초기화
  // ========================================

  showExistingDiaryPhoto(null);

  // ========================================
  // 입력값 초기화
  // ========================================

  form.reset();

  // ========================================
  // 새로 선택한 사진 초기화
  // ========================================

  diaryPhotoUploader?.reset();

  // ========================================
  // 폼 숨김
  // ========================================

  form.hidden = true;

  writeBtn.setAttribute("aria-expanded", "false");

  // ========================================
  // 버튼 복구
  // ========================================

  saveBtn.disabled = false;

  photoInput.disabled = false;

  saveBtn.textContent = defaultSaveText;

  // ========================================
  // 사진 상태 갱신
  // ========================================

  refreshDiaryPhotoStatus();

  return true;
}

// ========================================
// 9. 재배 일지 목록 사진 갤러리
// 조회 전용 / 삭제 버튼 없음
// ========================================

async function loadDiaryPhotoGallery(farmId, diaryId, gallery, screenCurrent) {
  // ========================================
  // 이전 갤러리 요청 구분
  // ========================================

  const requestId = Number(gallery.dataset.requestId || 0) + 1;

  gallery.dataset.requestId = String(requestId);

  // ========================================
  // 현재 화면 확인
  // ========================================

  const isActive = () => {
    return (
      screenCurrent() &&
      gallery.isConnected &&
      Number(gallery.dataset.requestId) === requestId
    );
  };

  try {
    // ========================================
    // 사진 목록 조회
    // ========================================

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

    // ========================================
    // 기존 갤러리 초기화
    // ========================================

    gallery.replaceChildren();

    // ========================================
    // 사진이 없는 경우
    // ========================================

    if (result.photos.length === 0) {
      const slider = gallery.closest(".diary-slider");

      if (slider) {
        destroyDiarySlider(slider);

        slider.remove();
      }

      return;
    }

    // ========================================
    // 사진 카드 생성
    // ========================================

    result.photos.forEach((photo) => {
      const item = document.createElement("div");

      item.className = "diary-gallery-item";

      item.dataset.photoId = String(photo.id);

      // ========================================
      // 사진 이미지
      // ========================================

      const image = document.createElement("img");

      image.className = "diary-gallery-image";

      image.src =
        `/api/farms/${farmId}` + `/diaries/${diaryId}` + `/photos/${photo.id}`;

      image.alt = "재배 일지 작업 사진";

      image.loading = "lazy";

      image.draggable = false;

      // ========================================
      // 사진 확대 연결
      // ========================================

      enableDiaryImageViewer(image, gallery);

      // ========================================
      // 이미지 로딩 오류
      // ========================================

      image.addEventListener("error", () => {
        console.error("사진 로딩 실패:", photo.id);

        image.hidden = true;
      });

      // ========================================
      // 목록에는 삭제 버튼 없음
      // ========================================

      item.appendChild(image);

      gallery.appendChild(item);
    });

    // ========================================
    // 슬라이더 버튼 상태 갱신
    // ========================================

    requestAnimationFrame(() => {
      if (isActive()) {
        gallery.dispatchEvent(new Event("scroll"));
      }
    });
  } catch (error) {
    console.error("사진 갤러리 조회 오류:", error);

    if (isActive()) {
      gallery.textContent = "사진을 불러오지 못했습니다.";
    }
  }
}

// ========================================
// 10. 재배 일지 목록 조회
// ========================================

export async function loadFarmDiaries(farmId, isCurrent = () => true) {
  const id = Number(farmId);

  // ========================================
  // 농장 ID 검증
  // ========================================

  if (!Number.isSafeInteger(id) || id <= 0) {
    console.error("올바르지 않은 농장 ID:", farmId);

    return;
  }

  // ========================================
  // 재배 일지 목록 영역
  // ========================================

  const diaryList = document.getElementById("detailDiaryList");

  if (!diaryList) {
    console.error("재배 일지 목록 영역이 없습니다.");

    return;
  }

  // ========================================
  // 요청 상태 관리
  // ========================================

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

  // ========================================
  // 수정 폼 보호
  // ========================================

  if (formControls?.form && diaryList.contains(formControls.form)) {
    const closed = closeDiaryForm();

    // ========================================
    // 저장 / 삭제 진행 중이면
    // 목록 갱신으로 폼을 제거하지 않는다.
    // ========================================

    if (!closed) {
      return;
    }
  }

  // ========================================
  // 기존 슬라이더 정리
  // ========================================

  cleanupDiarySliders(diaryList);

  diaryList.textContent = "📖 재배 일지를 불러오는 중...";

  try {
    // ========================================
    // 재배 일지 목록 조회
    // ========================================

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

    // ========================================
    // 목록 초기화
    // ========================================

    diaryList.replaceChildren();

    // ========================================
    // 재배 일지가 없는 경우
    // ========================================

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

      // ========================================
      // 작업 날짜 및 종류
      // ========================================

      const title = document.createElement("h3");

      title.textContent =
        `📅 ${diary.work_date || "날짜 없음"} · ` +
        `${diary.work_type || "작업 종류 미입력"}`;

      // ========================================
      // 작업 내용
      // ========================================

      const memo = document.createElement("p");

      memo.textContent = diary.memo || "작업 내용 없음";

      // ========================================
      // 수정 / 삭제 버튼 영역
      // ========================================

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
        if (!screenCurrent() || diaryPhotoSaving || photoMutationInProgress) {
          return;
        }

        // ========================================
        // 공통 삭제 확인창
        // ========================================

        const confirmed = await confirmAction({
          title: "🗑 재배 일지 삭제",

          message:
            `${diary.work_date} 재배 일지를 삭제하시겠습니까?\n\n` +
            "삭제한 재배 일지는 목록에서 보이지 않게 됩니다.",

          confirmText: "삭제하기",

          cancelText: "취소",

          variant: "danger",
        });

        if (!confirmed) {
          return;
        }

        // ========================================
        // 확인 중 화면 변경 여부 확인
        // ========================================

        if (!screenCurrent() || diaryPhotoSaving || photoMutationInProgress) {
          return;
        }

        deleteBtn.disabled = true;

        try {
          // ========================================
          // 재배 일지 삭제
          // ========================================

          const response = await fetch(`/api/farms/${id}/diaries/${diary.id}`, {
            method: "DELETE",
          });

          const result = await response.json().catch(() => ({}));

          if (!response.ok || result.success === false) {
            throw new Error(result.message || "재배 일지 삭제 실패");
          }

          if (!screenCurrent()) {
            return;
          }

          // ========================================
          // 삭제한 일지를 수정 중이었다면
          // 폼 닫기
          // ========================================

          if (editingDiaryId === diary.id) {
            closeDiaryForm();
          }

          // ========================================
          // 목록 갱신
          // ========================================

          await loadFarmDiaries(id, screenCurrent);

          // ========================================
          // 삭제 완료 안내
          // ========================================

          if (screenCurrent()) {
            showToast("재배 일지가 삭제되었습니다.", {
              type: "success",
            });
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

      // ========================================
      // 버튼 조립
      // ========================================

      actions.append(editBtn, deleteBtn);

      // ========================================
      // 카드 기본 정보
      // ========================================

      item.append(title, memo);

      // ========================================
      // 목록 사진 가로 슬라이더
      // ========================================

      if (diary.has_photo) {
        const gallery = document.createElement("div");

        gallery.className = "diary-photo-gallery";

        gallery.textContent = "📸 사진을 불러오는 중...";

        const slider = createDiaryPhotoSlider(gallery);

        item.appendChild(slider);

        // ========================================
        // 사진 비동기 조회
        // ========================================

        loadDiaryPhotoGallery(id, diary.id, gallery, screenCurrent);
      }

      // ========================================
      // 수정 / 삭제 버튼은 사진 아래
      // ========================================

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
// 11. 재배 일지 인라인 수정
// ========================================

function openEditDiary(diary, item) {
  if (!formControls || !item) {
    return;
  }

  // ========================================
  // 저장 / 삭제 진행 중 수정 차단
  // ========================================

  if (diaryPhotoSaving || photoMutationInProgress) {
    return;
  }

  const { form, writeBtn, saveBtn, dateInput, typeInput, memoInput } =
    formControls;

  // ========================================
  // 기존 폼 정리
  // ========================================

  if (!closeDiaryForm()) {
    return;
  }

  formRevision++;

  // ========================================
  // 수정 대상 설정
  // ========================================

  editingDiaryId = diary.id;

  editingDiaryItem = item;

  editingDiaryData = diary;

  item.classList.add("is-editing");

  // ========================================
  // 기존 데이터 입력
  // ========================================

  dateInput.value = diary.work_date || "";

  // ========================================
  // 기존 작업 종류가 목록에 없는 경우
  // ========================================

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

  // ========================================
  // 해당 카드 안으로 폼 이동
  // ========================================

  const actions = item.querySelector(".diary-actions");

  if (actions) {
    actions.before(form);
  } else {
    item.appendChild(form);
  }

  // ========================================
  // 수정 폼 표시
  // ========================================

  form.hidden = false;

  writeBtn.setAttribute("aria-expanded", "false");

  saveBtn.textContent = "💾 수정 저장";

  // ========================================
  // 기존 사진 조회
  // ========================================

  showExistingDiaryPhoto(diary);

  // ========================================
  // 수정 폼으로 이동
  // ========================================

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
// 12. 재배 일지 작성 폼 초기화
// ========================================

export function initFarmDiary(getFarmId) {
  // ========================================
  // 중복 초기화 방지
  // ========================================

  if (diaryFormInitialized) {
    return;
  }

  // ========================================
  // HTML 요소 조회
  // ========================================

  const writeBtn = document.getElementById("diaryWriteBtn");

  const form = document.getElementById("diaryForm");

  const cancelBtn = document.getElementById("diaryCancelBtn");

  const saveBtn = document.getElementById("diarySaveBtn");

  const dateInput = document.getElementById("diaryWorkDate");

  const typeInput = document.getElementById("diaryWorkType");

  const memoInput = document.getElementById("diaryMemo");

  const photoInput = document.getElementById("diaryPhoto");

  const photoPreview = document.getElementById("diaryPhotoPreview");

  // ========================================
  // 필수 요소 검증
  // ========================================

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

  // ========================================
  // 현재 농장 ID 조회 함수 저장
  // ========================================

  currentFarmGetter = getFarmId;

  // ========================================
  // 사진 입력 설정
  // ========================================

  photoInput.multiple = true;

  photoInput.accept = ALLOWED_DIARY_PHOTO_TYPES.join(",");

  // ========================================
  // 폼 요소 관리
  // ========================================

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
  // 13. 기존 사진 표시 영역 생성
  // ========================================

  existingPhotoBox = document.createElement("div");

  existingPhotoBox.id = "diaryExistingPhoto";

  existingPhotoBox.className = "diary-existing-photo";

  existingPhotoBox.hidden = true;

  // ========================================
  // 기존 사진 제목
  // ========================================

  const existingPhotoTitle = document.createElement("p");

  existingPhotoTitle.textContent = "📸 현재 등록된 사진";

  // ========================================
  // 기존 사진 목록
  // ========================================

  existingPhotoList = document.createElement("div");

  existingPhotoList.className = "diary-existing-photo-list diary-photo-gallery";

  // ========================================
  // 기존 사진 슬라이더
  // ========================================

  const existingSlider = createDiaryPhotoSlider(existingPhotoList);

  existingPhotoBox.append(existingPhotoTitle, existingSlider);

  photoInput.before(existingPhotoBox);

  // ========================================
  // 14. 새 사진 미리보기 슬라이더
  // ========================================

  const previewAnchor = document.createComment("새 사진 미리보기 위치");

  photoPreview.before(previewAnchor);

  const previewSlider = createDiaryPhotoSlider(photoPreview);

  previewAnchor.replaceWith(previewSlider);

  previewSlider.hidden = true;

  photoPreview.hidden = true;

  // ========================================
  // 15. 공통 사진 업로드 상태 컴포넌트
  // ========================================

  // ========================================
  // 상태 컴포넌트는 한 번만 생성
  // ========================================

  diaryPhotoStatus = createPhotoUploadStatus(photoInput, {
    maxPhotos: MAX_DIARY_PHOTOS,
  });

  // ========================================
  // 16. 공통 사진 업로드 컴포넌트
  // ========================================

  diaryPhotoUploader = createPhotoUploader({
    // ========================================
    // 사진 입력 요소
    // ========================================

    input: photoInput,

    // ========================================
    // 사진 미리보기 요소
    // ========================================

    preview: photoPreview,

    // ========================================
    // 최대 사진 개수
    // ========================================

    maxPhotos: MAX_DIARY_PHOTOS,

    // ========================================
    // 사진 최대 크기
    // ========================================

    maxFileSize: MAX_DIARY_PHOTO_SIZE,

    // ========================================
    // 허용 사진 형식
    // ========================================

    allowedTypes: ALLOWED_DIARY_PHOTO_TYPES,

    // ========================================
    // 기존 사진 개수
    // ========================================

    getExistingCount: () => {
      if (editingDiaryId === null) {
        return 0;
      }

      return existingDiaryPhotoCount;
    },

    // ========================================
    // 사진 선택 가능 여부
    // ========================================

    canSelect: () => {
      if (diaryPhotoSaving) {
        return false;
      }

      if (saveBtn.disabled) {
        return false;
      }

      if (photoMutationInProgress) {
        return false;
      }

      if (editingDiaryId !== null && !existingPhotosLoaded) {
        return false;
      }

      return true;
    },

    // ========================================
    // 사진 선택 차단 안내
    // ========================================

    onBlocked: () => {
      if (diaryPhotoSaving) {
        alert("사진을 저장하는 중입니다. 잠시 기다려주세요.");

        return;
      }

      if (photoMutationInProgress) {
        alert("사진 삭제가 완료된 후 추가해주세요.");

        return;
      }

      if (editingDiaryId !== null && !existingPhotosLoaded) {
        alert("기존 사진 목록을 확인한 후 추가해주세요.");
      }
    },

    // ========================================
    // 사진 선택 상태 변경
    // ========================================

    onChange: () => {
      // ========================================
      // 이전 오류 상태 초기화
      // ========================================

      diaryPhotoStatusError = "";

      // ========================================
      // 공통 상태 컴포넌트 갱신
      // ========================================

      refreshDiaryPhotoStatus();
    },

    // ========================================
    // 내부 상태 안내 사용 안 함
    //
    // photo-upload-status.js에서
    // 사진 등록 상태를 표시하므로
    // 중복 안내를 방지한다.
    // ========================================

    showSelectionStatus: false,
  });

  // ========================================
  // 17. 초기 사진 상태 표시
  // ========================================

  refreshDiaryPhotoStatus();

  // ========================================
  // 18. 새 재배 일지 작성 버튼
  // ========================================

  writeBtn.addEventListener("click", () => {
    // ========================================
    // 저장 / 삭제 진행 중 차단
    // ========================================

    if (diaryPhotoSaving || photoMutationInProgress) {
      return;
    }

    // ========================================
    // 작성 폼이 이미 열려 있다면 닫기
    // ========================================

    if (!form.hidden && editingDiaryId === null) {
      closeDiaryForm();

      return;
    }

    // ========================================
    // 기존 폼 초기화
    // ========================================

    if (!closeDiaryForm()) {
      return;
    }

    formRevision++;

    editingDiaryId = null;

    // ========================================
    // 입력값 초기화
    // ========================================

    form.reset();

    diaryPhotoUploader?.reset();

    // ========================================
    // 작성 폼 표시
    // ========================================

    form.hidden = false;

    writeBtn.setAttribute("aria-expanded", "true");

    saveBtn.textContent = formControls.defaultSaveText;

    // ========================================
    // 오늘 날짜 입력
    // ========================================

    const today = new Date();

    const year = today.getFullYear();

    const month = String(today.getMonth() + 1).padStart(2, "0");

    const day = String(today.getDate()).padStart(2, "0");

    dateInput.value = `${year}-${month}-${day}`;

    // ========================================
    // 입력 위치 이동
    // ========================================

    dateInput.focus();

    refreshDiaryPhotoStatus();

    console.log("📖 새 재배 일지 작성");
  });

  // ========================================
  // 19. 작성 / 수정 취소 버튼
  // ========================================

  cancelBtn.addEventListener("click", () => {
    closeDiaryForm();
  });

  // ========================================
  // 20. 재배 일지 저장 / 수정
  // ========================================

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // ========================================
    // 중복 저장 방지
    // ========================================

    if (saveBtn.disabled || diaryPhotoSaving || photoMutationInProgress) {
      return;
    }

    // ========================================
    // 현재 농장 및 폼 상태
    // ========================================

    const farmId = getCurrentFarmId();

    const saveSession = diarySession;

    const saveRevision = formRevision;

    const diaryId = editingDiaryId;

    // ========================================
    // 농장 ID 검증
    // ========================================

    if (farmId === null) {
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

    // ========================================
    // 재배 일지 입력값
    // ========================================

    const work_date = dateInput.value;

    const work_type = typeInput.value;

    const memo = memoInput.value.trim();

    // ========================================
    // 필수 입력 검증
    // ========================================

    if (!work_date || !work_type) {
      alert("작업 날짜와 종류를 입력해주세요.");

      return;
    }

    // ========================================
    // 21. 저장할 사진 목록
    // ========================================

    const photoFiles = diaryPhotoUploader.getFiles();

    // ========================================
    // 기존 사진 개수
    // ========================================

    const existingCount = diaryId !== null ? existingDiaryPhotoCount : 0;

    // ========================================
    // 전체 사진 개수
    // ========================================

    const totalPhotoCount = existingCount + photoFiles.length;

    // ========================================
    // 최대 사진 개수 검증
    // ========================================

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
        file.size === 0 ||
        file.size > MAX_DIARY_PHOTO_SIZE
      ) {
        alert("사진 형식 또는 크기를 확인해주세요.");

        return;
      }
    }

    // ========================================
    // 22. 작성 / 수정 구분
    // ========================================

    const isEditMode = diaryId !== null;

    const method = isEditMode ? "PUT" : "POST";

    const url = isEditMode
      ? `/api/farms/${farmId}/diaries/${diaryId}`
      : `/api/farms/${farmId}/diaries`;

    // ========================================
    // 동일한 폼 작업인지 확인
    // ========================================

    const isSameForm = () => {
      return (
        diarySession === saveSession &&
        formRevision === saveRevision &&
        getCurrentFarmId() === farmId
      );
    };

    // ========================================
    // 현재 농장 화면 확인
    // ========================================

    const isStillCurrent = () => {
      return isSameForm() && isFarmScreenActive(farmId, saveSession);
    };

    // ========================================
    // 23. 저장 중 상태 설정
    // ========================================

    saveBtn.disabled = true;

    photoInput.disabled = true;

    saveBtn.textContent = isEditMode ? "수정 중..." : "저장 중...";

    diaryPhotoSaving = true;

    diaryPhotoStatusError = "";

    refreshDiaryPhotoStatus();

    try {
      // ========================================
      // 24. SQLite 재배 일지 저장 / 수정
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

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message ||
            (isEditMode ? "재배 일지 수정 실패" : "재배 일지 저장 실패"),
        );
      }

      console.log("📖 재배 일지 저장 완료:", result);

      // ========================================
      // 이전 화면 요청이면 중단
      // ========================================

      if (!isStillCurrent()) {
        return;
      }

      // ========================================
      // 저장된 재배 일지 ID
      // ========================================

      const savedDiaryId = isEditMode ? diaryId : Number(result.id);

      // ========================================
      // 25. 사진 여러 장 업로드
      // ========================================

      let photoError = null;

      if (photoFiles.length > 0) {
        try {
          // ========================================
          // 재배 일지 ID 검증
          // ========================================

          if (!Number.isSafeInteger(savedDiaryId) || savedDiaryId <= 0) {
            throw new Error("재배 일지 ID를 확인할 수 없습니다.");
          }

          // ========================================
          // 사진 FormData 생성
          // ========================================

          const formData = new FormData();

          photoFiles.forEach((file) => {
            formData.append("photos", file);
          });

          // ========================================
          // 사진 업로드
          // ========================================

          const photoResponse = await fetch(
            `/api/farms/${farmId}` + `/diaries/${savedDiaryId}/photos`,
            {
              method: "POST",

              body: formData,
            },
          );

          const photoResult = await photoResponse.json().catch(() => ({}));

          if (!photoResponse.ok || photoResult.success === false) {
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

      // ========================================
      // 26. 사진 업로드 실패 처리
      // ========================================

      if (photoError) {
        // ========================================
        // 재배 일지는 이미 저장된 상태
        //
        // 폼을 닫지 않는다.
        // 선택한 사진도 초기화하지 않는다.
        // ========================================

        diaryPhotoSaving = false;

        // ========================================
        // 신규 작성이었다면 수정 모드 전환
        //
        // 다시 저장할 때 POST가 아니라
        // PUT을 사용하여 중복 일지 생성을 방지
        // ========================================

        if (Number.isSafeInteger(savedDiaryId) && savedDiaryId > 0) {
          editingDiaryId = savedDiaryId;

          editingDiaryData = {
            ...(editingDiaryData || {}),

            id: savedDiaryId,

            work_date,

            work_type,

            memo,
          };

          // ========================================
          // 수정 저장 버튼으로 변경
          // ========================================

          saveBtn.textContent = "💾 수정 저장";

          writeBtn.setAttribute("aria-expanded", "false");

          // ========================================
          // 서버에 일부 사진이 저장되었을
          // 가능성이 있으므로 기존 사진 재조회
          //
          // 선택한 사진은 그대로 유지
          // ========================================

          diaryPhotoStatusError =
            "재배 일지는 저장되었지만 사진 업로드를 확인하지 못했습니다. " +
            "등록된 사진을 확인한 후 다시 저장해주세요.";

          await showExistingDiaryPhoto(editingDiaryData, {
            preserveError: true,
          });
        } else {
          // ========================================
          // 서버에서 일지 ID를 반환하지 않은 경우
          //
          // 안전하게 재시도할 수 없으므로
          // 선택 사진을 유지하고 오류 안내
          // ========================================

          diaryPhotoStatusError =
            "재배 일지는 저장되었지만 일지 ID를 확인할 수 없습니다. " +
            "중복 등록을 방지하기 위해 새로 저장하지 말고 목록을 확인해주세요.";
        }

        // ========================================
        // 오류 상태 표시
        // ========================================

        refreshDiaryPhotoStatus();

        // ========================================
        // 중요한 오류는 alert 유지
        // ========================================

        if (isStillCurrent()) {
          alert(
            "재배 일지는 저장되었습니다.\n" +
              "하지만 사진 저장을 완료하지 못했습니다.\n\n" +
              photoError.message +
              "\n\n선택한 사진은 유지됩니다.\n" +
              "서버에 일부 사진이 저장되었을 수도 있으니 " +
              "기존 사진을 확인한 후 다시 시도해주세요.",
          );
        }

        return;
      }

      // ========================================
      // 27. 재배 일지 및 사진 저장 성공
      // ========================================

      diaryPhotoSaving = false;

      diaryPhotoStatusError = "";

      // ========================================
      // 작성 / 수정 폼 닫기
      // ========================================

      if (isSameForm()) {
        closeDiaryForm();
      }

      // ========================================
      // 재배 일지 목록 갱신
      // ========================================

      await loadFarmDiaries(farmId, () =>
        isFarmScreenActive(farmId, saveSession),
      );

      // ========================================
      // 저장 완료 Toast
      // ========================================

      if (isFarmScreenActive(farmId, saveSession)) {
        showToast(
          isEditMode
            ? "재배 일지가 수정되었습니다."
            : "재배 일지가 저장되었습니다.",
          {
            type: "success",
          },
        );
      }
    } catch (error) {
      // ========================================
      // 28. 재배 일지 저장 오류
      // ========================================

      console.error("재배 일지 저장 오류:", error);

      if (isStillCurrent()) {
        alert(error.message);
      }
    } finally {
      // ========================================
      // 29. 저장 상태 종료
      // ========================================

      if (isSameForm()) {
        diaryPhotoSaving = false;

        // ========================================
        // 버튼 복구
        // ========================================

        saveBtn.disabled = false;

        photoInput.disabled =
          photoMutationInProgress ||
          (editingDiaryId !== null && !existingPhotosLoaded);

        // ========================================
        // 저장 버튼 문구 복구
        // ========================================

        saveBtn.textContent =
          editingDiaryId !== null
            ? "💾 수정 저장"
            : formControls.defaultSaveText;

        // ========================================
        // 사진 상태 갱신
        // ========================================

        refreshDiaryPhotoStatus();
      }
    }
  });

  // ========================================
  // 30. 초기화 완료
  // ========================================

  diaryFormInitialized = true;

  console.log("📖 재배 일지 관리 기능 초기화 완료!");
}

// ========================================
// 31. SPA 농장 전환 시 폼 초기화
// ========================================

export function resetFarmDiaryForm() {
  // ========================================
  // 이전 농장 세션 무효화
  // ========================================

  diarySession++;

  // ========================================
  // 이전 목록 요청 무효화
  // ========================================

  diaryListRequestId++;

  // ========================================
  // 이전 사진 조회 요청 무효화
  // ========================================

  existingPhotoRequestId++;

  // ========================================
  // SPA 농장 전환은 강제 초기화
  // ========================================

  closeDiaryForm({
    force: true,
  });

  console.log("📖 재배 일지 입력 폼 초기화 완료!");
}
