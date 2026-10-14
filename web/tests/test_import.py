import sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from pathlib import Path
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; STUB = len(sys.argv) > 2
def routes(pg):
    route_libs(pg)
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(accept_downloads=True)
    if STUB: ctx.add_init_script(path=str(TESTS / "stub.js"))
    pg = ctx.new_page(); routes(pg); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#generate")
    # 폴더 2개 만들기: Word 갱신(v1, v1.1), 엑셀 갱신(v1, v1.1)
    for name in ["갱신: 기존 Word v1 + 규정 변경 메모", "갱신: 기존 엑셀 v1 '펀드변경' 시트"]:
        pg.click("#nav-input"); use_preset(pg, name); pg.wait_for_timeout(300)
        pg.click("#generate"); pg.wait_for_selector(".compare"); pg.fill("#author", "담당자A"); pg.click("#confirm"); pg.wait_for_selector("#save-status"); pg.click("#restart")
    # 이름 수정
    pg.click("#nav-folders"); pg.wait_for_selector(".folder-row")
    pg.locator(".folder-row", has_text="가상_펀드변경_매뉴얼").get_by_role("button").click(); pg.wait_for_selector("#folder-detail")
    pg.click("#fe-open"); pg.fill("#fe-name", "가상_업무매뉴얼"); pg.click("#fe-save"); pg.wait_for_timeout(500)
    print("같은 이름:", pg.locator(".notice.warn").first.inner_text())
    pg.fill("#fe-name", "펀드변경_매뉴얼"); pg.fill("#fe-task", "변액 펀드변경"); pg.click("#fe-save"); pg.wait_for_selector("#folder-detail h2")
    print("수정 후:", pg.inner_text("#folder-detail h2"), "|", pg.locator("#folder-detail p.hint").first.inner_text()[:30], "|", pg.inner_text("#folder-status"))
    # 자료 입력에서 가져오기 (추가 작업, 줄글 유지)
    pg.click("#nav-input"); pg.click(".start-card:has(input[value=추가])"); pg.fill("#free-text", "자동재배분 메모 테스트"); pg.fill("#task", "자동재배분")
    pg.wait_for_selector("#imp-folder")
    print("폴더 목록:", pg.locator("#imp-folder option").all_inner_texts())
    pg.select_option("#imp-folder", label=[o for o in pg.locator("#imp-folder option").all_inner_texts() if o.startswith("펀드변경_매뉴얼")][0])
    print("버전 목록:", [o[:20] for o in pg.locator("#imp-version option").all_inner_texts()])
    pg.select_option("#imp-version", value="1"); pg.click("#imp-load"); pg.wait_for_selector("#link-note")
    print("불러옴:", pg.inner_text("#link-note"), "| 줄글 유지:", pg.input_value("#free-text"), "| 작업:", pg.evaluate("state.job"))
    pg.click("#generate"); pg.wait_for_selector(".compare"); print("저장 위치:", pg.inner_text("#save-where"))
    pg.fill("#author", "담당자A"); pg.click("#confirm"); pg.wait_for_selector("#save-status"); print("확정:", pg.inner_text("#save-status"), pg.inner_text("#dl-status"))
    print("오류:", errs); b.close()
