import sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900})
    pg = ctx.new_page(); route_libs(pg); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#generate")
    def draft(preset):
        pg.click("#nav-input"); use_preset(pg, preset); pg.wait_for_timeout(300)
        pg.click("#generate"); pg.wait_for_selector("#save-where"); pg.fill("#author", "담당자A")
    where = lambda: pg.inner_text("#save-where").replace("\n", " ")
    # 1) 기본: 폴더 저장 · 추천 폴더(새 폴더) · 원본 함께 → 원본 빼고 저장
    draft("갱신: 기존 Word v1 + 규정 변경 메모")
    print("1) 기본:", where())
    pg.uncheck("#sv-original"); print("   원본 뺌:", where())
    pg.click("#confirm"); pg.wait_for_selector("#save-status"); print("   확정:", pg.inner_text("#save-status")[:60], "|", pg.inner_text("#dl-status"))
    pg.click("#restart")
    # 2) 새 폴더 이름·업무명, 버전 직접 입력, 파일 이름 바꾸기
    draft("갱신: 기존 Word v1 + 규정 변경 메모")
    pg.check("input[name=folderMode][value=new]"); pg.fill("#sv-new-name", "가상_펀드변경_매뉴얼"); pg.wait_for_timeout(200)
    print("2) 같은 이름 새 폴더:", where(), "| 버튼", "비활성" if pg.locator("#confirm").is_disabled() else "활성")
    pg.fill("#sv-new-name", "펀드변경_교육용"); pg.fill("#sv-new-task", "변액 펀드변경(교육)")
    pg.check("input[name=verKind][value=custom]"); pg.fill("#sv-custom-ver", "1.x"); pg.wait_for_timeout(200)
    print("   잘못된 번호:", where()[-40:], "| 버튼", "비활성" if pg.locator("#confirm").is_disabled() else "활성")
    pg.fill("#sv-custom-ver", "3"); pg.fill("#sv-file", "펀드변경_교육용_최종"); pg.wait_for_timeout(200); print("   설정:", where())
    pg.click("#confirm"); pg.wait_for_selector("#save-status"); print("   확정:", pg.inner_text("#save-status")[:70], "|", pg.inner_text("#dl-status"))
    pg.click("#restart")
    # 3) 기존 폴더 고르기 — 고르기 전에는 확정 불가, 같은 번호는 막음
    draft("추가: Word 1~6장 + 변액 자동재배분")
    pg.check("input[name=folderMode][value=pick]"); pg.wait_for_timeout(200)
    print("3) 고르기 전:", where()[-30:], "| 버튼", "비활성" if pg.locator("#confirm").is_disabled() else "활성")
    pg.select_option("#target-folder", label=[o for o in pg.locator("#target-folder option").all_inner_texts() if o.startswith("펀드변경_교육용")][0]); pg.wait_for_timeout(300)
    print("   고른 뒤:", where())
    pg.check("input[name=verKind][value=custom]"); pg.fill("#sv-custom-ver", "3"); pg.wait_for_timeout(200); print("   같은 번호:", where()[-40:])
    pg.check("input[name=verKind][value=minor]"); pg.click("#confirm"); pg.wait_for_selector("#save-status"); print("   확정:", pg.inner_text("#save-status")[:60], "|", pg.inner_text("#dl-status"))
    pg.click("#restart")
    # 4) 내 컴퓨터에만
    draft("신규: 자동재배분 러프 메모"); pg.check("input[name=format][value=docx]") if pg.locator("input[name=format]").count() else None
    pg.check("input[name=dest][value=local]"); pg.wait_for_timeout(200); print("4) 내 컴퓨터:", where())
    with pg.expect_download() as d: pg.click("#confirm")
    print("   확정과 동시에 내려받음:", d.value.suggested_filename, "|", pg.inner_text("#save-status")[:40])
    # 5) 확정 뒤 마음이 바뀌어 폴더에도 저장
    pg.click("#later-open"); pg.wait_for_selector("#later-box"); print("5) 나중에 폴더 저장:", pg.inner_text("#later-box #save-where"))
    pg.click("#save-later"); pg.wait_for_function("document.querySelector('#save-status').innerText.includes('저장했습니다')", timeout=20000)
    print("   결과:", pg.inner_text("#save-status")[:60], "|", pg.inner_text("#dl-status"))
    pg.click("#nav-folders"); pg.wait_for_selector(".folder-row"); print("폴더:", pg.locator(".folder-row .name").all_inner_texts())
    print("오류:", errs); b.close()
