import sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(viewport={"width": 1400, "height": 900}); pg = ctx.new_page(); route_libs(pg)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#generate")
    print("1) 처음: 이어서 하기 알림", pg.locator("#restore-banner").count())
    # 초안을 만들고 새로고침 → 이어서 하기
    use_preset(pg, "updWord"); pg.fill("#free-text", "새로고침 전에 쓴 글"); pg.click("#generate"); pg.wait_for_selector("#sec-toc")
    n_sec = pg.locator(".toc-chip").count(); pg.fill("#author", "담당자A"); pg.wait_for_timeout(1000)
    pg.reload(); pg.wait_for_selector("#restore-banner"); print("2) 새로고침 후:", pg.inner_text("#restore-banner").split("\n")[0][:70])
    pg.click("#restore-yes"); pg.wait_for_selector("#sec-toc")
    print("   이어서 하기 → 검토 화면 섹션", pg.locator(".toc-chip").count(), "/", n_sec, "| 작성자", pg.input_value("#author"), "| As-Is", pg.locator(".compare > .stack").first.locator(".section").count() > 0, "| 줄글", pg.evaluate("state.text"))
    # 섹션 목차 · 다음 [확인 필요]
    print("3) 목차:", pg.locator(".toc-chip").all_inner_texts()[:6], "| 버튼:", pg.locator("[data-next=check]").inner_text())
    y0 = pg.evaluate("scrollY"); pg.click("[data-next=check]"); pg.wait_for_timeout(900)
    print("   다음 [확인 필요]로 이동:", pg.evaluate("scrollY") != y0, "| 깜빡임", pg.locator("#tobe-col .flash").count())
    pg.click(".toc-chip >> nth=4"); pg.wait_for_timeout(700); print("   섹션 바로가기:", pg.locator(".section.flash").count())
    # [확인 필요] 바로 채우기
    before = pg.evaluate("countOpen(state.draft.sections).check")
    pg.locator("#tobe-col .fill-check").first.click(); pg.wait_for_selector(".fill-pop")
    print("4) 채우기 창:", pg.inner_text(".fill-pop").split("\n")[0])
    pg.fill("#fill-value", "900101-1234567"); pg.click("#fill-ok"); print("   개인정보 거절:", pg.inner_text("#fill-msg"))
    pg.fill("#fill-value", "회신 기한 5영업일"); pg.press("#fill-value", "Enter"); pg.wait_for_timeout(300)
    print("   채운 뒤 [확인 필요]", before, "→", pg.evaluate("countOpen(state.draft.sections).check"), "| 반영 표시", pg.locator(".fb-state.done").count(), "| 본문에 들어감", "회신 기한 5영업일" in pg.inner_text("#tobe-col"))
    # 다른 창(새 페이지)에서도 이어서 하기가 보이는지 — 같은 브라우저
    pg.click("#confirm"); pg.wait_for_selector("#save-status"); pg.wait_for_timeout(900)
    pg2 = ctx.new_page(); route_libs(pg2); pg2.goto(URL); pg2.wait_for_selector("#generate"); print("5) 확정 뒤 다른 창 알림(지워져야 함):", pg2.locator("#restore-banner").count()); pg2.close()
    pg.click("#restart"); pg.wait_for_selector("#generate")
    # AI 진행 표시 · 중지 (AI 요청을 일부러 붙잡아 둔다)
    held = []; pg.route("**/api/ai", lambda r: held.append(r))
    ai_mode(pg); use_preset(pg, "auto"); pg.click("#generate"); pg.wait_for_selector("#ai-cancel")
    t1 = pg.inner_text("#ai-elapsed"); pg.wait_for_timeout(2200); t2 = pg.inner_text("#ai-elapsed")
    print("6) 경과 시간:", t1, "→", t2, "| 진행:", pg.inner_text("#ai-progress")[:40])
    print("   진행 계산:", pg.evaluate("state.stream = '# 1. 업무개요\\n가\\n# 2. 관련규정\\n## 2-1. 기준\\n'; aiProgressHtml().replace(/<[^>]+>/g,'')")[:60])
    pg.evaluate("state.stream = ''")
    pg.click("#ai-cancel"); pg.wait_for_selector(".notice.warn"); print("   중지:", pg.locator(".notice.warn").last.inner_text()[:40], "| 오류 창 안 뜸:", pg.locator(".modal").count() == 0, "| 버튼 다시 됨:", not pg.locator("#generate").is_disabled())
    for r in held:
        try: r.abort()
        except Exception: pass
    pg.set_viewport_size({"width": 390, "height": 900}); use_preset(pg, "updWord"); pg.click("#mode-mock"); pg.click("#generate"); pg.wait_for_selector("#sec-toc"); print("7) 폰 가로폭", pg.evaluate("document.documentElement.scrollWidth"))
    print("오류:", errs); b.close()
