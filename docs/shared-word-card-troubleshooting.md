# 뜻·그림 카드 생성과 오류 복구

## 사용자 동선

3단계 교과 맞춤쓰기에서 단어 뜻 버튼을 누르면 해당 단어의 공용 카드부터 조회합니다. 게시 완료된 카드가 없으면 뜻과 그림을 생성하고 에이두 자체 데이터 서버의 `sharedWordCardsV1`에 저장합니다. 기존 카드가 있으면 재생성하지 않고 저장된 뜻과 그림을 보여 줍니다.

- 학습 사진: 단어 추출에만 사용합니다.
- 그림 원본: `word-card-character-reference.jpg`의 공식 새싹 후드 캐릭터입니다.
- 그림 실행: AntiAI의 대화형 이미지 편집 세션을 사용합니다. 텍스트 단독 그림이나 로컬 합성으로 대체하지 않습니다.
- 계정 인증은 Firebase, 카드·그림 저장은 에이두 자체 데이터 서버를 사용합니다.
- 현재 저장 계약은 `schemaVersion: 1`, `generationVersion: 1`입니다. 오류 해결을 위해 프런트 버전만 올리지 않습니다.

## 오류 객체 표시

이미지 API는 `error: { message: ... }` 형태를 반환할 수 있습니다. `story-library-utils.mjs`의 `imageJobErrorMessage()`가 중첩 오류 메시지와 기존 문자열 오류를 함께 처리합니다. 오류 객체 자체를 화면에 표시하지 않고, 메시지가 없으면 한국어 기본 안내를 사용합니다. 세션 생성, 작업 생성·조회·다운로드, 단어 설명에서 같은 처리 함수를 사용합니다.

## 이미지 실행 검증

서버는 이미지 전용 주 에이전트로 `view_file` 및 `generate_image`만 실행하며 자동 서브에이전트 위임을 금지합니다. 샌드박스와 공식 원본 경로, 생성 횟수, 대화, 결과 파일의 검증은 그대로 유지합니다. 서버 정본과 배포 절차는 에이두 저장소 `docs/antigravity-api.md`에서 관리합니다.

## 회귀 확인

```bash
node --test tools/test-image-job-errors.mjs tools/test-word-card-utils.mjs tools/test-word-card-integration.mjs tools/test-korean-ai-low-default.mjs tools/test-story-library-utils.mjs
node tools/validate-site.mjs
```

실제 브라우저에서는 오류가 난 단어 다시 열기 → 실제 뜻·그림 생성 → 이미지 표시 → 자체 데이터 서버의 게시 완료 및 두 버전 값 확인 → 다시 열기에서 추가 AI 요청 없이 재사용까지 검증합니다. PC와 좁은 화면에서도 동일한 카드가 표시되는지 확인합니다. 테스트용 임시 파일은 배포 루트에 커밋하지 않습니다.
