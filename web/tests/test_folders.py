import sys, zipfile, io, re
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from pathlib import Path
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
def routes(pg):
    route_libs(pg)
def docx_text(path):
    z = zipfile.ZipFile(path); x = z.read("word/document.xml").decode()
    return re.sub(r"<[^>]+>", "", x.replace("</w:p>", "\n"))
with sync_playwright() as p:
    b = launch(p); pg = b.new_page(accept_downloads=True); routes(pg)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#generate")
    def confirm(kind=None):
        pg.fill("#author", "담당자A"); 
        if kind: pg.check(f"input[name=verKind][value={kind}]")
        pg.click("#confirm"); pg.wait_for_selector("#save-status", timeout=30000)
        return pg.inner_text("#save-status"), pg.inner_text("#dl-status")
    # 1) 갱신: 기존 Word v1 → 새 폴더(원본 v1) + v1.1
    use_preset(pg, "갱신: 기존 Word v1 + 규정 변경 메모"); pg.wait_for_timeout(300)
    pg.click("#generate"); pg.wait_for_selector(".compare")
    print("버전 선택:", pg.locator("input[name=verKind]").evaluate_all("els => els.map(e => e.parentElement.innerText)"))
    print("저장 위치:", pg.inner_text("#save-where"))
    print("1)", confirm())
    with pg.expect_download() as d: pg.click("#download")
    f = OUT / "v11.docx"; d.value.save_as(f); t = docx_text(f)
    print("  표지:", [l for l in t.split("\n") if "버전" in l][:2])
    # 2) 같은 원자료로 다시 갱신 → 같은 폴더, 큰 개정 → v2
    pg.click("#restart"); use_preset(pg, "갱신: 기존 Word v1 + 규정 변경 메모"); pg.wait_for_timeout(300)
    pg.click("#generate"); pg.wait_for_selector(".compare")
    print("2) 위치:", pg.inner_text("#save-where"))
    print("2)", confirm("major"))
    # 3) 신규 → 새 폴더 v1
    pg.click("#restart"); use_preset(pg, "신규: 자동재배분 러프 메모"); pg.check("input[name=format][value=xlsx]")
    pg.click("#generate"); pg.wait_for_selector(".compare")
    print("3)", confirm())
    # 폴더 화면
    pg.click("#nav-folders"); pg.wait_for_selector("#reload-folders")
    print("폴더:", pg.locator(".folder-row .name").all_inner_texts())
    pg.locator(".folder-row", has_text="가상_펀드변경_매뉴얼").get_by_role("button").click(); pg.wait_for_selector("#folder-detail")
    print("버전표:", [r for r in pg.locator("table.versions tr").all_inner_texts()])
    # 비교 v1 vs v1.1
    pg.check("input[data-pick='1']"); pg.check("input[data-pick='1.1']"); pg.click("#compare-btn"); pg.wait_for_selector("#compare")
    print("비교:", pg.locator("#compare h2").inner_text(), "|", pg.locator("#compare p.hint").first.inner_text())
    # 내려받기 v1 (원본)
    with pg.expect_download() as d: pg.click("button[data-dl-version='1']")
    print("원본 내려받기:", d.value.suggested_filename)
    # 이 버전으로 수정 (v1.1) → 갱신, 작은 수정 → v2.1 (최신이 2이므로)
    pg.click("button[data-edit-version='1.1']"); pg.wait_for_selector("#link-note")
    print("불러옴:", pg.inner_text("#link-note"))
    pg.click("#generate"); pg.wait_for_selector(".compare")
    print("4)", confirm())
    # 삭제: v1 삭제(확인 후)
    pg.click("#nav-folders"); pg.wait_for_selector("#reload-folders")
    pg.locator(".folder-row", has_text="가상_펀드변경_매뉴얼").get_by_role("button").click(); pg.wait_for_selector("#folder-detail")
    pg.click("button[data-ask-del='v:1']"); pg.click("button[data-cancel-del]")
    pg.click("button[data-ask-del='v:1']"); pg.click("button[data-del-version='1']"); pg.wait_for_timeout(500)
    print("삭제 후:", pg.locator("table.versions tr td:nth-child(2)").all_inner_texts(), pg.inner_text("#folder-status"))
    # Q&A: 새 페이지에서 폴더 최신본 검색
    pg2 = b.new_page(); routes(pg2); pg2.on("pageerror", lambda e: errs.append(str(e)))
    pg2.goto(URL); pg2.wait_for_selector("#generate"); pg2.click("#nav-qa"); pg2.wait_for_selector("#qa-form", timeout=15000)
    print("Q&A 대상:", pg2.locator("details .file-row").all_inner_texts())
    pg2.fill("#question", "펀드변경 무료로 몇 번까지 돼?"); pg2.click("#qa-form button"); pg2.wait_for_selector("#qa-answer")
    print("Q&A:", pg2.inner_text("#qa-answer")[:80], "|", pg2.locator(".evidence li").first.inner_text()[:80])
    # 폴더 삭제
    pg.click("button[data-ask-del='folder']"); pg.click("#del-folder"); pg.wait_for_timeout(500)
    print("폴더 삭제 후:", pg.locator(".folder-row .name").all_inner_texts())
    print("오류:", errs); b.close()
