# 교과 맞춤쓰기 로딩·만화 피드백

- 2스텝 ‘단어의 뜻’: 공용 저장소 확인부터 뜻/그림 준비까지 기존 공통 에이두 로딩과 퍼센트를 표시합니다. 새 그림은 공식 캐릭터 참조 이미지로 편집하는 기존 경로를 유지합니다.
- 3스텝 받아쓰기 ‘확인’: 글씨 확인 중에는 노트에 쓰는 에이두와 예상 진행률을 표시하고 중복 확인을 막습니다. AI 응답과 해당 결과 기록이 완료되면 100%를 잠시 표시한 뒤 결과 말풍선을 엽니다.
- 정답: 기쁜 에이두와 ‘정답!’. 오답: 당황하지만 응원하는 에이두와 ‘앗! 다시 해보자!’.
- 첫 오답의 ‘다시 써볼게!’는 기존 재도전으로 돌아갑니다. 기존 첫 정답 1점, 재도전 정답 0.5점 규칙은 바뀌지 않습니다. 재도전까지 오답이면 다시 쓰기에서 연습하도록 안내하며 추가 재도전을 약속하지 않습니다.
- ‘계속하기’/‘다시 써볼게!’ 또는 Esc로 닫습니다. 결과창이 떠 있는 동안 뒤쪽 컨트롤을 누를 수 없고, 닫으면 포커스를 되돌립니다. 자동으로 다음 문제로 넘어가지 않습니다.
- AI 오류는 오답으로 연출하지 않고 로딩을 해제하고 기존 고정 오류 코드 안내와 확인 버튼을 복구합니다.
- 퍼센트는 서버가 실시간으로 제공하는 측정치가 아닌 **예상 진행률**입니다. 기다리는 동안 최대 92%, 완료 확인 시 100%입니다.

## 이미지 출처

`assets/classroom/grading-happy.webp`, `grading-retry.webp`는 `word-card-character-reference.jpg`를 AntiAI 이미지 편집 세션에 실제 업로드하여 만든 표정·포즈 변형입니다. 세션은 각각 생성/다운로드 후 종료했습니다. 텍스트 단독 생성이나 로컬 얼굴 합성이 아닙니다. 출력은 웹용 WebP로 크기/품질만 최적화했고, 출처 메타데이터는 `assets/classroom/grading-poses.json`에 있습니다.

## 검증

```sh
node --input-type=module --check < app.js
node --test tools/test-grading-feedback.mjs tools/test-curricular-ai-grading-strict.mjs tools/test-word-card-integration.mjs tools/test-curricular-writing-drafts.mjs tools/test-curricular-photo-transition.mjs
node tools/validate-site.mjs
```

UI 회귀 검사는 채점 결과/오류를 지연 제어하는 격리 브라우저로 수행할 수 있습니다. 이러한 검사는 말풍선·로딩·재도전 UI의 검증이며 실제 AI 필기 인식 정확도나 운영 계정 저장 E2E의 증거와 구분합니다.
