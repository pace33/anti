# 에이두 로블 고전 맵 출처

원본 저장소: https://github.com/Roblox/Old-Open-Source-Levels
원본 커밋: ab6927b221ab4a91a5664f69b5be64b98e782e75
원본 라이선스: MIT / Copyright (c) 2020 Roblox Corporation. 전문은 `LICENSE-ROBLOX.txt`에 포함한다.

- Crossroads: `ROBLOX/Miscellaneous/Crossroads.rbxl`, SHA-256 `acec28f504e6dc130a2409b95a01d72882d3503f0abc91d81368a0ac839e0edf`
- Rocket Arena: `ROBLOX/Miscellaneous/Rocket Arena.rbxl`, SHA-256 `90ab441a9151a89c5d2e6dc15d318748a4ee19bf04f0d42eb10381e22731c637`

현재 서비스에는 에이두용으로 조정한 `.rbxlx`를 사용한다. 원본 지형/건축물을 유지하고, 계정·맵 검증용 서버 로그 스크립트를 추가했다. 오래된 외부 LinkedSource/텔레포트/동적 코드 로딩은 비활성화하며 원래 무기 세트는 외부 자산 의존성이 없는 자체 검으로 교체했다. 따라서 원본 게임의 모든 무기·온라인 서비스가 동일하게 재현된다고 주장하지 않는다. 로켓 아레나도 현재는 고전 맵 탐험·검 플레이 모드다.

`classic-sword.lua`는 에이두 자체 작성 코드다. `test-park.rbxlx`는 기존 에이두 공원이다.

비공개 엔진 바이너리는 이 저장소에 포함하지 않는다. 맵 파일은 교사가 서버 카탈로그에서 선택하며, 임의 URL/경로/스크립트 업로드를 허용하지 않는다. 캐릭터 외형은 R6 색상 프리셋으로, 서버 검증 UID에 저장하고 다음 입장 시 네이티브 엔진 설정으로 전달한다. 맵 서버의 `avatar-colors.lua`도 루프백 전용 `/host-avatar/<UserId>`에서 현재 접속한 검증 계정의 색상만 조회하여 실제 캐릭터 파트에 적용한다. 계정 토큰·UID·호스트 비밀 키는 맵에 넣지 않는다.

구형 XML 파서는 공백이 있는 자기닫힘 태그(`<null />` 등)를 거부할 수 있으므로 배포 XML은 명시적인 닫힘 태그를 사용한다. 호스트 준비 판정은 단순한 `Server ready`뿐 아니라 해당 맵의 `ROBL_MAP_READY <id>` 로그를 요구한다. 빈 기본 월드가 열린 것을 맵 로딩 성공으로 처리하지 않는다.
