import sys, json
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from pathlib import Path
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; STUB = len(sys.argv) > 2
def routes(pg):
    route_libs(pg)
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900})
    if STUB: ctx.add_init_script(path=str(TESTS / "stub.js"))
    pg = ctx.new_page(); routes(pg); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#generate")
    # 1) 새 폴더(빈 폴더) 만들기 → 같은 이름 거부
    pg.click("#nav-folders"); pg.wait_for_selector("#ff-new"); pg.click("#ff-new")
    pg.fill("#ff-name", "자동재배분_매뉴얼"); pg.fill("#ff-task", "변액보험 자동재배분"); pg.click("#ff-save"); pg.wait_for_selector("#folder-detail")
    print("1) 빈 폴더:", pg.inner_text("#folder-detail h2"), "|", pg.locator("#folder-detail p.empty").inner_text()[:30])
    pg.click("#ff-new"); pg.fill("#ff-name", "자동재배분_매뉴얼"); pg.click("#ff-save"); pg.wait_for_selector("#ff-form .notice")
    print("   같은 이름:", pg.inner_text("#ff-form .notice")); pg.click("#ff-cancel")
    # 2) 새 폴더 + 첫 파일 (엑셀)
    pg.click("#ff-new"); pg.set_input_files("#ff-file", R + "excel/가상_업무매뉴얼_v1.xlsx"); pg.wait_for_selector("#ff-label")
    print("2) 파일 올림: 이름", pg.input_value("#ff-name"), "| 업무명", pg.input_value("#ff-task"), "| 버전", pg.input_value("#ff-label"), "| 시트", pg.input_value("#ff-sheet"))
    pg.click("#ff-save"); pg.wait_for_selector("table.versions"); print("   버전표:", pg.locator("table.versions td:nth-child(2)").all_inner_texts(), pg.locator("table.versions td:nth-child(6)").all_inner_texts())
    # 3) 파일로 새 버전 올리기 (형식 다르면 거부, 같은 형식이면 v1.1)
    pg.click("#ff-addver"); pg.set_input_files("#ff-file", R + "word/가상_펀드변경_매뉴얼_v1.docx"); pg.wait_for_selector("#ff-label"); pg.click("#ff-save"); pg.wait_for_selector("#ff-form .notice")
    print("3) 다른 형식:", pg.inner_text("#ff-form .notice")[:40])
    pg.set_input_files("#ff-file", R + "mock/예상결과_업무매뉴얼_v2.xlsx"); pg.wait_for_timeout(500); print("   기본 번호:", pg.input_value("#ff-label"))
    pg.fill("#ff-summary", "규정 현행화 반영본"); pg.click("#ff-save"); pg.wait_for_function("document.querySelectorAll('table.versions tr').length === 3")
    print("   올린 뒤:", pg.locator("table.versions td:nth-child(2)").all_inner_texts(), "|", pg.inner_text("#folder-status"))
    # 4) 확정할 때 빈 폴더 고르기 (신규 자동재배분 → 자동재배분_매뉴얼 폴더)
    pg.click("#nav-input"); pg.get_by_role("button", name="신규: 자동재배분 러프 메모").click(); pg.click("#generate"); pg.wait_for_selector(".compare")
    print("4) 자동:", pg.inner_text("#save-where"))
    pg.select_option("#target-folder", label=[o for o in pg.locator("#target-folder option").all_inner_texts() if o.startswith("자동재배분_매뉴얼")][0]); pg.wait_for_timeout(300)
    print("   고름:", pg.inner_text("#save-where"))
    pg.fill("#author", "담당자A"); pg.click("#confirm"); pg.wait_for_selector("#save-status"); print("   확정:", pg.inner_text("#save-status"), pg.inner_text("#dl-status"))
    # 5) 버전 다 지워도 빈 폴더로 남음
    pg.click("#nav-folders"); pg.wait_for_selector(".folder-row"); pg.locator(".folder-row", has_text="자동재배분_매뉴얼").get_by_role("button").click(); pg.wait_for_selector("#folder-detail")
    pg.click("button[data-ask-del='v:1']"); pg.click("button[data-del-version='1']"); pg.wait_for_timeout(500)
    print("5) 지운 뒤:", pg.locator(".folder-row .name").all_inner_texts())
    # 6) 챗봇 — 모의
    pg.click("#nav-qa"); pg.wait_for_selector("#chat-scope")
    print("6) 범위:", pg.locator("#chat-scope option").all_inner_texts())
    pg.click("button[data-ask]"); pg.wait_for_selector("#qa-answer")
    print("   모의 답:", pg.inner_text("#qa-answer")[:60], "| 근거:", pg.locator("#qa-evidence li").first.inner_text()[:60])
    pg.fill("#question", "주민번호 900101-1234567 고객 문의"); pg.press("#question", "Enter"); pg.wait_for_timeout(300)
    print("   개인정보:", pg.locator(".bubble.bot .b-text").last.inner_text()[:40])
    # 7) 챗봇 — AI (가짜 응답)
    pg.click("#mode-ai"); pg.click("#chat-clear"); pg.fill("#question", "펀드변경 무료로 몇 번까지 돼?"); pg.press("#question", "Enter"); pg.wait_for_selector("#qa-answer", timeout=30000)
    print("7) AI 답:", pg.inner_text("#qa-answer"), "|", pg.locator(".bubble.bot .b-who").last.inner_text(), "| 근거 수", pg.locator("#qa-evidence li").count())
    if not STUB:
        req = json.load(open(TESTS / "last_request.json")); prompt = req["body"]["messages"][0]["content"]
        print("   프롬프트 근거:", [l for l in prompt.split("\n") if l.startswith("[근거")][:3])
    pg.fill("#question", "그럼 수수료는?"); pg.press("#question", "Enter"); pg.wait_for_function("document.querySelectorAll('.bubble.user').length === 2 && !document.querySelector('#chat-pending')", timeout=30000)
    if not STUB:
        prompt = json.load(open(TESTS / "last_request.json"))["body"]["messages"][0]["content"]
        print("   이어 묻기: 이전 대화 포함", "[이전 대화]" in prompt, "| 근거", [l for l in prompt.split("\n") if l.startswith("[근거")][:1])
    # 8) 범위를 엑셀 폴더 하나로
    pg.click("#mode-mock"); pg.select_option("#chat-scope", index=1); pg.wait_for_timeout(200)
    print("8) 범위 하나:", pg.locator("details summary.hint").inner_text())
    pg.set_viewport_size({"width": 390, "height": 900}); pg.wait_for_timeout(200); print("   폰 가로폭", pg.evaluate("document.documentElement.scrollWidth"))
    pg.screenshot(path=str(OUT / "chat_phone.png"))
    print("오류:", errs); b.close()
