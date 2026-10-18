"""고도화 3가지: ① 확정 전 자동 점검표 ② 빠지거나 잘린 섹션만 AI로 다시 쓰기 ③ 챗봇이 답 못 한 질문 → 다음 개정 자료."""
import sys, json, re
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
errs = []

with sync_playwright() as p:
    b = launch(p); pg = b.new_page(viewport={"width": 1400, "height": 900}); route_libs(pg)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#generate"); pg.click("#mode-mock")

    # ① 확정 전 점검표
    use_preset(pg, "fund"); pg.wait_for_timeout(500); pg.click("#generate"); pg.wait_for_selector("#quality")
    print("1) 점검표(모의 초안):", pg.inner_text("#quality").split("\n")[0][:80])
    pg.evaluate("""() => { const d = state.draft; d.sections[1].text = ''; d.sections[0].text += '\\n펀드 변경은 연 12회까지 가능하다고 들었습니다.'; render(); }""")
    kinds = pg.locator("#quality li .q-kind").all_inner_texts(); items = pg.locator("#quality li").all_inner_texts()
    print("   빈 섹션·용어·출처:", "빈 섹션" in kinds, "용어" in kinds, "출처" in kinds, "| 펼침(꼭 볼 것):", pg.locator("#quality[open]").count() == 1)
    print("   예:", [i.replace("\n", " ")[:60] for i in items[:3]])
    if not ("빈 섹션" in kinds and "용어" in kinds and "출처" in kinds): errs.append(f"quality kinds {kinds}")
    y0 = pg.evaluate("scrollY"); pg.locator("#quality li.warn .link-btn").first.click(); pg.wait_for_timeout(800)
    print("   누르면 그 섹션으로:", pg.evaluate("scrollY") != y0)

    # ② 빠진 섹션만 다시 쓰기 (AI 모드, 가짜 AI 응답)
    calls = []; plan = {}
    def fake_ai(route):
        prompt = json.loads(route.request.post_data)["prompt"]; calls.append(prompt)
        m = re.search(r"'# (\d+)\. ([^']+)' 섹션 하나만", prompt)
        if m:
            if plan.get("fail_at") and len(calls) >= plan["fail_at"]:
                return route.fulfill(status=429, content_type="application/json", body=json.dumps({"code": "rate_limited"}))
            return route.fulfill(status=200, content_type="text/plain; charset=utf-8", body=f"# {m[1]}. {m[2]}\n{m[2]} 내용을 따로 썼습니다. [메모]")
        route.fulfill(status=200, content_type="text/plain; charset=utf-8", body=plan["first"])
    pg.route("**/api/ai", fake_ai)
    pg.click("#nav-input"); use_preset(pg, "fund"); pg.wait_for_timeout(500); ai_mode(pg)
    plan.update(first="# 1. 업무개요\n펀드변경 업무입니다. [메모]\n\n# 2. 관련규정\n| 항목 | 기준 |\n|---|---|\n| 무료 | 연 12회 [메모] |", fail_at=None)
    pg.click("#generate"); pg.wait_for_selector("#sec-toc", timeout=60000)
    tops = pg.evaluate("state.draft.sections.filter(s => s.level === 1).map(s => s.no + '. ' + s.title + ' = ' + s.text.slice(0, 18))")
    print("2) 첫 답에 섹션 2개뿐 → AI 호출", len(calls), "번 (1 + 빠진 4개)", "|", pg.inner_text("#fill-note")[:60])
    print("   ", tops)
    if len(calls) != 5 or pg.evaluate("countOpen(state.draft.sections).check") != 0: errs.append(f"fill calls {len(calls)}")
    # 형식을 전혀 못 읽으면 섹션마다 따로(6번) / 중간에 한도에 걸리면 남은 섹션은 [확인 필요] + 안내
    calls.clear(); plan.update(first="죄송합니다. 매뉴얼을 쓸 수 없습니다.", fail_at=4)
    pg.click("#nav-input"); pg.click("#generate"); pg.wait_for_selector("#sec-toc", timeout=60000)
    if pg.locator(".modal").count(): pg.keyboard.press("Escape")
    print("   형식 실패 → 섹션별:", len(calls), "번 호출 | 안내:", pg.inner_text("#fill-note")[:90].replace("\n", " "))
    if "남았습니다" not in pg.inner_text("#fill-note"): errs.append("fill failure note")
    pg.unroute("**/api/ai"); pg.click("#mode-mock")

    # ③ 챗봇이 답 못 한 질문 → 폴더 → 고치기 자료 → 확정하면 지워짐
    pg.click("#nav-input"); use_preset(pg, "updWord"); pg.wait_for_timeout(500); pg.click("#generate"); pg.wait_for_selector("#save-where")
    pg.fill("#author", "담당자A"); pg.click("#confirm"); pg.wait_for_selector("#save-status")
    folder = pg.evaluate("state.confirmed.saved.name"); print("3) 폴더 저장:", folder)
    pg.click("#nav-qa"); pg.wait_for_selector("#qa-form"); pg.wait_for_timeout(800)
    pg.select_option("#chat-scope", label=[o for o in pg.locator("#chat-scope option").all_inner_texts() if folder in o][0])
    pg.fill("#question", "점심시간 당직 순번은 어떻게 정해?"); pg.press("#question", "Enter")
    pg.wait_for_function("!document.querySelector('#chat-pending') && document.querySelectorAll('.bubble.bot').length >= 1", timeout=30000); pg.wait_for_timeout(500)
    print("   챗봇 답:", pg.locator(".bubble.bot").last.inner_text().replace("\n", " ")[:110])
    idx = json.loads((OUT / "blob/manuals/index.json").read_text())
    print("   저장소 기록:", [(g["q"], g["folderId"] is not None) for g in idx.get("gaps", [])])
    if not idx.get("gaps"): errs.append("gap not recorded")
    pg.click("#nav-folders")
    pg.wait_for_selector("[data-open-folder]"); pg.locator(".folder-row", has_text=folder).locator("[data-open-folder]").click(); pg.wait_for_selector("#gaps-panel")
    print("   폴더 화면:", pg.inner_text("#gaps-panel h3"))
    pg.click("#gaps-fix"); pg.wait_for_selector("#gap-note")
    print("   고치기 시작:", pg.inner_text("#gap-note")[:50], "| 줄글에 질문:", "점심시간 당직" in pg.input_value("#free-text"))
    pg.click("#generate"); pg.wait_for_selector("#save-where"); pg.fill("#author", "담당자A"); pg.click("#confirm"); pg.wait_for_selector("#save-status")
    idx = json.loads((OUT / "blob/manuals/index.json").read_text())
    print("   확정 후 남은 질문:", len(idx.get("gaps", [])), "| 저장:", pg.inner_text("#save-status")[:40])
    if idx.get("gaps"): errs.append("gap not resolved")
    print("오류:", errs); b.close()
