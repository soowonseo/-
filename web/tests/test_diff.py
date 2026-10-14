import sys, json
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from pathlib import Path
from playwright.sync_api import sync_playwright
A = OUT / "artifact"
html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + (A / "manual-writer.html").read_text(encoding="utf-8") + "</body></html>"
v3 = Path(R + "mock/mock_manual.md").read_text(encoding="utf-8").replace("신청일 +2영업일", "신청일 +3영업일").replace("최대 5개 (위반 시 E-104)", "최대 7개 (위반 시 E-104)")
stub = "window.claude = { use: async (n) => n === 'sample' ? (async (input, o) => { const t = %s; o && o.onText && o.onText({text: t.slice(0, 40)}); return {text: t, truncated: false}; }) : null };" % json.dumps(v3)
with sync_playwright() as p:
    b = launch(p); pg = b.new_page(viewport={"width": 1300, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    route_libs(pg)
    pg.route("http://local.test/", lambda r: r.fulfill(body=html, content_type="text/html"))
    pg.add_init_script(stub)
    pg.goto("http://local.test/"); pg.wait_for_selector("#generate")
    count = lambda: pg.locator(".compare > .stack").nth(1).locator("p.hint").first.inner_text()
    badges = lambda: {k: pg.locator(f".compare .chg:text-is('{k}')").count() for k in ["변경", "추가", "삭제"]}

    use_preset(pg, "갱신: 기존 Word v1 + 규정 변경 메모"); pg.wait_for_timeout(500); pg.click("#generate"); pg.wait_for_selector(".compare")
    print("[v1 갱신·모의]", count(), badges(), "| 개정내용:", pg.input_value("#summary"))
    pg.locator(".section", has_text="2. 관련규정").last.locator("details.diff summary").click()
    print("   2. 바뀐 내용:", pg.locator(".section", has_text="2. 관련규정").last.locator("details.diff pre").inner_text().split("\n")[:3])
    pg.screenshot(path=str(A / "badges.png"))
    pg.click("[data-page=input]")

    use_preset(pg, "갱신: 확정본 v2 + 규정 변경 공지 (변경 강조 시연)"); pg.wait_for_timeout(500); pg.click("#generate"); pg.wait_for_selector(".compare")
    print("[memo_v2·모의] 처음:", count())
    pg.locator("#fb-1 summary").click(); t = pg.input_value("#fbt-1")
    pg.fill("#fbt-1", t.replace("신청일 +2영업일", "신청일 +3영업일")); pg.click("[data-apply='1']")
    print("   2 직접 수정 후:", count(), "| 개정내용:", pg.input_value("#summary"))
    pg.click("[data-page=input]"); pg.click("#mode-ai")
    use_preset(pg, "갱신: 확정본 v2 + 규정 변경 공지 (변경 강조 시연)"); pg.wait_for_timeout(500); pg.click("#generate"); pg.wait_for_selector(".compare")
    sec = pg.locator(".section", has_text="2. 관련규정").last; sec.locator("details.diff summary").click()
    print("[memo_v2·AI(가짜 응답)]", count(), "| 배지", badges(), "| 바뀐 내용:", sec.locator("details.diff pre").inner_text().split("\n"))
    print("오류:", errs); b.close()
