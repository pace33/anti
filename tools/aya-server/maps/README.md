# 에이두 로블 고전 맵 출처

원본 저장소: https://github.com/Roblox/Old-Open-Source-Levels
원본 커밋: ab6927b221ab4a91a5664f69b5be64b98e782e75
원본 라이선스: MIT / Copyright (c) 2020 Roblox Corporation. 전문은 `LICENSE-ROBLOX.txt`에 포함한다.

- Crossroads: `ROBLOX/Miscellaneous/Crossroads.rbxl`, SHA-256 `acec28f504e6dc130a2409b95a01d72882d3503f0abc91d81368a0ac839e0edf`
- Rocket Arena: `ROBLOX/Miscellaneous/Rocket Arena.rbxl`, SHA-256 `90ab441a9151a89c5d2e6dc15d318748a4ee19bf04f0d42eb10381e22731c637`

현재 서비스에는 에이두용으로 조정한 `.rbxlx`를 사용한다. 원본 지형/건축물을 유지하고, 계정·맵 검증용 서버 로그 스크립트를 추가했다. 오래된 외부 LinkedSource/텔레포트/동적 코드 로딩은 비활성화하며 외부 자산에 의존하는 원래 무기 세트는 제거했다. 따라서 원본 게임의 모든 무기·온라인 서비스가 동일하게 재현된다고 주장하지 않는다. 두 고전 맵 모두 현재는 탐험 모드다.

## 캐릭터 모션

`character-motion.lua`는 자체 작성한 자산 없는 R6 관절 애니메이션이다. 실제 이동량으로 걸음 위상을 계산하고 양팔·양다리를 반대 방향으로 움직이며, 정지 시 부드럽게 기본 자세로 돌아온다. 점프·낙하·앉기 자세와 작은 몸통 움직임도 포함한다. 기존 관절의 C0 원점을 보존하며 위치·속도·Anchored를 강제로 설정하지 않는다. 생성 직후 Character.Parent가 아직 비어 있을 수 있어 부모·관절 준비를 기다리고, 캐릭터 변경/사망/퇴장 시 연결과 이전 리그 상태를 정리한다. 구형 엔진에서 없는 UpVector 대신 변환한 기준 벡터로 실제 팔다리 방향을 측정한다.

회귀 테스트: `uv run --with lupa python tools/aya-server/tests/test_character_motion.py`. 이 테스트는 포즈 수학·상태 전환을 검사한다. 실제 관절 움직임은 별도로 네이티브 엔진에서 입력 전후의 몸통 상대 팔다리 방향과 렌더링 화면을 확인해야 한다. 최신 Roblox R15 캐릭터 전체를 구현한 것은 아니다.

`test-park.rbxlx`는 기존 에이두 공원이다.

비공개 엔진 바이너리는 이 저장소에 포함하지 않는다. 맵 파일은 교사가 서버 카탈로그에서 선택하며, 임의 URL/경로/스크립트 업로드를 허용하지 않는다. 캐릭터 외형은 R6 색상 프리셋으로, 서버 검증 UID에 저장하고 다음 입장 시 네이티브 엔진 설정으로 전달한다. 맵 서버의 `avatar-colors.lua`도 루프백 전용 `/host-avatar/<UserId>`에서 현재 접속한 검증 계정의 색상만 조회하여 실제 캐릭터 파트에 적용한다. 계정 토큰·UID·호스트 비밀 키는 맵에 넣지 않는다.

구형 XML 파서는 공백이 있는 자기닫힘 태그(`<null />` 등)를 거부할 수 있으므로 배포 XML은 명시적인 닫힘 태그를 사용한다. 호스트 준비 판정은 단순한 `Server ready`뿐 아니라 해당 맵의 `ROBL_MAP_READY <id>` 로그를 요구한다. 빈 기본 월드가 열린 것을 맵 로딩 성공으로 처리하지 않는다.
