"""섹션 구성: 고치기는 기존 매뉴얼 구성 그대로(기본), 새로 만들기·업무 추가는 섹션 양식(기본·간단·직접 만든 양식)."""
import sys, json
sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import *
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
errs = []


def gen(pg):
    pg.click("#generate")
    try: pg.wait_for_selector("#sec-toc", timeout=60000)
    except Exception: print("   초안 실패:", pg.evaluate("[state.page, state.error, state.busy]"), pg.locator(".modal").all_inner_texts()[:1]); raise
    return pg.evaluate("state.draft.sections.map(s => s.no + '. ' + s.title)")


with sync_playwright() as p:
    b = launch(p); pg = b.new_page(viewport={"width": 1400, "height": 900}); route_libs(pg)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector("#generate"); pg.click("#mode-mock")

    # 1) 고치기 기본값 = 기존 구성 그대로: v1의 섹션 번호·제목을 그대로 따른다
    use_preset(pg, "updKeep"); pg.wait_for_selector("#up-existing + .hint b")
    pg.wait_for_selector("input[name=structMode][value=keep]:checked")
    asis = pg.evaluate("(async () => (await readExisting()).sections.map(s => s.no + '. ' + s.title))()")
    out = gen(pg)
    print("1) 기존 구성 그대로:", out == asis, "|", out)
    print("   섹션 구성 표시:", pg.inner_text("#struct-metric").replace("\n", " "))
    body = pg.evaluate("state.draft.sections.map(s => s.text).join('\\n')")
    print("   새 규정 내용이 들어감(D+1 같은 변경 내용):", "D+1" in body or "100%" in body, "| [확인 필요] 수", pg.evaluate("countOpen(state.draft.sections).check"))
    if out != asis: errs.append("keep mode changed structure")

    # 2) 고치기에서 '섹션 양식으로 새로 정리' → 기본 6섹션
    pg.click("#nav-input"); use_preset(pg, "updWord"); pg.wait_for_selector("input[name=structMode][value=template]:checked")
    print("2) 정리 모드 선택됨:", pg.locator("input[name=structMode][value=template]:checked").count() == 1)
    out = gen(pg); tops = [s for s in out if "-" not in s.split(".")[0]]
    print("   기본 6섹션:", len(tops) == 6, tops)
    if len(tops) != 6: errs.append("basic6 not 6 tops")

    # 3) 새로 만들기 + 간단 4섹션
    pg.click("#nav-input"); use_preset(pg, "fund"); pg.select_option("#tpl-select", "simple4")
    print("3) 미리 보기:", pg.inner_text(".tpl-preview").replace("\n", " "))
    out = gen(pg); tops = [s for s in out if "-" not in s.split(".")[0]]
    print("   간단 4섹션:", tops, "| 소제목", [s for s in out if "-" in s.split(".")[0]][:4])
    if tops != ["1. 업무개요", "2. 기준·규정", "3. 처리절차", "4. 유의사항"]: errs.append(f"simple4 {tops}")
    flow_kept = pg.evaluate("state.draft.sections.some(s => /업무흐름도/.test(s.text))")
    print("   빠진 섹션 내용은 가까운 섹션에 합침(업무흐름도):", flow_kept)

    # 4) 직접 만든 양식: 저장(서버 저장소) → 선택 → 초안 → 새로고침 후에도 남음 → 삭제
    pg.click("#nav-input"); pg.click("#tpl-new"); pg.fill("#tpl-name", "우리 팀 양식")
    pg.fill("#tpl-lines", "업무개요\n처리기준\n처리절차\n- 접수\n- 처리\n유의사항")
    print("4) 편집 미리 보기:", pg.inner_text("#tpl-edit .hint").split("\n")[0])
    pg.click("#tpl-save"); pg.wait_for_selector("#tpl-edit", state="detached")
    print("   저장 후 선택:", pg.evaluate("templateById(state.structure.templateId).name"), "| 공유 저장:", pg.evaluate("state.templatesShared"))
    out = gen(pg); print("   초안 구성:", out)
    if out[:5] != ["1. 업무개요", "2. 처리기준", "3. 처리절차", "3-1. 접수", "3-2. 처리"] or out[-1] != "4. 유의사항": errs.append(f"custom {out}")
    idx = json.loads((OUT / "blob/manuals/index.json").read_text()) if (OUT / "blob/manuals/index.json").exists() else {}
    print("   저장소에 기록:", [t["name"] for t in idx.get("templates", [])])
    pg.reload(); pg.wait_for_selector("#generate"); pg.click(".start-card:has(input[value=신규])"); pg.wait_for_timeout(800)
    names = pg.locator("#tpl-select option").all_inner_texts(); print("   새로고침 후 목록:", names)
    if not any("우리 팀 양식" in n for n in names): errs.append("custom template not persisted")
    pg.select_option("#tpl-select", label="우리 팀 양식 (직접 만든 양식)")
    pg.click("#tpl-del-ask"); pg.click("#tpl-del"); pg.wait_for_timeout(800)
    names = pg.locator("#tpl-select option").all_inner_texts(); print("   삭제 후 목록:", names)
    if any("우리 팀 양식" in n for n in names): errs.append("custom template not deleted")

    # 5) AI 모드: 프롬프트에 섹션 구성 규칙이 들어가고, AI가 구성을 어겨도 기존 구성에 맞춘다
    use_preset(pg, "updKeep"); pg.wait_for_selector("#up-existing + .hint b"); ai_mode(pg); out = gen(pg)
    prompt = json.load(open(TESTS / "last_request.json"))["body"]["messages"][0]["content"]
    print("5) AI 프롬프트 규칙:", "기존 매뉴얼의 섹션 구성(번호·제목·순서)을 그대로 유지한다" in prompt, "| 결과 = 기존 구성:", out == asis)
    if out != asis: errs.append("AI keep mode changed structure")
    print("오류:", errs); b.close()
