# 에이두 로블 제작실·구형 에셋 호환

## 제작 기능
- 로비 `3D 맵 에디터`: 교사만 접근. 블록/공/기둥/경사/시작점, 3D 회전·확대, 선택·이동 드래그, 좌표·크기·회전·색상·등록 텍스처, 복제·삭제·되돌리기/다시 실행.
- 저장은 교사 계정 소유의 JSON + XML `.rbxlx`로 자체 Pi 서버에 보관. 제작맵은 로그인한 이용자의 맵 목록에 추가된다. 다른 교사 맵 편집은 금지하며 수정 revision 충돌을 검사한다.
- 저장과 적용은 분리한다. `저장 후 플레이`는 교사 확인 후 현재 공유 방을 재시작한다. 활성 맵 저장만으로 접속자 게임을 바꾸지 않는다.
- 캐릭터 에디터는 자기 계정의 앞머리/묶음 머리와 피부·헤어·재킷·셔츠·바지 색상을 저장한다. 닉네임·계정 ID·다른 이용자 설정을 수정할 수 없다. 로비 프리셋을 고르면 사용자 편집값이 초기화된다.
- 에디터 미리보기는 자체 Three.js(0.180.0, MIT) 기반의 가벼운 표현이다. 실제 게임은 기존 R6 물리·관절·만세 점프를 유지한다.

## Novetus 참조 및 권리 경계
참조: https://github.com/Novetus/Novetus-Map-Pack , https://github.com/Novetus/novetus-assetdelivery

맵 팩 README는 각 장소의 소유자 권리를 명시하며, 에셋 저장소 Legal Disclaimer는 혼합 라이선스를 명시한다. 따라서 전체를 허가된 자료로 간주하거나 공개 재배포하지 않는다. `novetus-reference.json`은 확인한 Git 트리 revision·형식·권리 상태의 메타데이터만 담는다. 제작실에서 이 제한과 지원 상태를 표시한다.

지원하는 경로 계약: `/Asset/?id=ID`, `/asset/?id=ID`, `/Asset.ashx?id=ID`, `rbxassetid://ID`, 등록된 `rbxasset://textures/...` 별칭. 실제 파일 제공은 고정 허용 목록으로 제한하며 원격 URL·경로 순회·미등록 ID를 프록시하지 않는다. PNG 체크/벽돌/나무 3종은 에이두 자체 제작이며 기존 외부 자료의 허가를 주장하지 않는다.

## 지형 가져오기
권한 있는 XML `.rbxl`, `.rbxlx`, XML이 들어 있는 `.rbxl.bz2`를 교사만 가져온다. 압축 1MB, 해제 16MB, 부품 800개, 시작점 8개, 좌표 ±512, 부품 크기 0.2~256 제한. DOCTYPE/ENTITY와 바이너리 장소는 거절한다. 원본 Script/LocalScript/ModuleScript, 도구, 외부 메시와 게임 규칙은 실행하지 않는다. 지원 지형만 다시 빌드하고 시작점을 보완한다. 제외한 스크립트·부품·외부 에셋 참조를 보고한다. 원본 BrickColor만 있는 일부 구형 맵은 기본 색상으로 가져올 수 있다.

`.mesh`, `.rbxm`, 오디오, 카탈로그 아바타, 외부 애니메이션 전체의 자동 호환은 구현/검증하지 않았다. 바이너리 장소는 적법한 파일을 XML로 변환한 뒤 가져와야 한다. 권리·변환을 확인한 에셋을 추가할 때 허용 목록, 파일 서명·크기, MIME/Range, 실제 native 소비까지 검증해야 한다.

## 운영·검증
제작맵은 기본 `~/.config/aiedue/robl-maps/`, 선택/캐릭터는 `~/.config/aiedue/robl-game.json`에 저장되고 public Git·정적 배포와 분리된다. 운영 노드에 Python3(제한된 XML/BZ2 변환용)가 필요하다. 고객 입력은 구조화된 지형/색상만 받는다. 게임 실행 XML의 계정·외형·관절 스크립트는 서버의 고정 trusted 소스에서 주입한다.

`node --test tools/aya-server/*.test.mjs`, `uv run --with lupa python tools/aya-server/tests/test_character_motion.py`. 계정 인증 실제 흐름, 학생 403, 소유권/수정 충돌, 에셋 401/PNG 소비, UI 편집·저장·재열기·모바일 클리핑, 만든 맵 native 준비·캐릭터·지면 위 이동까지 별도로 확인한다. `walk` 로그가 있어도 낭떠러지로 떨어진 스크린샷은 지형 표시 성공 증거가 아니다.
