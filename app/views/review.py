import re
import zlib
from datetime import date

import streamlit as st

import db
import manual_md
import storage
import word_writer

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def highlight(text: str) -> str:
    return text.replace(manual_md.CHECK_NEEDED, r":orange[**\[확인 필요\]**]")


def attach_capture(section, token: str, desc: str, uploaded) -> None:
    """[캡처 필요] 자리에 올린 캡처를 저장하고, 그 자리를 이미지로 바꾼다."""
    name = storage.save_upload(manual_id, uploaded)
    db.add_asset(manual_id, name, "전산화면", section["section_no"], desc)
    text = section["section_text"].replace(token, f"{{{{IMAGE:{name}|{desc}}}}}", 1)
    db.update_section(manual_id, manual["version"], section["section_no"], text)


def render_section_text(section, images: set[str], editable: bool) -> None:
    """본문은 마크다운으로, 이미지는 그림으로, 캡처가 없는 자리는 노란 칸(+업로드 버튼)으로 보여 준다."""
    text = section["section_text"]
    pos = 0
    for i, m in enumerate(manual_md.TOKEN_RE.finditer(text)):
        if text[pos:m.start()].strip():
            st.markdown(highlight(text[pos:m.start()]))
        kind, value = m.groups()
        name, _, caption = value.partition("|")
        if kind == "IMAGE" and name in images:
            st.image(str(folder / name), caption=caption or name, width=480)
        else:
            desc = (caption or name) if kind == "IMAGE" else value
            st.warning(f"📷 [캡처 필요] {desc}")
            if editable:
                uploaded = st.file_uploader("이 자리에 넣을 캡처 올리기", type=["png", "jpg", "jpeg"],
                                            key=f"cap_{section['section_id']}_{i}_{m.group(0)}")
                if uploaded is not None:
                    attach_capture(section, m.group(0), desc, uploaded)
                    st.rerun()
        pos = m.end()
    if text[pos:].strip():
        st.markdown(highlight(text[pos:]))


def feedback_box(section, last_feedback) -> None:
    """모의 모드: 피드백을 적고 본문을 직접 고친 뒤 [반영]. 본문을 안 고치면 '미반영'으로 남는다."""
    label = "✏️ 피드백·편집"
    if last_feedback:
        label += f" — {'✅ 반영' if last_feedback['status'] == '반영' else '⏳ 미반영'}"
    with st.expander(label):
        if last_feedback and last_feedback["comment"]:
            st.caption(f"마지막 피드백: {last_feedback['comment']}")
        key = section["section_id"]
        comment = st.text_input("피드백", key=f"fb_{key}", placeholder="예: 검증 오류 코드 설명을 추가해 주세요")
        # 본문이 바뀌면(캡처 업로드 등) 편집 칸도 새 본문으로 다시 채운다.
        version_tag = zlib.crc32(section["section_text"].encode("utf-8"))
        edited = st.text_area("본문 직접 편집", section["section_text"], height=220, key=f"ed_{key}_{version_tag}")
        if st.button("반영", key=f"apply_{key}"):
            changed = edited.strip() != section["section_text"].strip()
            if not changed and not comment.strip():
                st.toast("피드백이나 수정한 내용이 없습니다.")
                return
            if changed:
                db.update_section(manual_id, manual["version"], section["section_no"], edited.strip("\n"))
            db.add_feedback(manual_id, manual["version"], key, comment.strip() or "직접 편집",
                            "반영" if changed else "미반영")
            st.rerun()


def default_summary() -> str:
    applied = sorted({no for no in (section_no_by_id.get(f["section_id"]) for f in feedbacks
                                    if f["status"] == "반영") if no})
    base = "최초 작성" if manual["job_type"] == "신규" else "개정"
    return f"{base} ({', '.join(applied)} 피드백 반영)" if applied else base


st.title("📝 검토·확정")

manual_id = st.session_state.get("manual_id")
manual = db.get_manual(manual_id) if manual_id else None
if not manual or not manual["content_md"]:
    st.info("아직 초안이 없습니다. '1. 자료 입력'에서 자료를 넣고 [초안 생성]을 눌러 주세요.")
    st.stop()

confirmed = manual["status"] == "확정"
assets = db.list_assets(manual_id)
folder = storage.upload_dir(manual_id)
images = {a["file_name"] for a in assets if storage.is_image(a["file_name"])}
meta, body = manual_md.split_frontmatter(manual["content_md"])
title = meta.get("title", manual["task_name"])
sections = db.list_sections(manual_id, manual["version"])
section_no_by_id = {s["section_id"]: s["section_no"] for s in sections}
feedbacks = db.list_feedback(manual_id, manual["version"])
last_feedback = {f["section_id"]: f for f in feedbacks}
counts = manual_md.count_open_items(body, images)

st.subheader(title)
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
            st.markdown(f"{'####' if '-' not in s['section_no'] else '#####'} {s['section_no']}. {s['section_title']}")
            render_section_text(s, images, editable=not confirmed)
            if not confirmed:
                feedback_box(s, last_feedback.get(s["section_id"]))

st.divider()
safe_name = re.sub(r"[\\/:*?\"<>|\s]+", "_", manual["task_name"] or "매뉴얼")
file_name = f"{safe_name}_업무처리매뉴얼_v{manual['version']}.{manual['output_format']}"
output = storage.output_path(manual_id, file_name)

if confirmed:
    st.success(f"v{manual['version']} 확정 완료 — {manual['confirmed_by']} ({manual['confirmed_at'][:16].replace('T', ' ')}). "
               "Q&A 검색 자료로 등록되었습니다.")
    if output.exists():
        st.download_button("매뉴얼 내려받기", output.read_bytes(), file_name=file_name,
                           mime=DOCX_MIME, type="primary")
    else:
        st.info("엑셀 출력은 5단계에서 연결됩니다.")
    st.stop()

st.markdown("### 최종 컨펌")
unapplied = sum(1 for f in last_feedback.values() if f["status"] == "미반영")
if counts["check"] or counts["capture"]:
    st.warning(f"⚠️ 아직 [확인 필요] {counts['check']}곳, [캡처 필요] {counts['capture']}곳이 남아 있습니다. "
               "그대로 확정할 수도 있습니다. [확인 필요]는 최종 파일에 색으로 강조되고, "
               "[캡처 필요]는 회색 칸으로 남습니다.")
if unapplied:
    st.warning(f"⚠️ 반영하지 않은 피드백이 {unapplied}건 있습니다.")

c1, c2 = st.columns(2)
author = c1.text_input("작성자 (필수)", placeholder="예: 담당자A").strip()
reviewer = c2.text_input("검토자", placeholder="예: 파트장C").strip()
summary = st.text_input("개정내용", default_summary()).strip()

if st.button("최종 컨펌", type="primary", disabled=not author):
    db.confirm(manual_id, confirmed_by=author, change_summary=summary)
    if manual["output_format"] == "docx":
        today = date.today().strftime("%Y.%m.%d")
        doc_sections = [{"no": s["section_no"], "title": s["section_title"], "text": s["section_text"],
                         "level": 1 if "-" not in s["section_no"] else 2} for s in sections]
        output.write_bytes(word_writer.build_docx(
            title=title, dept=manual["dept"] or "", version=manual["version"], sections=doc_sections,
            image_dir=folder, revisions=[(manual["version"], today, summary, author, reviewer)],
        ))
    st.rerun()
if not author:
    st.caption("작성자를 입력하면 [최종 컨펌]을 누를 수 있습니다.")
