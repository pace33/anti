import json
import time
from collections import deque
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin

import requests
from PIL import Image

BASE = "https://aiedue.ddns.net"
ROOT = Path(__file__).resolve().parents[1]
SESSION_FILE = ROOT / ".hermes-tmp" / "session.json"
OUTPUT_DIR = ROOT / "assets" / "onboarding"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

IDENTITY = (
    "업로드한 공식 에이두 캐릭터와 완전히 같은 캐릭터로 유지해 주세요. "
    "둥근 복숭아색 얼굴, 검은 둥근 눈, 오른쪽 볼의 연두색 별, 머리 위 초록 새싹 두 잎, "
    "흰 꽃 장식이 달린 갈색 탐정 모자, 연두색 후드와 바지, 갈색 망토, 초록 운동화, "
    "굵고 부드러운 짙은 갈색 윤곽선과 따뜻한 아동 교육용 2D 일러스트 화풍을 정확히 유지합니다. "
    "글자, 말풍선, 로고, 다른 인물, 테두리, 잘린 신체는 넣지 마세요. 캐릭터 전신이 보여야 합니다. "
    "웹 UI 오른쪽 아래에 배치할 수 있도록 투명 배경 PNG 스타일, 캐릭터 주변에 적당한 여백을 둡니다. "
)

POSES = [
    ("aiedue-wave", "환하게 웃으며 한 손을 크게 흔들어 처음 만난 친구에게 인사하는 포즈. 반가움과 친근함이 잘 보이게 해 주세요."),
    ("aiedue-welcome", "양팔을 활짝 벌리고 에이두 한글 공간을 자신 있게 소개하는 포즈. 밝고 신나는 표정으로 바꿔 주세요."),
    ("aiedue-grow", "한 손으로 위쪽을 가리키고 다른 손에는 작은 새싹을 받쳐 들며 함께 성장하자고 설명하는 포즈. 희망차고 다정한 표정으로 바꿔 주세요."),
    ("aiedue-think", "한 손가락을 볼에 대고 고개를 살짝 기울여 상대의 한글 실력을 궁금해하는 생각하는 포즈. 호기심 많은 표정으로 바꿔 주세요."),
    ("aiedue-quiz", "작은 퀴즈 카드판을 한 손에 들고 다른 손으로 시작 버튼 방향을 안내하는 포즈. 기대에 찬 장난스러운 미소로 바꿔 주세요. 카드판에는 글자를 넣지 마세요."),
    ("aiedue-celebrate", "두 팔을 위로 올려 힘껏 축하하며 작은 별과 종이 조각이 캐릭터 주변에만 살짝 흩날리는 포즈. 매우 기쁘고 격려하는 표정으로 바꿔 주세요.")
]


def absolute(url):
    value = str(url)
    if value.startswith("/api/"):
        value = "/korean-ai" + value
    return value if value.startswith(("http://", "https://")) else urljoin(BASE, value)


def request_json(method, url, **kwargs):
    response = requests.request(method, absolute(url), timeout=120, **kwargs)
    response.raise_for_status()
    return response.json()


def wait_job(job):
    job_id = job["id"]
    token = job.get("jobToken") or job.get("token") or job.get("capabilityToken")
    status_url = job.get("statusUrl") or f"/korean-ai/api/image-jobs/{job_id}"
    deadline = time.time() + 25 * 60
    while time.time() < deadline:
        data = request_json("GET", status_url, headers={"X-Image-Job-Token": token, "Cache-Control": "no-store"})
        status = data.get("status")
        print(f"JOB {job_id} {status}", flush=True)
        if status == "completed":
            image = ((data.get("result") or {}).get("images") or [None])[0]
            if not image or not image.get("url"):
                raise RuntimeError("completed job has no image URL")
            return token, image
        if status in {"failed", "expired", "cancelled"}:
            raise RuntimeError(data.get("error") or data.get("message") or f"job {status}")
        time.sleep(3)
    raise TimeoutError(f"job {job_id} exceeded 25 minutes")


def download(job_id, token, image, output_stem):
    response = requests.get(absolute(image["url"]), headers={"X-Image-Job-Token": token}, timeout=120)
    response.raise_for_status()
    mime = response.headers.get("content-type", "image/png").split(";", 1)[0]
    path = OUTPUT_DIR / f"{output_stem}.webp"
    remove_edge_checkerboard(response.content, path)
    print(f"SAVED {path.name} {path.stat().st_size} bytes (source {mime})", flush=True)
    return path


def remove_edge_checkerboard(image_bytes, output_path):
    source = Image.open(BytesIO(image_bytes)).convert("RGBA")
    pixels = source.load()
    width, height = source.size

    def is_checker(x, y):
        red, green, blue, _ = pixels[x, y]
        return max(red, green, blue) >= 175 and max(red, green, blue) - min(red, green, blue) <= 12

    queue = deque()
    visited = set()
    for x in range(width):
        if is_checker(x, 0): queue.append((x, 0))
        if is_checker(x, height - 1): queue.append((x, height - 1))
    for y in range(height):
        if is_checker(0, y): queue.append((0, y))
        if is_checker(width - 1, y): queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in visited or not is_checker(x, y):
            continue
        visited.add((x, y))
        pixels[x, y] = (*pixels[x, y][:3], 0)
        if x: queue.append((x - 1, y))
        if x + 1 < width: queue.append((x + 1, y))
        if y: queue.append((x, y - 1))
        if y + 1 < height: queue.append((x, y + 1))
    source.save(output_path, format="WEBP", lossless=True, method=6)


def main():
    session = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    headers = {
        "Content-Type": "application/json",
        "X-Image-Session-Token": session["token"]
    }
    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    try:
        for stem, pose in POSES:
            if any(OUTPUT_DIR.glob(f"{stem}.*")):
                print(f"SKIP {stem} already exists", flush=True)
                continue
            payload = {"prompt": IDENTITY + pose, "aspectRatio": "3:4"}
            turn = request_json(
                "POST",
                f"/korean-ai/api/image-edit-sessions/{session['id']}/turns",
                headers=headers,
                json=payload
            )
            job = turn.get("job") or turn.get("imageJob") or turn
            token, image = wait_job(job)
            path = download(job["id"], token, image, stem)
            manifest = [item for item in manifest if item.get("name") != stem]
            manifest.append({"name": stem, "file": path.name, "width": image.get("width"), "height": image.get("height")})
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    finally:
        try:
            response = requests.delete(
                absolute(f"/korean-ai/api/image-edit-sessions/{session['id']}"),
                headers={"X-Image-Session-Token": session["token"]},
                timeout=30
            )
            print(f"SESSION_DELETE {response.status_code}", flush=True)
        except Exception as exc:
            print(f"SESSION_DELETE_FAILED {exc}", flush=True)


if __name__ == "__main__":
    main()
