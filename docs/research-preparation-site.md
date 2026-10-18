# 에이두 한글 발표·면접 준비실

정본: 이 저장소의 `research-prep/`. 공개 경로: https://aiedue.ddns.net/korean/research-prep/

## 준비 기준과 콘텐츠

- 사용자 확인: 에이두 한글 출품, 발표 10분 + 질의응답 10분.
- 원 출품 보고서·회차·분과·학생 수·연구 결과는 미확보. 현재 프로그램 기능과 출품 당시 적용을 구분하고 실제 성과를 생성하지 않는다.
- 발표 8구간 합계 600초, 공통 질문 50개 + 에이두 한글 집중 질문 40개, 준비 체크 46개, 근거 노트 10개.
- 기존 조사 문서 7개 전문을 `content.json`에 보존하고 `research-library.md`로 다운로드한다. 원문의 과거 출품 주제 미확인 문구에는 웹 편집 메모를 추가했다.
- 공식 요강·결과, 개인 후기, 작성된 예상 질문은 구분한다. 2026 확보 요강의 해당 회차·분과 일치 여부는 개별 안내가 우선이다.
- 원문 50질문의 제목·답변 중심·준비 근거·후속·주의를 유지하고 문항별 에이두 한글 연결을 별도로 추가했다.

## 단순한 기본 화면

기본 진입은 `index.html` + `simple.mjs`/`simple.css`/`simple-data.mjs`의 세 탭이다.
- 유형별 질문: 기존 90문항을 중복 없이 8유형으로 묶고 검색·펼치기로 읽는다.
- 이전 질문: 두 참가 후기에서 확인한 10개 주제. 문항 원문이 아닌 재구성 연습 질문임을 명시하고 원문을 연결한다.
- 평가기준: 교수·학습/SW·AI 분과 배점과 최종 서류60/발표40 비율을 구분한다. 질문 포인트·준비 근거는 편집 해설이다.

이전 대시보드는 `full.html`에 보존하고 하단의 ‘발표 도구·전체 자료’로 접근한다. localStorage 키와 질문 ID를 유지하며 기존 대본·체크·근거 데이터를 덮어 없애지 않는다.

## 기능과 개인정보 경계

체크·별표·준비 완료·답변·대본·근거 노트는 전용 localStorage 키 `aiedue-korean-research-prep-v1`에만 저장한다. 서버 저장·계정 연동·AI 답변 평가는 없다. 민감정보를 기록하지 않는 안내, JSON 백업/검증된 불러오기, 인쇄·대본 다운로드를 제공한다. 메모는 공개 자산에 포함하지 않는다.

JSON 불러오기는 앱 ID/버전을 확인하고 알려진 ID·필드만 복사하며 입력 길이를 제한한다. 덮어쓰기 전 사용자 확인이 있다. HTML·메모는 텍스트 이스케이프한다. 원문 Markdown의 HTML은 실행하지 않으며 http/https 출처와 내부 자료집 링크만 렌더한다.

정적 공개 경로로 링크를 아는 누구나 접근할 수 있다. noindex는 검색 차단 요청일 뿐 접근 제어가 아니다. 출품 원보고서·학생 원자료·인증정보는 배포하지 않는다. 기존 한글 학습 서비스는 변경하지 않는다.

## 검증·배포

```
node --check research-prep/app.mjs
node --test tools/test-research-prep.mjs tools/test-research-prep-simple.mjs
node --check research-prep/simple.mjs
node --check research-prep/simple-data.mjs
node tools/validate-site.mjs
git diff --check
```

브라우저 검증: 90문항·검색·필터·별표·메모·XSS 텍스트·체크 저장·대본·키보드·타이머·8장 인쇄·대본 다운로드·독립 브라우저 백업/불러오기·무중복 모의면접·7문서·320~1440px 반응형·콘솔/리소스 오류.

최신 main 통합 후 정본 커밋/푸시, 기존 Pi `aiedue-anti-sync` 자동 배포를 사용한다. 공개 `.anti-sync-commit`과 index/JS/CSS/JSON/Markdown의 Git blob 및 공개 브라우저 흐름을 확인한다. 서비스·Caddy·계정·학생 데이터 변경은 필요하지 않다.
