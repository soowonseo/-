import sys
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from pathlib import Path
from playwright.sync_api import sync_playwright
A = OUT / "artifact"
html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + (A / "manual-writer.html").read_text(encoding="utf-8") + "</body></html>"
with sync_playwright() as p:
    b = launch(p); pg = b.new_page(viewport={"width": 1300, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    route_libs(pg)
    pg.route("http://local.test/", lambda r: r.fulfill(body=html, content_type="text/html"))
    pg.goto("http://local.test/"); pg.wait_for_selector("#generate")
    pg.click("[data-page=guide]"); pg.wait_for_selector("#g-images")
    print("가이드 섹션:", pg.locator(".guide h2").all_inner_texts())
    pg.screenshot(path=str(A / "guide.png"), full_page=True)
    pg.click("#guide-fill"); pg.wait_for_selector("#generate")
    print("채운 값:", [(pg.input_value(f"#step-{i}"), pg.input_value(f"#capt-{i}")) for i in pg.eval_on_selector_all("[data-meta=step]", "els => els.map(e => e.dataset.id)")])
    print("형식 미선택이라 버튼:", "비활성" if pg.locator("#generate").is_disabled() else "활성")
    pg.check("input[name=format][value=docx]"); pg.click("#generate"); pg.wait_for_selector(".compare")
    print("검토 화면 그림 캡션:", pg.locator(".compare > .stack").nth(1).locator("figcaption").all_inner_texts())
    pg.set_viewport_size({"width": 400, "height": 850}); pg.click("[data-page=guide]"); pg.wait_for_timeout(300)
    print("폰 폭 가로 넘침:", pg.evaluate("document.documentElement.scrollWidth > window.innerWidth"))
    pg.screenshot(path=str(A / "guide_phone.png"))
    print("오류:", errs); b.close()
