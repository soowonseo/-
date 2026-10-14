import sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from pathlib import Path
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
def routes(pg):
    route_libs(pg)
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(accept_downloads=True)
    ctx.add_init_script(path=str(TESTS / "stub.js"))
    pg = ctx.new_page(); routes(pg); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#generate")
    def confirm(kind=None):
        pg.fill("#author", "담당자A")
        if kind: pg.check(f"input[name=verKind][value={kind}]")
        pg.click("#confirm"); pg.wait_for_selector("#save-status", timeout=30000); return pg.inner_text("#save-status")
    use_preset(pg, "갱신: 기존 엑셀 v1 '펀드변경' 시트"); pg.wait_for_timeout(300)
    pg.click("#generate"); pg.wait_for_selector(".compare"); print("엑셀 갱신:", confirm(), pg.inner_text("#dl-status"))
    pg.click("#restart"); use_preset(pg, "추가: 엑셀 v1 + 자동재배분 시트"); pg.wait_for_timeout(300)
    pg.click("#generate"); pg.wait_for_selector(".compare"); print("엑셀 추가:", pg.locator(".panel .field .hint").last.inner_text()); print("  ", confirm(), pg.inner_text("#dl-status"))
    pg.click("#nav-folders"); pg.wait_for_selector("#folder-detail, .folder-row")
    pg.locator(".folder-row").first.get_by_role("button").click(); pg.wait_for_selector("#folder-detail")
    print("버전표:", pg.locator("table.versions tr td:nth-child(2)").all_inner_texts(), pg.locator("table.versions tr td:nth-child(6)").all_inner_texts())
    pg.click("button[data-edit-version='1.1']"); pg.wait_for_selector("#link-note")
    print("시트:", pg.locator("#sheet").input_value(), "|", pg.inner_text("#link-note"))
    pg.click("#nav-folders"); pg.wait_for_selector("#folder-detail")
    pg.check("input[data-pick='1']"); pg.check("input[data-pick='1.1']"); pg.click("#compare-btn"); pg.wait_for_selector("#compare")
    print("비교:", pg.locator("#compare p.hint").first.inner_text())
    with pg.expect_download() as d: pg.click("button[data-dl-version='1.2']")
    print("내려받기:", d.value.suggested_filename)
    pg2 = ctx.new_page(); routes(pg2); pg2.goto(URL); pg2.wait_for_selector("#generate"); pg2.click("#nav-qa"); pg2.wait_for_selector("#qa-form")
    pg2.fill("#question", "자동재배분 주기는?"); pg2.click("#qa-form button"); pg2.wait_for_selector("#qa-answer")
    print("다른 탭 Q&A:", pg2.inner_text("#qa-answer")[:60], "|", pg2.locator(".evidence li").first.inner_text()[:70])
    print("오류:", errs); b.close()
