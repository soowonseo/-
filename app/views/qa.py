import streamlit as st

import db
import manual_md
import qa


CHECK_BADGE = r":orange[**\[확인 필요\]**]"


def tidy(line: str) -> str:
    """표 한 줄('| 항목 | 기준 |')은 '항목 — 기준'으로, 출처 태그는 빼고 보여 준다."""
    line = manual_md.strip_source_tags(line).strip()
    if line.startswith("|"):
        line = " — ".join(c.strip() for c in line.strip("|").split("|") if c.strip())
    return line


st.title("💬 매뉴얼 Q&A")

targets = qa.latest_only(db.searchable_sections())
manuals = {}
for r in targets:
    manuals.setdefault(r["manual_id"], r)
if not manuals:
    st.info("아직 검색할 매뉴얼이 없습니다. 매뉴얼을 확정하거나, 기존 매뉴얼을 올려 초안을 만들면 여기서 검색됩니다.")
    st.stop()

with st.expander(f"검색 대상 매뉴얼 {len(manuals)}건 (같은 업무는 최신 확정본만)"):
    st.dataframe(
        [{"업무": r["task_name"], "구분": "확정본" if r["origin"] != "업로드" else "업로드본",
          "버전": f"v{r['manual_version']}", "파일·시트": (r["source_file"] or "")
          + (f" > {r['source_sheet']}" if r["source_sheet"] else "")} for r in manuals.values()],
        hide_index=True, width="stretch",
    )

with st.form("ask"):
    question = st.text_input("질문", placeholder="예: 펀드변경 무료로 몇 번까지 돼?")
    asked = st.form_submit_button("질문하기", type="primary")

if asked and question.strip():
    st.session_state["qa_result"] = (question.strip(), qa.answer(question.strip()))

if "qa_result" in st.session_state:
    q, result = st.session_state["qa_result"]
    st.markdown(f"**Q. {q}**")
    if result["status"] == "없음":
        st.warning(result["answer"])
    elif result["status"] == "확인 필요":
        st.warning(result["answer"])
        for ln in result["lines"]:
            st.markdown("> " + tidy(ln).replace(manual_md.CHECK_NEEDED, CHECK_BADGE))
    else:
        st.success("\n\n".join(tidy(ln) for ln in result["lines"]))
    if result["hits"]:
        st.markdown("**근거**")
        for i, h in enumerate(result["hits"], 1):
            st.markdown(f"{i}. {h.label}" + (f"  \n   ↳ {tidy(h.best[0])}" if h.best else ""))
    st.caption("모의 모드: 질문 단어가 가장 많이 들어 있는 섹션의 원문을 보여 줍니다.")
