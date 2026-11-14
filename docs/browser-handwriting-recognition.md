# 브라우저 온디바이스 손글씨 판독

교과 맞춤쓰기의 기본 캔버스 판독은 별도 module Worker의 ONNX Runtime Web으로 실행한다. 사진 문항 추출이나 다른 AI 기능의 경로는 바꾸지 않는다. `?handwriting=gemma`는 기존 비채점 시험 전용 경로다.

## 모델과 배포 파일

- 모델: `Rebeccaaaaaaaa/korean-handwriting-rec`, revision `7ebe489f4a8880af35ae873258ab3ab993b3ab1f`, Apache-2.0. 원본: https://huggingface.co/Rebeccaaaaaaaa/korean-handwriting-rec/tree/7ebe489f4a8880af35ae873258ab3ab993b3ab1f
- 모델 약 14.8MB, 문자표 약 47KB. `assets/korean-hwr-v1/LICENSE` 보존.
- ONNX Runtime Web 1.31.1 (MIT), WebGPU bundle 및 asyncify WASM. `vendor/onnxruntime-web-1.31.1/LICENSE`와 `ThirdPartyNotices.txt` 보존.
- 최초 런타임 포함 취득량 약 44MB. 모델/문자표/WASM의 정확한 크기와 SHA-256은 `handwriting-ocr-core.mjs`에 고정한다. 검증되지 않은 다운로드/캐시는 추론에 사용하지 않는다.
- 모델은 첫 확인 때만 준비한다. 기본 WebGPU, 미지원·초기화 실패·GPU 실행 실패 때 같은 기기의 WASM. 외부 서버 추론 폴백은 없다.
- 모델/문자표/WASM은 Cache Storage에 보관하고 매 재사용 시 무결성을 검증한다. 브라우저 저장 제한/용량 부족이면 캐시 없이 실행한다. 앱 전체의 오프라인 지원을 뜻하지 않는다.

## 판독과 채점

이미지는 흰 배경 합성, 모든 획을 포함한 전체 줄 여백 크롭, 높이 48 비율 유지, BGR/NCHW 정규화를 거친다. CTC greedy decoding은 문자 인덱스표만 사용하며 기대 정답·문제·단어 보정 사전을 받지 않는다. 인식 후 앱이 전체 문자열을 기존 정답 비교기로 비교한다.

판독 confidence는 정확도 비율이 아니다. 빈 값·불명확한 값·confidence 0.9 미만이면 미채점으로 두고 재도전과 문항 점수를 소비하지 않는다. 명확한 오답은 기존 재도전 흐름을 유지하며 최초 정답 1점, 재도전 정답 0.5점이다. 응답 시 계정·세션·문항·획 스냅샷이 바뀌면 결과를 폐기한다.

## 검증 범위

- `node --test tools/test-handwriting-on-device.mjs tools/test-curricular-ai-grading-strict.mjs tools/test-curricular-writing-drafts.mjs tools/test-gemma-handwriting-preview.mjs`
- 실제 브라우저 검증은 동일 통제 입력에 대해 WebGPU/WASM 반복 판독과 캐시 재사용을 구분한다. 근접 오답·추가 문자·문장 전사와 최종 정오판정을 별도 기록한다.
- 앱 검증은 전용 QA 계정에서 실제 포인터 입력 → 실제 모델 → 재도전 → 다음 문항 → 완료 → 자체 서버 저장 → 새 브라우저 컨텍스트 재조회까지 수행한다.
- 통제된 학교/학고 표본 성공은 다양한 사람의 손글씨나 실제 모바일 기기의 정확도를 보증하지 않는다. 데스크톱 warm 추론 시간도 모바일 전체 응답 시간과 다르다.
- 공개 배포 검증은 정본 커밋, Pi sync marker, GitHub Actions, 공개 파일 바이트, 공개 앱 실제 흐름을 각각 확인한다.
