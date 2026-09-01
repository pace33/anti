# 에이두 수학

초등 1~6학년 수학을 4개 영역과 3개 학년군으로 연결한 나선형 학습 웹앱입니다.

## 실행 구조

- `index.html`: 시작, 로그인, 대시보드, 기록, 복습, 교사 학급 화면
- `math.js`: Firebase 로그인과 난이도별 시간 퀴즈
- `math-quality-core.mjs`: 시계 문항·오개념 선택지·문항 경험치·레벨업 보상 공통 정책
- `math-services.js`
- `math-spiral.js`: 백업의 51개 개념과 6단계 학습 활동
- `math-domain-navigation.js`: 영역별 학년군 지도와 진행률
- `math-learning-records.mjs`: 진도, 숙련도, 주간 성장, 추천 계산
- `aiedu-data-adapter.js`: `/db-api/korean/v2` 에이두 데이터 서버 어댑터

Firebase는 인증에만 사용합니다. 사용자 프로필, 수학 진도, 시도 기록, 교사 배정,
상점 데이터는 에이두 데이터 서버가 기준입니다.

## 데이터 컬렉션

- `users/{uid}`: 공용 프로필, 포인트, 경험치, 주의 토큰
- `mathStudentProgress/{uid__nodeId}`: 학생별 개념 진도와 숙련도
- `mathAttempts/{attemptId}`: 정답·오답과 표현 단계별 시도. 시계 퀴즈 정답 시도는 문제별 고정 ID로 중복 지급을 방지
- `mathAssignments/{assignmentId}`: 교사가 학생에게 배정한 개념
- `shopItems/{itemId}`: 국어와 공유하는 교사 상점 물품
- `users/{uid}/assignedShopItems/{itemId}`: 학생별 상점 배부
- `purchaseLog/{purchaseId}`: 공용 구매 기록

## 경험치와 레벨업 보상

- 모든 수학 정답 문항은 경험치를 지급합니다. 일반 나선형 문항은 기본 `+2 EXP`입니다.
- 시간 퀴즈는 쉬움 `+1`, 보통 `+3`, 어려움 `+5`, 매우 어려움 `+10 EXP`입니다.
- 경험치 100을 채우면 레벨이 1 오르고 공용 지갑에 `1,000원`을 지급합니다.
- 경험치·레벨·`balance`·`coins`·`aeduTokens`·주의토큰은 한 트랜잭션에서 함께 갱신합니다.

## 검증

저장소 루트에서 다음 검증을 실행합니다.

```text
node --check math/math.js
node --check math/math-services.js
node --check math/math-spiral.js
node --check math/math-domain-navigation.js
node tools/test-math-learning-records.mjs
node tools/test-math-quality.mjs
node tools/audit-math-question-bank.mjs
node tools/validate-math-site.mjs
```

`aiedue-math-backup/`은 복원 기준 자료이므로 수정하지 않습니다.

## 운영 서버 필수 검증

`/db-api/korean/v2`는 Firebase ID 토큰의 UID를 문서의 `uid`·`studentId`와 대조하고,
교사 역할·학급 소속·개념 배정 권한·경험치와 포인트 증감 규칙을 서버에서 다시 검증해야
합니다. 화면에서 전달하는 역할이나 보상값은 표시와 요청 편의를 위한 값일 뿐 권한의
근거로 사용하지 않습니다. 시도 기록이 1,200건을 넘는 장기 운영 계정은 서버
페이지네이션을 추가합니다.
