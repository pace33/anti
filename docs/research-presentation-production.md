# 실화면 중심 발표 · 제작과 검증

## 구성

- 본 발표 12장, 배정 시간 합계 600초. 질의응답 참고 3장을 더해 총 15장입니다.
- 본문 10장에 현재 에이두 한글의 실제 UI를 넣었습니다. 그림으로 재구성한 가짜 화면이 아닙니다.
- 출발점: 특수학급에서 배운 한글이 통합학급의 실제 교과 참여로 이어지도록 하기 위해 만들었습니다.
- 이야기: 만든 이유 → 맞춤–이음–자람의 실제 학습 장면 → 제출보고서의 점수와 참여 변화 → 다음 지도·한계.
- 실화면은 학생 테스트 계정/기본 사용법 체험입니다. 연구 당시 학생 수행이나 효과의 증거가 아닙니다. `research-prep/screens/README.md`를 함께 봅니다.
- 연구 수치는 `docs/research-submitted-report-basis.md`를 따릅니다. 원본 HWP·학생 원자료는 저장소에 추가하지 않습니다.

## 정본과 산출물

1. 면접 답변: `tools/research-answers/*.mjs` → `tools/build-research-answers.mjs` → 웹 JSON + Markdown 90문항.
2. 발표: `tools/research-presentation.json` → `tools/build-research-presentation.cjs` → 편집 가능한 PPTX·장별 발표 노트·Markdown 대본·메타데이터.
3. PPTX → LibreOffice PDF → `tools/render-research-presentation.py` → 실제 슬라이드 JPG 15장과 렌더 검사 결과.
4. `research-prep/presentation.html`: 큰 화면·이전/다음·키보드·전체화면·전체 썸네일·대본·다운로드.
5. 기존 `full.html#talk`: 기본 대본/개인 대본 분리, 실제 슬라이드 미리보기, 10분 타이머 유지.

## 재생성

PptxGenJS 4.0.1, LibreOffice, Python의 PyMuPDF와 Pillow로 확인했습니다. 의존성은 저장소 외부에 설치해도 됩니다.

```bash
PPTXGENJS_MODULE=/absolute/path/to/pptxgenjs node tools/build-research-presentation.cjs
node tools/build-research-answers.mjs
soffice -env:UserInstallation=file:///ABSOLUTE/ISOLATED/PROFILE --headless \
  --convert-to 'pdf:impress_pdf_Export:{"UseTaggedPDF":{"type":"boolean","value":"false"},"PDFUACompliance":{"type":"boolean","value":"false"}}' \
  --outdir research-prep research-prep/presentation-10min.pptx
python tools/render-research-presentation.py
node tools/build-research-answers.mjs --check
node --test tools/test-research-prep.mjs tools/test-research-prep-simple.mjs tools/test-research-answers.mjs tools/test-research-presentation.mjs
node tools/validate-site.mjs
git diff --check
```

Windows에서는 LibreOffice 실행 경로와 profile URI를 실제 환경에 맞춥니다. PNG IHDR의 실제 너비·높이로 contain 배치를 계산해 없는 라이브러리 helper를 호출하지 않습니다. PDF는 태그 구조 경고를 피한 일반 PDF이며 접근성 태그 검증을 주장하지 않습니다.

## 확인 기준

- PDF 15쪽, PPTX 15장·노트 15개, 본문 실화면 포함 10장.
- PDF 빈 쪽/범위 밖 텍스트 없음. 전체 렌더와 바뀐 장의 원본 해상도 렌더를 확인합니다.
- 시간 600초는 배정표이지 실제 낭독 측정이 아닙니다. 대본을 소리 내 읽고 화면을 짚는 시간을 포함해 리허설합니다.
- 기존 localStorage 키 `aiedue-korean-research-prep-v1`의 메모·중요·완료·개인 대본·체크·근거 노트를 보존합니다. 새 뷰어는 이 저장소를 쓰지 않습니다.
- 공개 배포는 main 통합·push 후 `.anti-sync-commit`, 추적된 `research-prep/` 전체 파일의 Git blob, 실제 PC/모바일 폭 브라우저 흐름으로 별도 검증합니다.
- 정적 준비실 수정 때문에 운영 API·학생 데이터·Caddy·다른 게임을 바꾸지 않습니다.
