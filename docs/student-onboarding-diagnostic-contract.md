# 학생 온보딩·진단 상태 머신 및 테스트 계약

이 문서는 구현자가 `student-onboarding-diagnostic-core.mjs`를 화면/저장 계층에 연결할 때 지켜야 할 제품 계약이다. 기존 `app.js`, `index.html`, `app.css`를 변경하지 않고 설계와 순수 로직을 분리했다.

## 1. 진입 및 역할 계약

- 인증·프로필 로딩이 끝나기 전에는 진단 화면이나 대시보드를 잠깐이라도 노출하지 않는다(`boot/loading`).
- `role === "student"`이며 유효한 `assignedLevel`(1~4)이 없는 최초 사용자만 온보딩을 실행한다.
- 교사/관리자는 온보딩과 단계 잠금을 적용하지 않고 기존 역할별 홈으로 보낸다.
- 이미 `diagnosticStatus === "complete"`이고 `assignedLevel`이 있는 학생은 온보딩을 반복하지 않는다.
- 완료 상태인데 단계가 없거나 단계 값이 범위를 벗어나면 데이터 오류로 간주한다. 모든 단계를 잠그고 재시도/교사 문의 화면을 표시해야지 임의 단계를 열면 안 된다.

## 2. 상태와 전이

정상 경로:

```text
BOOT
  ├─ 학생·미배정 → INTRO[0]
  ├─ 학생·배정됨 → DASHBOARD(assignedLevel)
  └─ 교사/관리자 → ROLE_HOME

INTRO[0] --NEXT--> INTRO[1] --NEXT--> ... INTRO[4]
INTRO[4] --NEXT--> QUESTION(tier=4,index=0)
QUESTION --SELECT_OPTION--> QUESTION(selectedOptionId)
QUESTION(selected) --SUBMIT--> 다음 QUESTION 또는 TIER_RESULT

4단계 점수 >=2 → ASSIGNED(4)
4단계 점수 < 2 → QUESTION(tier=3,index=0)
3단계 점수 >=2 → ASSIGNED(3)
3단계 점수 < 2 → QUESTION(tier=2,index=0)
2단계 점수 >=2 → ASSIGNED(2)
2단계 점수 < 2 → ASSIGNED(1)
ASSIGNED --저장 성공 + CONTINUE--> DASHBOARD
```

핵심 불변식:

- 각 티어는 정확히 세 문제이고 합격선은 정확히 `2`이다.
- 높은 단계부터 검사하며 합격 즉시 종료한다. 따라서 학생은 3, 6, 9문제 중 하나만 푼다.
- 문제 하나당 최초 `SUBMIT`만 채점한다. 선택 전 제출과 잘못된 보기 ID는 no-op이다.
- 정답 여부는 진단 중 보여 주지 않는다. 오답 피드백 때문에 뒤 문제 수행이 달라지는 것을 막는다.
- 새로고침 복구용 상태에는 현재 티어/문항, 제출된 문항 ID, 점수, 콘텐츠 버전을 저장한다. 이미 제출한 문항은 재채점하지 않는다.
- 클라이언트 상태의 `assignedLevel`만 믿고 단계를 열지 않는다. 저장 성공 후 서버가 돌려준 정규화 프로필로 접근권한을 다시 계산한다.

권장 이벤트:

- `HYDRATE_PROFILE(profile)`
- `NEXT`
- `SELECT_OPTION({ optionId })`
- `SUBMIT`
- `PERSIST_STARTED`, `PERSIST_SUCCEEDED(profile)`, `PERSIST_FAILED(error)`
- `CONTINUE`
- `RETRY_PERSIST`

`SUBMIT`은 빠른 연속 탭을 막기 위해 처리 중 버튼을 잠그고, reducer/서버 모두 문항 ID 기준 멱등성을 보장한다.

## 3. 고정 콘텐츠

소스 오브 트루스는 `student-onboarding-diagnostic-core.mjs`이다.

- 온보딩: 화자명이 모두 **에이두**인 한국어 대사 5줄
- 4단계 Easy: 짧은 생활문을 읽는 3지선다 문해 문제 3개
  - 비 때문에 우산을 쓴 까닭
  - 배고픈 강아지가 밥그릇 앞에 앉은 까닭
  - 운동회 날 준호가 간 장소
- 3단계: 사과/바나나/딸기를 각각 채소·버섯 등과 구별하는 과일 카드 3개
- 2단계: 한국어 TTS로 `기역`, `니은`, `아`를 들려주고 `ㄱ`, `ㄴ`, `ㅏ`를 찾는 3개
- 정답 위치는 a/b/c에 한 번씩 배치해 위치 편향을 줄였다.

콘텐츠를 바꾸면 `contentVersion`을 올리고 기존 진행 중 시도는 같은 버전으로 끝내거나 처음부터 새 버전으로 재시작해야 한다. 진행 도중 문제 묶음을 섞으면 안 된다.

## 4. 화면 계약

### 온보딩

- 학생 온보딩은 앱 셸 위의 **전체 화면 모달**이다: `position: fixed; inset: 0; width: 100%; min-height: 100dvh; z-index`는 기존 모달/HUD보다 높게 둔다.
- 배경 콘텐츠는 `inert`와 `aria-hidden="true"`로 비활성화하고, 포커스는 오버레이 안에 가둔다. 브라우저 뒤로 가기나 Escape로 진단을 우회하지 못한다.
- 화면 하단에 대화 상자를 두고 화자명 `에이두`를 본문과 분리해 항상 명시한다.
- 큰 캐릭터 이미지는 오른쪽 아래에 둔다. 장식 이미지가 아니면 `alt="한글 탐험 도우미 에이두"`; 대사와 중복된 장식이면 빈 `alt`를 사용한다.
- `다음` 버튼 한 번에 대사 한 줄만 전진한다. 5번째 줄의 `다음`이 첫 진단 문제를 연다.

### 문제

- 진행 표시는 `3문제 중 1번째`처럼 텍스트로도 제공한다. 전체 진단이 최대 9문제라고 표시해 실패를 암시하지 않는다.
- 보기 그룹은 `<fieldset><legend>` 또는 `role="radiogroup"`과 접근 가능한 그룹명을 사용한다.
- 보기 선택과 제출을 분리한다. 선택 전 `답 제출`은 disabled이다. 제출 후 전이 중 재클릭을 막는다.
- 과일 카드는 실제 이미지 또는 일관된 그림 자산을 권장한다. 이미지의 대체 텍스트와 카드 아래 낱말을 함께 제공하며 색/이모지만으로 정답을 구분하지 않는다.
- TTS 문항은 화면에 목표 음가를 텍스트로 누설하지 않는다. `소리 듣기`와 `다시 듣기` 버튼을 제공하고 자동 재생 실패 시에도 수동 재생할 수 있어야 한다. `speechSynthesis` 미지원/실패 시 녹음 자산으로 대체하고, 둘 다 실패하면 네트워크/오디오 오류 복구 화면을 보여 준다(오답 처리 금지).
- TTS 재생 버튼의 접근성 이름은 `문제 소리 듣기`로 하며 재생 중 상태는 `aria-live="polite"`로 알린다.

### 결과와 잠금

- 결과는 점수나 “낮은 단계” 표현보다 `너에게 맞는 3단계를 찾았어!`처럼 중립적으로 안내한다.
- `assignedLevel=N`이면 N단계 카드만 실제 버튼/링크로 활성화한다. 나머지는 잠금 아이콘, `aria-disabled="true"`, 탭 순서 제외를 적용한다.
- CSS로 흐리게만 만드는 것은 잠금이 아니다. 클릭 핸들러와 직접 URL/함수 호출도 동일한 서버 기반 route guard로 차단한다.
- 비정상/미확정 단계에서는 fail-closed로 네 단계 모두 잠근다.

## 5. 저장 계약

권장 서버 레코드(필드명은 기존 데이터 어댑터에 맞춰 조정 가능):

```json
{
  "diagnosticStatus": "complete",
  "diagnosticVersion": "student-placement-v1",
  "assignedLevel": 3,
  "completedAt": "server timestamp",
  "scores": { "4": 1, "3": 2 },
  "answeredQuestionIds": [
    "literacy-easy-1", "literacy-easy-2", "literacy-easy-3",
    "fruit-card-1", "fruit-card-2", "fruit-card-3"
  ]
}
```

- 단계 배정과 완료 상태는 한 번의 원자적 서버 쓰기로 저장한다.
- `completedAt`은 클라이언트 시각이 아니라 서버 시각을 쓴다.
- 저장 실패 시 결과 화면에 머물고 모든 단계는 잠근 채 재시도를 제공한다.
- 이미 완료된 진단은 일반 학생이 다시 덮어쓸 수 없게 한다. 재진단은 교사의 명시적 권한과 감사 기록이 있는 별도 흐름으로 처리한다.
- 서버도 `assignedLevel`이 1~4인지, 점수로부터 계산한 단계와 일치하는지 검증한다. 가능하면 정답 채점/배정은 서버에서 수행한다.

## 6. 모바일·접근성 수용 기준

- 320 CSS px 너비와 200% 확대에서 가로 스크롤 없이 핵심 문구, 보기, 제출 버튼을 사용할 수 있다.
- 터치 대상은 최소 44×44 CSS px, 보기 간 간격은 최소 8px이다.
- `100vh` 대신 `100dvh`와 safe-area inset을 사용해 모바일 주소창/홈 인디케이터에 가리지 않는다.
- 짧은 가로 화면에서는 캐릭터가 대화/버튼을 가리지 않도록 축소하거나 장식 영역을 접고, 대화 영역은 세로 스크롤 가능하게 한다.
- 포커스 표시, 키보드 Tab/Shift+Tab/Space/Enter 동작, 4.5:1 본문 대비를 보장한다.
- 대사 변경은 대화 본문에 포커스를 강제로 옮기지 말고 `aria-live="polite"`로 알린다. 문제 전환 때 문제 제목에 프로그래밍 방식으로 포커스를 둔다.
- `prefers-reduced-motion: reduce`에서는 캐릭터/전환 애니메이션을 제거한다.

## 7. 정적·통합 테스트 계약

순수 로직 테스트(`node --test tools/test-student-onboarding-diagnostic-core.mjs`):

1. 대사는 정확히 5줄이고 모든 줄의 명시적 화자는 `에이두`이다.
2. 다섯 번의 `NEXT` 뒤 4단계 첫 문제로 간다.
3. 4/3/2단계별 정확히 3문제, 각 3보기, 유효 정답 1개, 전체 ID 고유성을 검증한다.
4. 모든 경계 점수(0,1,2,3) 조합에서 4→3→2→1 분기를 검증한다.
5. 무선택/잘못된 선택/중복 제출이 점수를 바꾸지 않음을 검증한다.
6. 1~4 어느 배정에서도 열린 단계가 정확히 하나임을 검증한다.
7. 학생 최초 진입만 실행되고 교사/이미 배정된 학생은 우회함을 검증한다.

화면 통합 테스트에서 추가할 안정적인 selector:

- `[data-testid="student-onboarding"]`
- `[data-testid="onboarding-speaker"]`
- `[data-testid="onboarding-line"]`
- `[data-testid="onboarding-next"]`
- `[data-testid="diagnostic-question"]`
- `[data-testid="diagnostic-progress"]`
- `[data-testid="diagnostic-option-{id}"]`
- `[data-testid="diagnostic-submit"]`
- `[data-testid="diagnostic-tts"]`
- `[data-testid="stage-card-{1..4}"]`

E2E 필수 시나리오:

- `L4: 2/3 → level4`, 이후 3/2단계 문제는 렌더링되지 않는다.
- `L4: 1/3, L3: 2/3 → level3`.
- `L4: 1/3, L3: 1/3, L2: 2/3 → level2`.
- `L4: 1/3, L3: 1/3, L2: 1/3 → level1`.
- 저장 API 실패 → 결과 유지, 네 단계 잠금, 재시도 후 정확히 한 단계 활성화.
- 새로고침 → 제출된 문항 중복 채점 없이 복구.
- 잠긴 카드 클릭 및 직접 라우트 진입 → 차단.
- 교사 로그인 → 학생 온보딩 미노출.
- 키보드 전용 진행, 스크린리더 이름/상태, 320px/가로 모바일, reduced-motion 검증.
