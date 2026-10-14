import re
from datetime import date

import streamlit as st

import db
import manual_md
import storage
import word_writer


def highlight(text: str) -> str:
    return text.replace(manual_md.CHECK_NEEDED, r":orange[**\[확인 필요\]**]")


def render_section_text(text: str, folder, images: set[str]) -> None:
    """본문은 마크다운으로, 이미지·캡처 자리는 그림이나 노란 칸으로 보여 준다."""
    pos = 0
    for m in manual_md.TOKEN_RE.finditer(text):
        if text[pos:m.start()].strip():
            st.markdown(highlight(text[pos:m.start()]))
        kind, value = m.groups()
        name, _, caption = value.partition("|")
        if kind == "IMAGE" and name in images:
            st.image(str(folder / name), caption=caption or name, width=480)
        else:
            st.warning(f"📷 [캡처 필요] {caption or name if kind == 'IMAGE' else value}")
        pos = m.end()
    if text[pos:].strip():
        st.markdown(highlight(text[pos:]))


st.title("📝 검토·확정")

manual_id = st.session_state.get("manual_id")
manual = db.get_manual(manual_id) if manual_id else None
if not manual or not manual["content_md"]:
    st.info("아직 초안이 없습니다. '1. 자료 입력'에서 자료를 넣고 [초안 생성]을 눌러 주세요.")
    st.stop()

assets = db.list_assets(manual_id)
folder = storage.upload_dir(manual_id)
images = {a["file_name"] for a in assets if storage.is_image(a["file_name"])}
meta, body = manual_md.split_frontmatter(manual["content_md"])
sections = manual_md.split_sections(body)
counts = manual_md.count_open_items(body, images)

st.subheader(meta.get("title", manual["task_name"]))
c1, c2, c3, c4 = st.columns(4)
c1.metric("작업", manual["job_type"])
c2.metric("버전", f"v{manual['version']} ({manual['status']})")
c3.metric("[확인 필요]", counts["check"])
c4.metric("[캡처 필요]", counts["capture"])
st.caption("문장 끝의 [메모]·[SQL] 같은 출처 태그는 화면에서만 보이고 최종 파일에서는 빠집니다.")

left, right = st.columns(2)
with left:
    st.markdown("### As-Is")
    if manual["job_type"] == "신규":
        free_text = next((a for a in assets if a["asset_type"] == "줄글"), None)
        if free_text:
            st.markdown("**줄글**")
            st.text((folder / free_text["file_name"]).read_text(encoding="utf-8"))
        raw = [a for a in assets if a["asset_type"] != "줄글"]
        if raw:
            st.markdown("**원자료 목록**")
            st.dataframe(
                [{"파일": a["file_name"], "종류": a["asset_type"], "배치 단계": a["target_section"] or "",
                  "설명": a["caption"] or ""} for a in raw],
                hide_index=True, width="stretch",
            )
        for a in assets:
            if storage.is_image(a["file_name"]):
                st.image(str(folder / a["file_name"]), caption=a["file_name"], width=240)
    else:
        st.caption(f"기존 매뉴얼: {manual['source_file']}"
                   + (f" > {manual['source_sheet']}" if manual["source_sheet"] else ""))
        st.info("기존 매뉴얼 내용 비교는 6~8단계에서 연결됩니다.")

with right:
    st.markdown("### To-Be")
    for s in sections:
        with st.container(border=True):
            st.markdown(f"{'####' if s['level'] == 1 else '#####'} {s['no']}. {s['title']}")
            render_section_text(s["text"], folder, images)

st.divider()
if manual["output_format"] == "docx":
    today = date.today().strftime("%Y.%m.%d")
    data = word_writer.build_docx(
        title=meta.get("title", manual["task_name"]), dept=manual["dept"] or "",
        version=manual["version"], sections=sections, image_dir=folder,
        revisions=[(manual["version"], today, "최초 작성", "", "")],
    )
    safe_name = re.sub(r"[\\/:*?\"<>|\s]+", "_", manual["task_name"] or "매뉴얼")
    st.download_button("초안 Word 받기", data, file_name=f"{safe_name}_업무처리매뉴얼_v{manual['version']}_초안.docx",
                       mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    st.caption("임시 버튼입니다. 4단계에서 [최종 컨펌] 후 다운로드로 바뀝니다.")
else:
    st.info("엑셀 출력은 5단계에서 연결됩니다.")
