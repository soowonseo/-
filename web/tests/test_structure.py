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

    # 5) 자료 보고 섹션 제안 → 1차 확인 → 본문 작성 (모의 모드: 낱말로 주제 추측, AI 안 씀)
    use_preset(pg, "auto"); pg.wait_for_selector("#tpl-suggest"); pg.click("#tpl-suggest"); pg.wait_for_selector("#tpl-use")
    lines = pg.input_value("#tpl-lines").split("\n"); print("5) 모의 제안:", lines, "|", pg.inner_text("#tpl-edit .hint").split("\n")[0][:40])
    print("   확정 전 [초안 생성] 막힘:", pg.locator("#generate[disabled]").count() == 1)
    pg.fill("#tpl-lines", "\n".join(lines[:-1] + ["재신청 안내", "유의사항"])); pg.click("#tpl-use")
    print("   확정 후 선택:", pg.locator("#tpl-select option:checked").inner_text())
    out = gen(pg); tops = [x for x in out if "-" not in x.split(".")[0]]
    print("   초안 = 확정한 구성:", [t.split(". ", 1)[1] for t in tops] == lines[:-1] + ["재신청 안내", "유의사항"], tops)
    if [t.split(". ", 1)[1] for t in tops] != lines[:-1] + ["재신청 안내", "유의사항"]: errs.append(f"suggest {tops}")
    # 섹션 수 지정 + 제목 줄이 있는 줄글 → 제목 줄을 그대로(AI 안 씀), 모자란 칸은 '(제목을 고쳐 주세요)'
    pg.click("#nav-input"); pg.fill("#free-text", "1. 업무 소개\n대충 설명\n2. 신청 방법\n화면에서 신청\n3. 해지\n바로 중단\n4. 주의할 점\n펀드변경하면 해지됨")
    pg.select_option("#tpl-count", "6"); pg.click("#tpl-suggest"); pg.wait_for_selector("#tpl-use")
    lines = pg.input_value("#tpl-lines").split("\n"); print("   제목 줄 + 6섹션:", lines)
    pg.click("#tpl-use"); print("   빈 제목 남기면 막음:", pg.inner_text("#tpl-edit .notice")[:30])
    if len(lines) != 6 or lines[0] != "업무 소개": errs.append(f"heading {lines}")
    pg.click("#tpl-cancel"); pg.select_option("#tpl-count", "")

    # 6) AI 모드 섹션 제안: 짧은 요청(자료 앞부분만, 제목만) → 답을 목록으로
    answers = {}
    def fake_ai(route):
        answers["prompt"] = json.loads(route.request.post_data)["prompt"]
        route.fulfill(status=200, content_type="text/plain; charset=utf-8", body=answers["body"])
    pg.route("**/api/ai", fake_ai)
    use_preset(pg, "fund"); ai_mode(pg)
    answers["body"] = "<think>음</think>1. 업무개요\n2. 변경 기준\n3. 처리 절차\n   - 접수\n   - 입력\n4. 사후 확인\n5. 유의사항"
    pg.click("#tpl-suggest"); pg.wait_for_selector("#tpl-use")
    print("6) AI 제안:", pg.input_value("#tpl-lines").split("\n"), "| 요청 길이", len(answers["prompt"]), "자 (본문 작성 요청보다 짧음)")
    if pg.input_value("#tpl-lines") != "업무개요\n변경 기준\n처리 절차\n- 접수\n- 입력\n사후 확인\n유의사항": errs.append("ai suggest parse")
    if len(answers["prompt"]) > 3600: errs.append("suggest prompt too long")
    pg.click("#tpl-use")
    answers["body"] = pg.evaluate("DATA.mock.fund"); out = gen(pg)
    print("   본문 요청에 확정 구성:", "'# 2. 변경 기준'" in answers["prompt"], "| 본문 요청 길이", len(answers["prompt"]), "자 | 초안:", out)

    # 7) AI 모드 고치기: 프롬프트에 기존 구성 규칙, AI가 다른 구성(6섹션)으로 답해도 기존 구성에 맞춘다
    pg.click("#nav-input"); use_preset(pg, "updKeep"); pg.wait_for_selector("#up-existing + .hint b"); out = gen(pg)
    print("7) AI 프롬프트 규칙:", "기존 매뉴얼의 섹션 구성(번호·제목·순서)을 그대로 유지한다" in answers["prompt"], "| 결과 = 기존 구성:", out == asis)
    if out != asis: errs.append("AI keep mode changed structure")
    print("오류:", errs); b.close()
