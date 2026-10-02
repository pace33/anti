# 에이두 로블 — 계정 연동 학급용 게임

에이두 한글 학생·교사 상점에서 계정으로 입장하는 3D 공원입니다. 현재 Roblox 계정이나 Roblox의 현재 게임과는 연결하지 않습니다.

## 경계와 계정

- Firebase는 로그인 인증에만 사용합니다. 프로필·역할·학생 코드는 정본 자체 데이터 API `GET /db-api/korean/v2/documents/users/{uid}`로 확인합니다. 기존 Craft API의 구형 Firestore 프로필 함수를 복사하지 않습니다.
- 학생 이름은 `aiedue` + 서버 프로필의 학생 코드, 교사 이름은 인증된 이메일의 `@` 앞부분입니다. URL의 username/userId로 계정을 바꿀 수 없습니다.
- 게임 숫자 ID는 Pi의 비공개 `robl-identities.json`에 UID별로 영속 보관합니다. 학생 돈·크래프트 인벤토리는 변경하지 않습니다.
- 한글 → Bearer 인증 `/robl/launch` → 60초 일회용 주소 → `/robl/session` → HttpOnly/Secure/SameSite 쿠키 순서입니다. Firebase 토큰을 주소·게임 런타임에 전달하지 않습니다.
- 게임 엔진 파일·입장 API는 인증 세션이 필요합니다. 스튜디오·서버 만들기·맵 업로드는 공개 플레이어에게 열지 않습니다. 호스트 제어는 루프백 + 별도 호스트 키로 제한합니다.
- 등록된 에이두 학생·교사 계정 전용입니다. 별도 초대 명단/반별 격리가 필요한 경우 계정 검증 단계에 해당 ACL을 추가해야 합니다.

## 실제 게임 프로토콜 중계

`packet-relay.js`는 native `aya_webrtc_transport_*` 엔진 ABI를 유지하면서 **실제 RakNet 게임 패킷을 인증된 WebSocket으로 중계**합니다. 데이터그램 경계와 연결 ID를 보존합니다. 홈페이지 학교망에서는 HTTPS/WSS만 필요하고 ICE/STUN/TURN을 요구하지 않습니다. 단순 신호 API를 게임 서버인 것처럼 취급하는 방식이 아닙니다.

- 호스트↔각 플레이어만 연결하고 플레이어끼리 다른 계정에 패킷을 보내지 못하도록 경로를 제한합니다.
- 최대 8명, 같은 계정 중복 접속 차단, 일회용 소켓 티켓, 페이로드·버퍼·요청량 제한, heartbeat가 있습니다.
- 브라우저와 기본 게임 엔진의 샌드박스 설정을 임의로 해제하지 않습니다. 전용 headless 호스트의 쿠키 초기화는 `--password-store=basic`으로 처리합니다. 이 프로필에는 학교 Firebase 로그인을 보관하지 않습니다.
- 런타임 하드코딩 `/runtime/` 주소와 초기 fetch의 게임 API 주소를 `/robl/` 네임스페이스에 맞게 처리해야 합니다.

## 배포와 운영

정본 소스는 `pace33/anti`의 이 폴더와 루트 `app.js`, `index.html`입니다. 대형 제3자 실행 파일, 키, 세션/프로필 로그, 브라우저 프로필은 Git에 넣지 않습니다.

Pi 작업 디렉터리: `/home/aiedue/aya-private-preview`

- 루프백 HTTP/API: `127.0.0.1:3074`
- Caddy: `handle_path /robl/*` → `127.0.0.1:3074`, `header_up X-Robl-Public 1`
- 기존 `/server`, `/relay`, `/craft-api`는 변경하지 않습니다.
- 설정: `AYA_REQUIRE_AUTH=1`, `AYA_RELAY=1`, `AYA_PUBLIC_ORIGIN=https://aiedue.ddns.net/robl`, `AYA_RUNTIME_DIR`, `AYA_HOST_KEY` (비공개 환경 파일), 선택 `AYA_ASSET_PROXY=1`
- `aiedue-robl-engine-browser.service`: 전용 Chromium, CDP 루프백만.
- `aiedue-robl-host-start.service`: 원본 공원 파일로 native 호스트 시작. 활성 플레이어를 끊어 재시작하지 않으며 이미 준비된 호스트에서는 멱등 종료합니다.
- `aiedue-robl-host-start.timer`: 주기적인 호스트 확인·복구.
- `host-controller.mjs`: 조기 native diagnostics `ccall` 금지. 실제 초기화 UI와 서버 ready 로그 확인 후 readiness를 등록합니다.

```sh
npm ci
npm test
node --check host-controller.mjs
node --check packet-relay.js
```

운영 검증은 실계정 테스트 학생·교사로 로그인하여 두 캐릭터 생성, native 패킷 송수신, authoritative 좌표 변화, 다른 플레이어 화면을 확인합니다. 익명 `/robl/runtime/Aya.App.wasm` 요청은 401이어야 합니다.

## 실행 파일 권리

Aya 원본 LICENSE는 Roblox 소유 코드의 권리가 그대로 유지됨을 명시합니다. 학급용 비공개 운영이라는 사용자 지정 범위를 따르되, 그것이 저작권 허락을 자동으로 부여한다는 뜻은 아닙니다. 이 Git 저장소에는 대형 엔진 실행 파일을 재배포하지 않습니다. 별도 불특정 이용자 대상 공개 배포·상업 서비스로 확대하지 않습니다.
