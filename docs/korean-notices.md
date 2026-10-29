# 에이두 한글 공지

- 로그인 화면: 회원가입 → 공지 → 학생 테스트. 교사 로그인에도 같은 공지 진입점을 제공한다.
- 대시보드: 인트로 보기 바로 왼쪽의 공지.
- 비로그인·학생·교사·보호자 모두 목록/본문/첨부 링크를 열람한다.
- 공지 쓰기/수정/삭제는 Firebase에서 검증한 admin/operator custom claim 또는 서버 `notice_staff`에 등록된 UID만 가능하다. 사용자 프로필의 `role`, `isAdmin` 등을 바꾸어도 공지 권한은 생기지 않는다.
- 관리자 자신의 로그인 계정은 기존 교사 역할을 그대로 유지하며, 공지 관리 권한만 별도로 부여한다.
- 데이터는 자체 데이터서버 `data/korean-notices.sqlite`에 저장한다. Firebase는 인증에만 사용한다. 공지 DB도 데이터서버 백업 범위에 포함해야 한다.
- 제목 120자, 본문 30,000자. HTML은 실행하지 않고 일반 텍스트로 표시한다. 첨부는 최대 3개이며 기존 에이두 데이터서버 공유 URL만 허용한다. 기존 단일 첨부도 유지한다.
- 수정/삭제에는 revision 검사를 적용해 다른 관리자의 수정 내용을 덮어쓰지 않는다. 목록은 커서 방식으로 이전 공지를 계속 열람한다.

## API

기본 경로 `/db-api/korean/v2/notices`.

- GET `/`: 목록. `limit`(최대 50), `before`(이전 응답 nextCursor).
- GET `/:id`: 본문과 첨부 링크.
- GET `/access`: 현재 검증된 계정의 관리 권한. 비로그인 canManage=false.
- POST `/`: 작성. Firebase Bearer 필수, 서버에서 운영자/관리자 확인.
- PATCH `/:id`: 수정. 원문 revision 필수.
- DELETE `/:id?revision=N`: 삭제. 원문 revision 필수.

## 최초 설치 / 자동배포

프런트는 최신 main 병합 후 기존 Pi `aiedue-anti-sync.service`로 배포한다. 아래 작업도 **병합된 정본 checkout에서** 실행한다. 기존 데이터 서버 코드는 백업한 뒤 import/init/routing만 좁게 연결하고, 다른 앱 DB는 변경하지 않는다.

```sh
cd /home/aiedue/repos/anti-latest
python3 tools/data-server/install-korean-notices.py \
  --api-root '/home/aiedue/migrated-from-pc/에이두 데이터베이스/api' \
  --admin-uid '<검증한 운영자 Firebase UID>' --check
# --check 제거 후 설치. 기존 소스 백업 경로와 module SHA256 출력 확인.
/home/aiedue/.local/node24/bin/node --check '/home/aiedue/migrated-from-pc/에이두 데이터베이스/api/src/korean-v2.js'
# 최초 운영자 UID를 환경설정에 추가한 경우 daemon-reload 후 재시작 필요.
systemctl --user daemon-reload
systemctl --user restart aiedue-database.service
curl --fail http://127.0.0.1:3050/db-api/health

install -D tools/data-server/korean-notices-sync.conf \
  "$HOME/.config/systemd/user/aiedue-anti-sync.service.d/korean-notices.conf"
systemctl --user daemon-reload
```

이후 공지 API 모듈이 main에서 변경되면 정본 동기화의 ExecStartPost가 백업·설치·검사·재시작·헬스 확인을 수행한다. 모듈이 같으면 서버를 재시작하지 않는다. 공지·학습 데이터 파일은 정적 사이트 rsync 대상 밖에 있어 main 동기화로 사라지지 않는다.

## 문서 기반 첫 공지

확인된 원문을 일반 텍스트 JSON(title/content/attachments:[{url,name}])으로 작성한다. 개인정보를 포함한 임시 JSON은 저장소에 커밋하지 않는다. 사용자가 공개 게시를 승인한 개인정보 안내 초안은 `docs/korean-privacy-notice.json`에 있으며, 공개 요청된 접수 이메일과 다운로드 링크만 포함한다. `publish-korean-notice.mjs DATA_DIR NOTICE_JSON ADMIN_UID UNIQUE_SEED_KEY [DISPLAY_NAME]`는 등록된 서버 관리자 권한을 확인한 뒤 한 번만 게시하며, 같은 키로 재실행해도 중복 생성하거나 삭제한 글을 복구하지 않는다. 로컬 운영자가 지정한 `에이두` 표시명은 해당 게시물에만 적용되며 기존 계정 프로필을 바꾸지 않는다. HTTP에서는 작성자 지정이 계속 금지된다. 원문과 나래 한글 양식은 데이터서버 공유 다운로드 링크로 첨부한다. 공급자 확인 자료를 독립적인 보안 인증으로 표현하지 않는다.

개인정보 안내는 실명 대신 별명과 로그인 번호를 기본으로 안내하되, 실제 저장되는 계정 식별정보·학습 기록·교사 인증 이메일까지 전혀 처리하지 않는다고 주장하지 않는다. 별명도 계정과 연결되면 개인정보일 수 있다. 동의서 다운로드 제공과 실제 법정대리인 동의 확인 절차의 수행은 별개의 사항이다.

## 검증

```sh
node --test tools/test-korean-notices-api.mjs tools/test-korean-notices-source.mjs
node tools/validate-site.mjs
```

격리 브라우저에서는 작성→저장→다른 비로그인 창 열람→수정→삭제, 학생 직접 쓰기 거부, 계정 변경 시 편집기 초기화, XSS 텍스트, 모바일 넘침, 두 진입점을 확인한다. 운영에서는 실제 Firebase 인증과 비로그인 공개 열람을 별도로 구분해 확인한다.
