// ========================================
// 🌱 농사 가이드 - 재배 일지 관리
// ========================================

// ========================================
// 1. 전역 상태 관리
// ========================================

// 이벤트 중복 등록 방지
let diaryFormInitialized = false;

// ========================================
// 📸 사진 미리보기 관리
// ========================================

let photoPreviewUrl = null;

// ========================================
// 사진 미리보기 초기화
// ========================================

function resetDiaryPhotoPreview() {
  const preview = document.getElementById("diaryPhotoPreview");

  if (photoPreviewUrl) {
    URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = null;
  }

  if (preview) {
    preview.removeAttribute("src");
    preview.hidden = true;
  }
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

    if (formControls?.form && diaryList.contains(formControls.form)) {
      // 기존 폼을 원래 위치로 돌려놓기
      closeDiaryForm();
    }

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
      // 📸 저장된 재배 일지 사진 표시
      // ========================================

      // 사진이 등록된 경우에만 표시
      if (diary.has_photo) {
        const photo = document.createElement("img");

        photo.className = "diary-photo";

        photo.src = `/api/farms/${id}/diaries/${diary.id}/photo`;

        photo.alt = `${diary.work_date} 작업 사진`;

        photo.loading = "lazy";

        // 이미지 로딩 실패 처리
        photo.addEventListener("error", () => {
          console.error("재배 일지 사진 불러오기 실패:", diary.id);

          photo.hidden = true;
        });

        item.appendChild(photo);
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
  // 📸 사진 선택 및 미리보기
  // ========================================

  photoInput.addEventListener("change", () => {
    resetDiaryPhotoPreview();

    const file = photoInput.files[0];

    if (!file) {
      return;
    }

    // ========================================
    // 사진 형식 검사
    // ========================================

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      alert("JPG, PNG, WebP 사진만 등록할 수 있습니다.");

      photoInput.value = "";
      return;
    }

    // ========================================
    // 사진 크기 검사 (3MB)
    // ========================================

    const maxSize = 3 * 1024 * 1024;

    if (file.size > maxSize) {
      alert("사진 크기는 최대 3MB까지 가능합니다.");

      photoInput.value = "";
      return;
    }

    // ========================================
    // 사진 미리보기
    // ========================================

    photoPreviewUrl = URL.createObjectURL(file);

    photoPreview.src = photoPreviewUrl;

    photoPreview.hidden = false;

    console.log("📸 사진 선택 완료:", file.name);
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

    const photoFile = photoInput.files[0] ?? null;

    // 사진이 있다면 크기와 형식 재검사
    if (photoFile) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

      if (
        !allowedTypes.includes(photoFile.type) ||
        photoFile.size > 3 * 1024 * 1024
      ) {
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
      // 📸 재배 일지 사진 업로드
      // ========================================

      let photoError = null;

      // 첨부한 사진이 있는 경우에만 업로드
      if (photoFile) {
        try {
          // ========================================
          // 1. 저장된 재배 일지 ID 확인
          // ========================================

          // 수정 모드에서는 기존 일지 ID 사용
          // 신규 작성에서는 서버가 반환한 ID 사용
          const savedDiaryId = isEditMode ? diaryId : Number(result.id);

          if (!Number.isSafeInteger(savedDiaryId) || savedDiaryId <= 0) {
            throw new Error("재배 일지 ID를 확인할 수 없습니다.");
          }

          // ========================================
          // 2. 사진 업로드 데이터 생성
          // ========================================

          const formData = new FormData();

          formData.append("photo", photoFile);

          // ========================================
          // 3. 사진 저장 API 요청
          // ========================================

          const photoResponse = await fetch(
            `/api/farms/${farmId}/diaries/${savedDiaryId}/photo`,
            {
              method: "POST",
              body: formData,
            },
          );

          // ========================================
          // 4. 서버 응답 확인
          // ========================================

          const photoResult = await photoResponse.json().catch(() => ({}));

          if (!photoResponse.ok) {
            throw new Error(photoResult.message || "사진 저장에 실패했습니다.");
          }

          console.log("📸 재배 일지 사진 저장 완료:", savedDiaryId);
        } catch (error) {
          console.error("📸 사진 업로드 오류:", error);

          // 재배 일지는 이미 저장되었으므로
          // 사진 저장 오류만 별도로 기록
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
