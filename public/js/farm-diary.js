// ========================================
// 🌱 농사 가이드 - 재배 일지 관리
// ========================================

// ========================================
// 1. 전역 상태 관리
// ========================================

// 이벤트 중복 등록 방지
let diaryFormInitialized = false;

// ========================================
// 📸 재배 일지 사진 여러 장 관리
// ========================================

// 현재 선택한 사진 목록
let selectedDiaryPhotos = [];

// 사진 미리보기 URL 목록
let photoPreviewUrls = [];

// ========================================
// 📸 사진 미리보기 초기화
// ========================================

function resetDiaryPhotoPreview() {
  const preview = document.getElementById("diaryPhotoPreview");

  const photoInput = document.getElementById("diaryPhoto");

  // ========================================
  // 1. 기존 미리보기 URL 해제
  // ========================================

  photoPreviewUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });

  photoPreviewUrls = [];

  // ========================================
  // 2. 선택한 사진 목록 초기화
  // ========================================

  selectedDiaryPhotos = [];

  // ========================================
  // 3. 파일 입력 초기화
  // ========================================

  if (photoInput) {
    photoInput.value = "";
  }

  // ========================================
  // 4. 미리보기 화면 초기화
  // ========================================

  if (preview) {
    preview.replaceChildren();

    preview.hidden = true;
  }
}

// ========================================
// 📸 선택한 사진 여러 장 미리보기
// ========================================

function renderDiaryPhotoPreviews() {
  const preview = document.getElementById("diaryPhotoPreview");

  if (!preview) {
    return;
  }

  // ========================================
  // 1. 기존 미리보기 URL 정리
  // ========================================

  photoPreviewUrls.forEach((url) => {
    URL.revokeObjectURL(url);
  });

  photoPreviewUrls = [];

  // ========================================
  // 2. 기존 미리보기 화면 초기화
  // ========================================

  preview.replaceChildren();

  // ========================================
  // 3. 선택한 사진이 없는 경우
  // ========================================

  if (selectedDiaryPhotos.length === 0) {
    preview.hidden = true;

    return;
  }

  preview.hidden = false;

  // ========================================
  // 4. 선택한 사진별 미리보기 생성
  // ========================================

  selectedDiaryPhotos.forEach((file, index) => {
    // 사진 카드
    const item = document.createElement("div");

    item.className = "diary-photo-preview-item";

    // ========================================
    // 사진 미리보기 이미지
    // ========================================

    const image = document.createElement("img");

    image.className = "diary-photo-preview-image";

    // 임시 이미지 URL 생성
    const imageUrl = URL.createObjectURL(file);

    photoPreviewUrls.push(imageUrl);

    image.src = imageUrl;

    image.alt = file.name;

    // ========================================
    // 사진 제거 버튼
    // ========================================

    const removeBtn = document.createElement("button");

    removeBtn.type = "button";

    removeBtn.className = "diary-photo-remove-btn";

    removeBtn.textContent = "✕";

    removeBtn.setAttribute("aria-label", `${file.name} 선택 취소`);

    // ========================================
    // 선택한 사진 개별 제거
    // ========================================

    removeBtn.addEventListener("click", () => {
      // 선택한 사진 목록에서 제거
      selectedDiaryPhotos.splice(index, 1);

      // 미리보기 다시 표시
      renderDiaryPhotoPreviews();

      console.log("📸 선택한 사진 제거:", file.name);
    });

    // ========================================
    // 사진 이름 표시
    // ========================================

    const fileName = document.createElement("span");

    fileName.className = "diary-photo-file-name";

    fileName.textContent = file.name;

    // ========================================
    // 카드 구성
    // ========================================

    item.appendChild(image);

    item.appendChild(removeBtn);

    item.appendChild(fileName);

    preview.appendChild(item);
  });

  console.log("📸 사진 미리보기 표시:", selectedDiaryPhotos.length);
}

// SPA 농장 화면 전환 구분 번호
let diarySession = 0;

// 재배 일지 조회 요청 구분 번호
let diaryListRequestId = 0;

// 현재 수정 중인 재배 일지 ID
// null이면 새로운 일지 작성
let editingDiaryId = null;

// ========================================
// ✏️ 인라인 수정 화면 관리
// ========================================

// 작성 폼의 원래 위치
let diaryFormAnchor = null;

// 현재 수정 중인 재배 일지 카드
let editingDiaryItem = null;

// 작성 폼 변경 구분 번호
let formRevision = 0;

// 현재 농장 ID 조회 함수
let currentFarmGetter = null;

// 재배 일지 입력 폼 요소
let formControls = null;

// ========================================
// 📸 기존 재배 일지 사진 관리
// ========================================

// 기존 사진 표시 영역
let existingPhotoBox = null;

// 기존 사진 이미지
let existingPhotoImage = null;

// 기존 사진 삭제 버튼
let existingPhotoDeleteButton = null;

// 현재 수정 중인 일지 데이터
let editingDiaryData = null;

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
// 3. 현재 농장 화면인지 확인
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
// 📸 수정 화면에서 기존 사진 표시
// ========================================

function showExistingDiaryPhoto(diary) {
  if (!existingPhotoBox || !existingPhotoImage || !existingPhotoDeleteButton) {
    return;
  }

  // ========================================
  // 사진 존재 여부
  // ========================================

  const hasPhoto = Boolean(diary?.has_photo);

  // 사진이 없으면 영역 숨기기
  existingPhotoBox.hidden = !hasPhoto;

  existingPhotoDeleteButton.disabled = !hasPhoto;

  if (!hasPhoto) {
    existingPhotoImage.removeAttribute("src");
    return;
  }

  // ========================================
  // 현재 농장 ID
  // ========================================

  const farmId = getCurrentFarmId();

  if (!Number.isSafeInteger(farmId) || farmId <= 0) {
    existingPhotoBox.hidden = true;
    return;
  }

  // ========================================
  // 기존 사진 조회 API 연결
  // ========================================

  existingPhotoImage.src = `/api/farms/${farmId}/diaries/${diary.id}/photo`;

  console.log("📸 기존 재배 일지 사진 표시:", diary.id);
}

// ========================================
// 4. 재배 일지 작성 / 수정 폼 닫기
// ========================================

function closeDiaryForm() {
  if (!formControls) {
    return;
  }

  const { form, writeBtn, saveBtn, defaultSaveText } = formControls;

  // ========================================
  // 1. 이전 폼 작업 무효화
  // ========================================

  formRevision++;

  // ========================================
  // 2. 수정 중인 카드 상태 복구
  // ========================================

  if (editingDiaryItem) {
    editingDiaryItem.classList.remove("is-editing");

    editingDiaryItem = null;
  }

  // ========================================
  // 3. 작성 폼 원래 위치로 이동
  // ========================================

  if (diaryFormAnchor?.parentNode) {
    diaryFormAnchor.after(form);
  }

  // ========================================
  // 4. 수정 상태 초기화
  // ========================================

  editingDiaryId = null;

  // 수정 중인 일지 데이터 초기화
  editingDiaryData = null;

  // 기존 사진 표시 초기화
  showExistingDiaryPhoto(null);

  // ========================================
  // 5. 입력값 초기화
  // ========================================

  form.reset();

  // 사진 미리보기 초기화
  resetDiaryPhotoPreview();

  // ========================================
  // 6. 작성 폼 숨기기
  // ========================================

  form.hidden = true;

  writeBtn.setAttribute("aria-expanded", "false");

  // ========================================
  // 7. 저장 버튼 초기화
  // ========================================

  saveBtn.disabled = false;

  saveBtn.textContent = defaultSaveText;
}

// ========================================
// 📸 재배 일지 사진 갤러리
// 여러 장 조회 및 개별 삭제
// ========================================

async function loadDiaryPhotoGallery(farmId, diaryId, gallery, screenCurrent) {
  // ========================================
  // 1. 현재 화면 확인
  // ========================================

  const isActive = () => {
    return screenCurrent() && gallery.isConnected;
  };

  try {
    // ========================================
    // 2. 사진 목록 조회
    // ========================================

    const response = await fetch(
      `/api/farms/${farmId}/diaries/${diaryId}/photos`,
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "사진 목록 조회 실패");
    }

    // 다른 농장으로 이동했다면 중단
    if (!isActive()) {
      return;
    }

    // ========================================
    // 3. 사진 데이터 확인
    // ========================================

    if (!result.success || !Array.isArray(result.photos)) {
      throw new Error("올바른 사진 목록이 아닙니다.");
    }

    // ========================================
    // 4. 기존 갤러리 초기화
    // ========================================

    gallery.replaceChildren();

    // 사진이 없으면 갤러리 제거
    if (result.photos.length === 0) {
      gallery.remove();
      return;
    }

    // ========================================
    // 5. 사진 카드 생성
    // ========================================

    result.photos.forEach((photo) => {
      // 사진 카드
      const photoItem = document.createElement("div");

      photoItem.className = "diary-gallery-item";

      // ========================================
      // 📸 사진 이미지
      // ========================================

      const image = document.createElement("img");

      image.className = "diary-gallery-image";

      image.src = `/api/farms/${farmId}/diaries/${diaryId}/photos/${photo.id}`;

      image.alt = "재배 일지 작업 사진";

      image.loading = "lazy";

      // 이미지 로딩 실패
      image.addEventListener("error", () => {
        console.error("사진 로딩 실패:", photo.id);

        image.hidden = true;
      });

      // ========================================
      // 🗑 사진 삭제 버튼
      // ========================================

      const deleteBtn = document.createElement("button");

      deleteBtn.type = "button";

      deleteBtn.className = "diary-gallery-delete";

      deleteBtn.textContent = "✕";

      deleteBtn.setAttribute("aria-label", "사진 삭제");

      // ========================================
      // 사진 개별 삭제 이벤트
      // ========================================

      deleteBtn.addEventListener("click", async () => {
        if (!isActive()) {
          return;
        }

        // 삭제 확인
        const confirmed = confirm("이 사진을 삭제하시겠습니까?");

        if (!confirmed) {
          return;
        }

        // 중복 삭제 방지
        deleteBtn.disabled = true;

        try {
          // ========================================
          // SQLite 사진 개별 삭제 요청
          // ========================================

          const deleteResponse = await fetch(
            `/api/farms/${farmId}/diaries/${diaryId}/photos/${photo.id}`,
            {
              method: "DELETE",
            },
          );

          const deleteResult = await deleteResponse.json().catch(() => ({}));

          if (!deleteResponse.ok) {
            throw new Error(deleteResult.message || "사진 삭제 실패");
          }

          // 화면이 변경되었다면 UI 수정하지 않음
          if (!isActive()) {
            return;
          }

          // ========================================
          // 삭제한 사진 카드만 제거
          // ========================================

          photoItem.remove();

          // 모든 사진이 삭제되었다면 갤러리 제거
          if (gallery.children.length === 0) {
            gallery.remove();
          }

          console.log("🗑 사진 개별 삭제 완료:", photo.id);
        } catch (error) {
          console.error("사진 삭제 오류:", error);

          if (isActive()) {
            alert(error.message);
          }
        } finally {
          deleteBtn.disabled = false;
        }
      });

      // ========================================
      // 6. 사진 카드 구성
      // ========================================

      photoItem.appendChild(image);

      photoItem.appendChild(deleteBtn);

      gallery.appendChild(photoItem);
    });

    console.log("📸 재배 일지 사진 갤러리 표시 완료:", result.photos.length);
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
  console.log("📖 재배 일지 조회 시작:", farmId);

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

  // ========================================
  // 현재 요청 상태 기억
  // ========================================

  const requestSession = diarySession;

  const currentRequest = ++diaryListRequestId;

  // 이전 요청 결과가 현재 화면에 적용되지 않도록 확인
  const canRender = () => {
    return (
      isCurrent() &&
      diarySession === requestSession &&
      currentRequest === diaryListRequestId
    );
  };

  // 현재 농장 화면 확인
  const screenCurrent = () => {
    return isCurrent() && isFarmScreenActive(id, requestSession);
  };

  if (!canRender()) {
    return;
  }

  // ========================================
  // 인라인 수정 폼 보호
  // 목록 초기화 전에 원래 위치로 복귀
  // ========================================

  if (formControls?.form && diaryList.contains(formControls.form)) {
    closeDiaryForm();
  }

  // ========================================
  // 로딩 메시지 표시
  // ========================================

  diaryList.textContent = "📖 재배 일지를 불러오는 중...";

  try {
    // ========================================
    // SQLite 재배 일지 조회
    // ========================================

    const response = await fetch(`/api/farms/${id}/diaries`);

    if (!response.ok) {
      throw new Error("재배 일지 조회 실패");
    }

    const diaries = await response.json();

    // 다른 농장으로 이동했다면 결과 무시
    if (!canRender()) {
      return;
    }

    if (!Array.isArray(diaries)) {
      throw new Error("올바른 재배 일지 데이터가 아닙니다.");
    }

    // ========================================
    // 목록 초기화 전 수정 폼 보호
    // ========================================

    // if (formControls?.form && diaryList.contains(formControls.form)) {
    //   // 기존 폼을 원래 위치로 돌려놓기
    //   closeDiaryForm();
    // }

    // ========================================
    // 기존 목록 초기화
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
    // 재배 일지 목록 생성
    // ========================================

    diaries.forEach((diary) => {
      // 재배 일지 카드
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
      // ✏️ 수정 버튼
      // ========================================

      const editBtn = document.createElement("button");

      editBtn.type = "button";

      editBtn.className = "diary-edit-btn";

      editBtn.textContent = "✏️ 수정";

      editBtn.addEventListener("click", () => {
        if (!screenCurrent()) {
          return;
        }

        // 해당 재배 일지 카드에서 수정 화면 열기
        openEditDiary(diary, item);
      });

      // ========================================
      // 🗑 삭제 버튼
      // ========================================

      const deleteBtn = document.createElement("button");

      deleteBtn.type = "button";

      deleteBtn.className = "diary-delete-btn";

      deleteBtn.textContent = "🗑 삭제";

      deleteBtn.addEventListener("click", async () => {
        if (!screenCurrent()) {
          return;
        }

        // 삭제 확인
        const confirmed = confirm(
          `${diary.work_date} 재배 일지를 삭제하시겠습니까?`,
        );

        if (!confirmed) {
          return;
        }

        // 중복 삭제 방지
        deleteBtn.disabled = true;

        try {
          // ========================================
          // SQLite 삭제 API 요청
          // ========================================

          const response = await fetch(`/api/farms/${id}/diaries/${diary.id}`, {
            method: "DELETE",
          });

          const result = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(result.message || "재배 일지 삭제 실패");
          }

          console.log("🗑 재배 일지 삭제 완료:", diary.id);

          // 다른 농장으로 이동했다면 화면 변경하지 않음
          if (!screenCurrent()) {
            return;
          }

          // 삭제한 일지를 수정 중이었다면 폼 닫기
          if (editingDiaryId === diary.id) {
            closeDiaryForm();
          }

          // 재배 일지 목록 갱신
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

      // ========================================
      // 카드 구성
      // ========================================

      // 수정 / 삭제 버튼
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      // 작업 제목
      item.appendChild(title);

      // 작업 내용
      item.appendChild(memo);

      // ========================================
      // 📸 저장된 재배 일지 사진 갤러리 표시
      // ========================================

      // 사진이 등록된 경우에만 갤러리 생성
      if (diary.has_photo) {
        // ========================================
        // 1. 사진 갤러리 영역 생성
        // ========================================

        const gallery = document.createElement("div");

        gallery.className = "diary-photo-gallery";

        gallery.textContent = "📸 사진을 불러오는 중...";

        // ========================================
        // 2. 재배 일지 카드에 갤러리 추가
        // ========================================

        item.appendChild(gallery);

        // ========================================
        // 3. 사진 여러 장 조회 및 표시
        // ========================================

        loadDiaryPhotoGallery(id, diary.id, gallery, screenCurrent);
      }

      // ========================================
      // 수정 / 삭제 버튼은 사진 아래 표시
      // ========================================

      item.appendChild(actions);

      // ========================================
      // 완성된 재배 일지 카드 추가
      // ========================================

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
// 6. ✏️ 재배 일지 인라인 수정
// ========================================

function openEditDiary(diary, item) {
  if (!formControls || !item) {
    return;
  }

  const { form, writeBtn, saveBtn, dateInput, typeInput, memoInput } =
    formControls;

  // ========================================
  // 1. 기존 작성 / 수정 폼 정리
  // ========================================

  closeDiaryForm();

  // 새로운 폼 작업 시작
  formRevision++;

  // ========================================
  // 2. 수정 대상 설정
  // ========================================

  editingDiaryId = diary.id;

  editingDiaryItem = item;

  // ========================================
  // 📸 수정 중인 일지 데이터 기억
  // ========================================

  editingDiaryData = diary;

  // ========================================
  // 📸 기존 사진 표시
  // ========================================

  showExistingDiaryPhoto(diary);

  // ========================================
  // 3. 해당 카드 수정 모드 활성화
  // ========================================

  item.classList.add("is-editing");

  // ========================================
  // 4. 기존 재배 일지 데이터 입력
  // ========================================

  dateInput.value = diary.work_date;

  // 작업 종류가 select에 없는 경우 추가
  if (
    typeInput instanceof HTMLSelectElement &&
    !Array.from(typeInput.options).some(
      (option) => option.value === diary.work_type,
    )
  ) {
    typeInput.add(new Option(diary.work_type, diary.work_type));
  }

  typeInput.value = diary.work_type;

  memoInput.value = diary.memo || "";

  // ========================================
  // 5. 작성 폼을 해당 일지 카드로 이동
  // ========================================

  const actions = item.querySelector(".diary-actions");

  if (actions) {
    // 수정 / 삭제 버튼 앞에 작성 폼 배치
    actions.before(form);
  } else {
    item.appendChild(form);
  }

  // ========================================
  // 6. 수정 폼 표시
  // ========================================

  form.hidden = false;

  // 새 일지 작성 버튼은 펼쳐진 상태가 아님
  writeBtn.setAttribute("aria-expanded", "false");

  saveBtn.textContent = "💾 수정 저장";

  // ========================================
  // 7. 수정 화면으로 이동
  // ========================================

  form.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  dateInput.focus();

  console.log("✏️ 재배 일지 인라인 수정 시작:", diary.id);
}
// ========================================
// 7. 📖 재배 일지 작성 폼 초기화
// ========================================

export function initFarmDiary(getFarmId) {
  if (diaryFormInitialized) {
    return;
  }

  // ========================================
  // HTML 요소 가져오기
  // ========================================

  const writeBtn = document.getElementById("diaryWriteBtn");

  const form = document.getElementById("diaryForm");

  const cancelBtn = document.getElementById("diaryCancelBtn");

  const saveBtn = document.getElementById("diarySaveBtn");

  const dateInput = document.getElementById("diaryWorkDate");

  const typeInput = document.getElementById("diaryWorkType");

  const memoInput = document.getElementById("diaryMemo");

  // ========================================
  // 📸 사진 첨부 요소
  // ========================================

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

  // ========================================
  // 현재 농장 ID 조회 함수 저장
  // ========================================

  currentFarmGetter = getFarmId;

  // ========================================
  // 폼 요소 저장
  // ========================================

  formControls = {
    writeBtn,
    form,
    cancelBtn,
    saveBtn,
    dateInput,
    typeInput,
    memoInput,

    defaultSaveText: saveBtn.textContent,
  };

  // ========================================
  // ✏️ 작성 폼의 원래 위치 기억
  // ========================================

  diaryFormAnchor = document.createComment("재배 일지 작성 폼 원래 위치");

  // 작성 폼 바로 앞에 위치 표시
  form.before(diaryFormAnchor);

  // ========================================
  // 📸 기존 사진 표시 영역 생성
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
  // 기존 사진 이미지
  // ========================================

  existingPhotoImage = document.createElement("img");

  existingPhotoImage.className = "diary-existing-photo-image";

  existingPhotoImage.alt = "현재 등록된 재배 일지 사진";

  existingPhotoImage.loading = "lazy";

  // ========================================
  // 기존 사진 삭제 버튼
  // ========================================

  existingPhotoDeleteButton = document.createElement("button");

  existingPhotoDeleteButton.type = "button";

  existingPhotoDeleteButton.className = "diary-photo-remove-btn";

  existingPhotoDeleteButton.textContent = "🗑 현재 사진 삭제";

  // ========================================
  // 사진 영역 구성
  // ========================================

  existingPhotoBox.appendChild(existingPhotoTitle);

  existingPhotoBox.appendChild(existingPhotoImage);

  existingPhotoBox.appendChild(existingPhotoDeleteButton);

  // ========================================
  // 기존 사진 영역을 파일 선택 앞에 배치
  // ========================================

  photoInput.before(existingPhotoBox);

  // ========================================
  // 🗑 기존 재배 일지 사진 삭제
  // ========================================

  existingPhotoDeleteButton.addEventListener("click", async () => {
    // ========================================
    // 1. 현재 농장 및 일지 확인
    // ========================================

    const farmId = getCurrentFarmId();

    const diaryId = editingDiaryId;

    const deleteSession = diarySession;

    const deleteRevision = formRevision;

    const targetDiary = editingDiaryData;

    const targetItem = editingDiaryItem;

    if (
      !Number.isSafeInteger(farmId) ||
      farmId <= 0 ||
      !Number.isSafeInteger(diaryId) ||
      diaryId <= 0
    ) {
      alert("삭제할 사진 정보를 확인할 수 없습니다.");
      return;
    }

    // 저장 중에는 사진 삭제 금지
    if (saveBtn.disabled) {
      return;
    }

    // ========================================
    // 2. 삭제 확인
    // ========================================

    const confirmed = confirm(
      "현재 등록된 사진을 삭제하시겠습니까?\n\n" +
        "재배 일지 내용은 삭제되지 않습니다.",
    );

    if (!confirmed) {
      return;
    }

    // ========================================
    // 3. 현재 수정 화면 확인
    // ========================================

    const isStillEditing = () => {
      return (
        isFarmScreenActive(farmId, deleteSession) &&
        formRevision === deleteRevision &&
        editingDiaryId === diaryId
      );
    };

    // ========================================
    // 4. 중복 요청 방지
    // ========================================

    existingPhotoDeleteButton.disabled = true;

    existingPhotoDeleteButton.textContent = "삭제 중...";

    saveBtn.disabled = true;

    try {
      // ========================================
      // 5. SQLite 사진 삭제 API 요청
      // ========================================

      const response = await fetch(
        `/api/farms/${farmId}/diaries/${diaryId}/photo`,
        {
          method: "DELETE",
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "사진 삭제 실패");
      }

      console.log("🗑 사진 삭제 완료:", diaryId);

      // ========================================
      // 6. 현재 일지 데이터 변경
      // ========================================

      if (targetDiary) {
        targetDiary.has_photo = 0;
      }

      // ========================================
      // 7. 기존 목록 사진 제거
      // ========================================

      const listPhoto = targetItem?.querySelector(".diary-photo");

      if (listPhoto) {
        listPhoto.remove();
      }

      // ========================================
      // 8. 현재 수정 화면 갱신
      // ========================================

      if (isStillEditing()) {
        showExistingDiaryPhoto(null);

        alert("📸 사진이 삭제되었습니다.");
      }
    } catch (error) {
      console.error("사진 삭제 오류:", error);

      if (isStillEditing()) {
        alert(error.message);
      }
    } finally {
      // ========================================
      // 9. 버튼 상태 복구
      // ========================================

      if (isStillEditing()) {
        existingPhotoDeleteButton.textContent = "🗑 현재 사진 삭제";

        saveBtn.disabled = false;
      }
    }
  });

  // ========================================
  // 📸 사진 여러 장 선택 및 미리보기
  // ========================================

  photoInput.addEventListener("change", () => {
    // ========================================
    // 1. 새로 선택한 사진 목록
    // ========================================

    const files = Array.from(photoInput.files || []);

    // 같은 사진을 다시 선택할 수 있도록 초기화
    photoInput.value = "";

    if (files.length === 0) {
      return;
    }

    // ========================================
    // 2. 허용하는 사진 형식
    // ========================================

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    // 사진 한 장당 최대 3MB
    const maxSize = 3 * 1024 * 1024;

    // ========================================
    // 3. 사진 형식 및 크기 검사
    // ========================================

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        alert("JPG, PNG, WebP 사진만 등록할 수 있습니다.");

        return;
      }

      if (file.size > maxSize) {
        alert(`${file.name}\n사진 크기는 최대 3MB까지 가능합니다.`);

        return;
      }
    }

    // ========================================
    // 4. 중복 선택한 사진 제외
    // ========================================

    const newFiles = [];

    for (const file of files) {
      const isSameFile = (a, b) =>
        a.name === b.name &&
        a.size === b.size &&
        a.lastModified === b.lastModified;

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
    // 5. 최대 10장 제한
    // ========================================

    if (selectedDiaryPhotos.length + newFiles.length > 10) {
      alert("재배 일지에는 사진을 최대 10장까지 선택할 수 있습니다.");

      return;
    }

    // ========================================
    // 6. 기존 선택 목록에 사진 추가
    // ========================================

    selectedDiaryPhotos.push(...newFiles);

    // ========================================
    // 7. 미리보기 갱신
    // ========================================

    renderDiaryPhotoPreviews();

    console.log("📸 현재 선택한 사진:", selectedDiaryPhotos.length);
  });

  // ========================================
  // 8. 새 일지 작성 버튼
  // ========================================

  writeBtn.addEventListener("click", () => {
    // ========================================
    // 1. 새 일지 작성 폼이 이미 열려 있다면 닫기
    // ========================================

    if (!form.hidden && editingDiaryId === null) {
      closeDiaryForm();
      return;
    }

    // ========================================
    // 2. 기존 수정 화면 정리
    // ========================================

    closeDiaryForm();

    // ========================================
    // 3. 새 일지 작성 모드
    // ========================================

    formRevision++;

    editingDiaryId = null;

    form.reset();

    resetDiaryPhotoPreview();

    form.hidden = false;

    writeBtn.setAttribute("aria-expanded", "true");

    saveBtn.textContent = formControls.defaultSaveText;

    // ========================================
    // 4. 오늘 날짜 자동 입력
    // ========================================

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

    // 중복 저장 방지
    if (saveBtn.disabled) {
      return;
    }

    // 현재 농장 ID
    const farmId = getCurrentFarmId();

    // 현재 화면 구분 번호
    const saveSession = diarySession;

    // 현재 폼 구분 번호
    const saveRevision = formRevision;

    // 수정할 일지 ID
    const diaryId = editingDiaryId;

    if (!Number.isSafeInteger(farmId) || farmId <= 0) {
      alert("농장 정보를 확인할 수 없습니다.");
      return;
    }

    // ========================================
    // 입력 데이터
    // ========================================

    const work_date = dateInput.value;

    const work_type = typeInput.value;

    const memo = memoInput.value.trim();

    // ========================================
    // 📸 첨부할 사진 가져오기
    // ========================================

    // ========================================
    // 📸 첨부할 사진 여러 장 가져오기
    // ========================================

    // 저장 요청 시점의 사진 목록 복사
    const photoFiles = [...selectedDiaryPhotos];

    // ========================================
    // 사진 개수 확인
    // ========================================

    if (photoFiles.length > 10) {
      alert("사진은 최대 10장까지 등록할 수 있습니다.");

      return;
    }

    // ========================================
    // 사진 형식 및 크기 재검사
    // ========================================

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    const maxSize = 3 * 1024 * 1024;

    for (const file of photoFiles) {
      if (!allowedTypes.includes(file.type) || file.size > maxSize) {
        alert("사진 형식 또는 크기를 확인해주세요.");

        return;
      }
    }

    if (!work_date || !work_type) {
      alert("작업 날짜와 종류를 입력해주세요.");
      return;
    }

    // ========================================
    // 작성 / 수정 모드 구분
    // ========================================

    const isEditMode = diaryId !== null;

    const method = isEditMode ? "PUT" : "POST";

    const url = isEditMode
      ? `/api/farms/${farmId}/diaries/${diaryId}`
      : `/api/farms/${farmId}/diaries`;

    // ========================================
    // 현재 화면 확인 함수
    // ========================================

    const isStillCurrent = () => {
      return isFarmScreenActive(farmId, saveSession);
    };

    // ========================================
    // 저장 버튼 비활성화
    // ========================================

    saveBtn.disabled = true;

    saveBtn.textContent = isEditMode ? "수정 중..." : "저장 중...";

    try {
      // ========================================
      // SQLite 저장 / 수정 요청
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

      console.log("📖 재배 일지 처리 완료:", result);

      // ========================================
      // 📸 재배 일지 사진 여러 장 업로드
      // ========================================

      let photoError = null;

      // ========================================
      // 1. 첨부한 사진이 있는 경우
      // ========================================

      if (photoFiles.length > 0) {
        try {
          // ========================================
          // 2. 저장된 재배 일지 ID 확인
          // ========================================

          const savedDiaryId = isEditMode ? diaryId : Number(result.id);

          if (!Number.isSafeInteger(savedDiaryId) || savedDiaryId <= 0) {
            throw new Error("재배 일지 ID를 확인할 수 없습니다.");
          }

          // ========================================
          // 3. 사진 업로드 데이터 생성
          // ========================================

          const formData = new FormData();

          // 선택한 사진 여러 장 추가
          photoFiles.forEach((file) => {
            formData.append("photos", file);
          });

          // ========================================
          // 4. 사진 여러 장 저장 API 요청
          // ========================================

          const photoResponse = await fetch(
            `/api/farms/${farmId}/diaries/${savedDiaryId}/photos`,
            {
              method: "POST",
              body: formData,
            },
          );

          // ========================================
          // 5. 서버 응답 확인
          // ========================================

          const photoResult = await photoResponse.json().catch(() => ({}));

          if (!photoResponse.ok) {
            throw new Error(photoResult.message || "사진 저장에 실패했습니다.");
          }

          // ========================================
          // 6. 사진 저장 완료
          // ========================================

          console.log(
            "📸 재배 일지 사진 여러 장 저장 완료:",
            savedDiaryId,
            photoResult.uploadedCount,
          );
        } catch (error) {
          console.error("📸 사진 여러 장 업로드 오류:", error);

          // 재배 일지 본문은 이미 저장된 상태
          photoError = error;
        }
      }

      // ========================================
      // 기존 코드 계속 실행
      // ========================================

      // 다른 농장으로 이동했다면 화면 변경하지 않음
      if (!isStillCurrent()) {
        return;
      }

      // ========================================
      // 현재 작성 폼이 그대로 유지된 경우
      // ========================================

      if (formRevision === saveRevision) {
        closeDiaryForm();
      }

      // ========================================
      // 재배 일지 목록 갱신
      // ========================================

      await loadFarmDiaries(farmId, isStillCurrent);

      // ========================================
      // 📖 재배 일지 저장 결과 안내
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
      // 동일한 폼인 경우에만 버튼 상태 복구
      if (isStillCurrent() && formRevision === saveRevision) {
        saveBtn.disabled = false;

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
  // 화면 전환 번호 갱신
  diarySession++;

  // 이전 조회 요청 무효화
  diaryListRequestId++;

  // 입력 폼 초기화
  closeDiaryForm();

  console.log("📖 재배 일지 입력 폼 초기화 완료!");
}
