import sys, json
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
with sync_playwright() as p:
    b = launch(p); pg = b.new_page(viewport={"width": 1400, "height": 900}); route_libs(pg)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    choosers = []; pg.on("filechooser", lambda f: choosers.append(1))
    pg.goto(URL); pg.wait_for_selector("#generate")
    print("1) 첫 화면 파일:", pg.locator(".file-row, .img-card").count(), "| 시작 안내:", pg.locator(".start-hint").count())
    # ? 도움말: 파일 칸 안의 ?를 눌러도 파일 선택 창은 안 뜸
    pg.click(".drop .help-btn[data-help=docs]"); pg.wait_for_selector(".help-pop")
    print("2) 도움말:", pg.inner_text(".help-pop").split("\n")[0], "| 파일 선택 창 뜸:", bool(choosers))
    pg.mouse.click(5, 5); print("   바깥 클릭 후 닫힘:", pg.locator(".help-pop").count() == 0)
    print("   ? 개수(자료 입력):", pg.locator("main .help-btn").count())
    # 끌어 놓기
    pg.evaluate("""() => { const dt = new DataTransfer(); dt.items.add(new File(['펀드변경 메모: 연 12회 무료'], '끌어놓은_메모.txt', {type:'text/plain'}));
      const d = document.querySelector('#up-docs').closest('.drop'); d.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); }""")
    pg.wait_for_selector(".file-row"); print("3) 끌어 놓기:", pg.locator(".file-row .name").all_inner_texts())
    # AI 모드 안내 팝업
    pg.click("#mode-ai"); pg.wait_for_selector(".modal"); print("4) AI 안내:", pg.inner_text("#modal-title"), "|", "하루" in pg.inner_text(".modal-body"), "느립니다" in pg.inner_text(".modal-body"))
    pg.click(".modal [data-modal-close]"); print("   사이드바:", pg.inner_text("#mode-help")[:60])
    # OpenRouter 오류 → 설명 팝업
    pg.route("**/api/ai", lambda r: r.fulfill(status=502, content_type="application/json", body=json.dumps({"code": "rate_limited"})))
    pg.check("input[name=format][value=docx]"); pg.click("#generate"); pg.wait_for_selector(".modal.warn", timeout=20000)
    print("5) 오류 팝업:", pg.inner_text("#modal-title"), "|", pg.inner_text(".modal-body").split("\n")[1][:50])
    pg.click("[data-modal-act=to-mock]"); print("   모의 모드로 전환:", pg.evaluate("state.mode"))
    pg.route("**/api/ai", lambda r: r.fulfill(status=504, body="timeout"))
    pg.click("#mode-ai"); pg.click("#generate"); pg.wait_for_selector(".modal.warn", timeout=20000); print("   시간 초과:", pg.inner_text("#modal-title")); pg.keyboard.press("Escape")
    print("   Esc로 닫힘:", pg.locator(".modal").count() == 0)
    # 확정 화면의 ?
    pg.click("#mode-mock"); use_preset(pg, "updWord"); pg.click("#generate"); pg.wait_for_selector(".save-box")
    print("6) 확정 화면 ? 개수:", pg.locator(".panel .help-btn").count())
    pg.click(".help-btn[data-help=version]"); print("   버전 도움말:", pg.inner_text(".help-pop")[:40].replace("\n", " "))
    # 챗봇 오류
    pg.click("#nav-qa"); pg.wait_for_selector("#qa-form")
    print("7) 챗봇 AI 안내 문구:", "무료" in pg.inner_text(".chat-side, .panel"))
    pg.set_viewport_size({"width": 390, "height": 900}); pg.click("#nav-input"); pg.wait_for_timeout(300)
    pg.click(".help-btn[data-help=text]"); bb = pg.locator(".help-pop").bounding_box(); print("8) 폰 도움말 화면 안:", bb["x"] >= 0 and bb["x"] + bb["width"] <= 390, "| 가로폭", pg.evaluate("document.documentElement.scrollWidth"))
    print("오류:", errs); b.close()
