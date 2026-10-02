# 에이두 로블 원본 자료실

## 범위
고정 Git 버전의 Novetus Map Pack와 Asset Delivery 경로를 검색하고, 선택한 파일만 인증된 비공개 캐시에 받아 Git blob 해시와 크기를 검증합니다. 원본 게임 코드·엔진 바이너리·캐시는 저장소에 넣지 않습니다.

- 원본 맵/모델: XML 또는 BZ2 XML의 지원 부품과 등록된 메시·텍스처 변환. 외부 스크립트 실행 금지.
- 메시: legacy version 1.00/1.01 및 2.00 파싱, Three.js 실제 정점 미리보기.
- 이미지: magic bytes 기반 PNG/JPEG/BMP. 원본 부품/메시 텍스처 적용과 저장.
- 오디오: magic bytes 기반 원본 파일 재생.
- 애니메이션/미지원 바이너리: 구조 또는 원본 링크로 확인. 재생/원본 게임 전체 호환이라고 표시하지 않음.
- 원본 출처·버전·권리 고지 유지. 공개 저장소라는 이유로 재배포 권한을 추정하지 않음.
- BrickColor: 공식 문서의 208색 값. `python generate-brick-colors.py`로 갱신 가능.

## 사용
한글 상점 → 에이두 로블 → 교사 맵 제작실 → Novetus 원본 자료 검색 → 원본 열기 → 맵/모델/메시 추가 또는 선택 부품에 이미지 적용 → 맵 저장. 계정 소유 맵 목록에서 다시 열거나 교사가 저장 후 플레이할 수 있습니다. 학생은 원본 미리보기와 자기 캐릭터 편집만 가능합니다.

## 검증
`node --test *.test.mjs`는 합성 wire-format fixture임을 명시한 메시 검사, XML 변환·색상·참조 보존, 원본 해시 불일치 거절, 계정 게이트를 포함합니다.

실제 upstream 브라우저 검증은 `qa/original-browser.mjs`입니다. Playwright Core는 테스트 전용 의존성입니다. 로컬 테스트는 루프백 서버에서 테스트 계정 fixture를 사용하되 모든 브라우저 요청에 공개 프록시 경계 헤더를 적용하며 원본 바이트는 실제 upstream에서 받습니다. 운영 모드는 실제 계정의 단기 Firebase ID 토큰을 환경변수로만 받습니다. 토큰·세션은 보고서에 쓰지 않습니다.

```bash
npm ci
ROBL_QA_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe' ROBL_LOCAL=1 node qa/original-browser.mjs
# 운영: ROBL_QA_TEACHER_TOKEN, ROBL_QA_STUDENT_TOKEN을 비공개 환경으로 제공
ROBL_QA_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe' node qa/original-browser.mjs
```

검증 샘플: Lava Rush 118부품, Shaggy 892삼각형, Shaggy.png 원본 메시 텍스처, face.png 부품 텍스처, Rocket.rbxm 1부품 모델. 검색 → 실제 3D 열기 → 추가/적용 → 계정 저장 → 새로고침/재열기 → 원본 참조 확인. 학생 미리보기/교사 수정403, 비로그인 원본/스크립트401, 모바일 가로넘침과 브라우저 오류도 검사합니다.

## 제한
16MB 원본, 32MB 압축해제, 맵당 800부품, 지원 좌표/크기 범위, 비공개 128MB 캐시 제한. 초과/미등록 항목은 보고합니다. 지형과 에셋을 가져오는 기능이며 원본 게임 스크립트/도구/규칙 복원을 의미하지 않습니다.
