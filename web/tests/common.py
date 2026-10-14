"""시험 스크립트 공통: 레포 경로, 브라우저 실행, CDN 라이브러리를 로컬 파일로 연결."""
import os
from pathlib import Path

TESTS = Path(__file__).resolve().parent
REPO = TESTS.parents[1]
R = str(REPO) + "/"                      # 원자료/, mock/ 등 레포 파일 경로 앞부분
OUT = TESTS / "out"                      # 만든 페이지와 시험 결과 파일 (git에 올리지 않음)
LIB = TESTS / "node_modules"             # setup.sh가 npm으로 받는 docx·jszip
DOCX_UMD = LIB / "docx/build/index.umd.js"
JSZIP = LIB / "jszip/dist/jszip.min.js"


def launch(p):
    """Chromium 실행. CHROMIUM_PATH가 있으면 그 파일, 없으면 Playwright 기본 브라우저."""
    exe = os.environ.get("CHROMIUM_PATH") or ("/opt/pw-browsers/chromium" if Path("/opt/pw-browsers/chromium").exists() else None)
    return p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()


def route_libs(pg):
    """페이지가 CDN에서 받는 docx·jszip을 로컬 파일로 돌려준다(인터넷이 막혀도 시험 가능). 글꼴은 비운다."""
    if DOCX_UMD.exists():
        pg.route("https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js", lambda r: r.fulfill(path=str(DOCX_UMD), content_type="application/javascript"))
    if JSZIP.exists():
        pg.route("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", lambda r: r.fulfill(path=str(JSZIP), content_type="application/javascript"))
    pg.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))


# 예시 메뉴(🧪 예시로 채워 보기)의 항목. 예전 버튼 이름으로 불러도 된다.
PRESET_KEYS = {
    "신규: 펀드변경 원자료": "fund", "신규: 자동재배분 러프 메모": "auto",
    "갱신: 기존 Word v1 + 규정 변경 메모": "updWord", "갱신: 확정본 v2 + 규정 변경 공지 (변경 강조 시연)": "updMemoV2",
    "갱신: 기존 엑셀 v1 '펀드변경' 시트": "updExcel", "추가: Word 1~6장 + 변액 자동재배분": "addWord", "추가: 엑셀 v1 + 자동재배분 시트": "addExcel",
}


def use_preset(pg, name):
    """자료 입력 화면 오른쪽 위 '예시로 채워 보기' 메뉴를 열고 예시를 고른다."""
    key = PRESET_KEYS.get(name, name)
    if not pg.locator("#preset-menu[open]").count():
        pg.click("#preset-menu > summary")
    pg.click(f"[data-preset={key}]")
