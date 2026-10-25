// ========================================
// 🌱 농사 가이드
// 📸 실제 로컬 사진 정리 통합 테스트
// ========================================

const test = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const os = require("node:os");

const path = require("node:path");

const { spawnSync } = require("node:child_process");

// ========================================
// 1. 실제 저장소 통합 테스트
// ========================================

test("실제 로컬 저장소 사진 자동 정리 안전성", (t) => {
  // ========================================
  // 테스트 전용 저장소 생성
  // ========================================

  const storageRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "farm-photo-cleanup-real-"),
  );

  // ========================================
  // 테스트 종료 후 임시 파일 제거
  // ========================================

  t.after(() => {
    fs.rmSync(storageRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  });

  // ========================================
  // 2. 독립 프로세스 테스트
  //
  // 운영 저장소 설정에 영향을 주지 않는다.
  // ========================================

  const testScript = `
    const assert = require("node:assert/strict");

    const fs = require("node:fs");

    const path = require("node:path");

    const Database = require("better-sqlite3");

    const createPhotoCleanupQueue = require(
      "./services/storage/photo-cleanup-queue"
    );

    const createPhotoCleanupRunner = require(
      "./services/storage/photo-cleanup-runner"
    );

    const {
      savePhoto,
      deletePhotoFile,
    } = require("./services/storage/storage.service");

    async function main() {
      // ========================================
      // 3. 테스트 DB
      // ========================================

      const db = new Database(":memory:");

      try {
        db.exec(\`
          CREATE TABLE diary_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            storage_provider TEXT,

            storage_key TEXT,

            is_deleted INTEGER DEFAULT 0
          )
        \`);

        const queue = createPhotoCleanupQueue(db);

        // ========================================
        // 4. 실제 테스트 이미지 생성
        // ========================================

        const header = Buffer.from(
          "89504e470d0a1a0a",
          "hex"
        );

        async function createPhoto(name) {
          const buffer = Buffer.concat([
            header,
            Buffer.from(name),
          ]);

          return savePhoto(
            {
              buffer,
              mimetype: "image/png",
            },
            "diary"
          );
        }

        // ========================================
        // 5. 테스트 사진 4개
        // ========================================

        const orphanPhoto = await createPhoto(
          "orphan-photo"
        );

        const deletedPhoto = await createPhoto(
          "soft-deleted-photo"
        );

        const activePhoto = await createPhoto(
          "active-photo"
        );

        const newPhoto = await createPhoto(
          "new-upload-photo"
        );

        // ========================================
        // 6. 정리 작업 등록
        // ========================================

        for (const photo of [
          orphanPhoto,
          deletedPhoto,
          activePhoto,
          newPhoto,
        ]) {
          queue.enqueue(photo);
        }

        // ========================================
        // 7. 소프트 삭제 사진 DB 등록
        // ========================================

        const insertPhoto = db.prepare(\`
          INSERT INTO diary_photos (
            storage_provider,
            storage_key,
            is_deleted
          )
          VALUES (?, ?, ?)
        \`);

        insertPhoto.run(
          deletedPhoto.storageProvider,
          deletedPhoto.storageKey,
          1
        );

        // ========================================
        // 8. 활성 사진 DB 등록
        // ========================================

        insertPhoto.run(
          activePhoto.storageProvider,
          activePhoto.storageKey,
          0
        );

        // ========================================
        // 9. 기존 작업 25시간 경과 처리
        //
        // 신규 사진은 제외한다.
        // ========================================

        db.prepare(\`
          UPDATE photo_cleanup_jobs

          SET updated_at = datetime(
            'now',
            '-25 hours'
          )

          WHERE storage_key IN (?, ?, ?)
        \`).run(
          orphanPhoto.storageKey,
          deletedPhoto.storageKey,
          activePhoto.storageKey
        );

        // ========================================
        // 10. 실제 자동 정리 실행기
        // ========================================

        const runner = createPhotoCleanupRunner({
          queue,

          deletePhotoFile,

          intervalMs: 60 * 60 * 1000,
        });

        // ========================================
        // 11. 실제 파일 정리
        // ========================================

        const result = await runner.runOnce();

        assert.equal(result.cleaned, 1);

        assert.equal(result.protected, 2);

        assert.equal(result.failed, 0);

        // ========================================
        // 12. 실제 파일 존재 여부
        // ========================================

        function exists(photo) {
          return fs.existsSync(
            path.join(
              process.env.PHOTO_STORAGE_PATH,
              photo.storageKey
            )
          );
        }

        // ========================================
        // 고아 사진 삭제
        // ========================================

        assert.equal(
          exists(orphanPhoto),
          false
        );

        console.log(
          "✅ 오래된 고아 사진 실제 삭제 성공"
        );

        // ========================================
        // 소프트 삭제 사진 보호
        // ========================================

        assert.equal(
          exists(deletedPhoto),
          true
        );

        console.log(
          "✅ 소프트 삭제 사진 원본 보호"
        );

        // ========================================
        // 활성 사진 보호
        // ========================================

        assert.equal(
          exists(activePhoto),
          true
        );

        console.log(
          "✅ 활성 사진 원본 보호"
        );

        // ========================================
        // 신규 사진 보호
        // ========================================

        assert.equal(
          exists(newPhoto),
          true
        );

        console.log(
          "✅ 24시간 이내 신규 사진 보호"
        );

        // ========================================
        // 13. 정리 작업 DB 상태 확인
        // ========================================

        const jobs = db.prepare(\`
          SELECT *
          FROM photo_cleanup_jobs
        \`).all();

        assert.equal(jobs.length, 1);

        assert.equal(
          jobs[0].storage_key,
          newPhoto.storageKey
        );

        console.log(
          "✅ 신규 사진 정리 작업 유지"
        );

        // ========================================
        // 14. 중복 정리 실행
        // ========================================

        const second = await runner.runOnce();

        assert.equal(second.cleaned, 0);

        assert.equal(second.failed, 0);

        console.log(
          "✅ 정리 작업 재실행 정상"
        );

        // ========================================
        // 15. 잘못된 경로 삭제 차단
        // ========================================

        await assert.rejects(
          deletePhotoFile("../invalid.png"),
          /올바르지 않은 사진 저장 경로/
        );

        console.log(
          "✅ 허용되지 않은 파일 경로 차단"
        );

        console.log(
          "================================"
        );

        console.log(
          "📸 실제 로컬 저장소 정리 검증 완료!"
        );

        console.log(
          "================================"
        );
      } finally {
        db.close();
      }
    }

    main().catch((error) => {
      console.error(error);

      process.exitCode = 1;
    });
  `;

  // ========================================
  // 16. 독립 프로세스 실행
  // ========================================

  const result = spawnSync(process.execPath, ["-e", testScript], {
    cwd: path.resolve(__dirname, ".."),

    env: {
      ...process.env,

      PHOTO_STORAGE_PROVIDER: "local",

      PHOTO_STORAGE_PATH: storageRoot,

      PHOTO_CLEANUP_ENABLED: "false",
    },

    encoding: "utf8",

    timeout: 20000,
  });

  // ========================================
  // 17. 실행 결과 확인
  // ========================================

  assert.ifError(result.error);

  assert.equal(
    result.status,
    0,
    ["실제 저장소 테스트 실패", result.stdout, result.stderr].join("\\n"),
  );

  console.log(result.stdout);

  console.log("✅ 운영 저장소와 분리된 통합 테스트 성공");
});
