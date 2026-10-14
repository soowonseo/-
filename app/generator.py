"""매뉴얼 초안 생성. 지금은 모의 모드만 있다(API 모드는 11단계)."""
import json
import re

import db
import excel_parser
import manual_md
import storage
import word_parser
from config import ROOT

MOCK_DIR = ROOT / "mock"
LAST_SECTION = "6"


def _mock_markdown(manual, assets) -> str:
    """줄글 입력창이나 추가 업무명에 '자동재배분'이 있으면 자동재배분 예시를 쓴다."""
    folder = storage.upload_dir(manual["manual_id"])
    text = "".join((folder / a["file_name"]).read_text(encoding="utf-8")
                   for a in assets if a["asset_type"] == "줄글")
    text += manual["task_name"] or ""
    name = "mock_자동재배분.md" if "자동재배분" in text else "mock_manual.md"
    return (MOCK_DIR / name).read_text(encoding="utf-8")


def _place_images(sections: list[dict], assets) -> None:
    """업로드한 이미지를 배치한다. 사용자가 단계를 정했으면 그 자리, 아니면 초안의 자리,
    초안에도 없으면 '6. 관련 양식·쿼리' 끝에 모은다. 사용자가 쓴 설명이 있으면 그 설명을 쓴다."""
    by_no = {s["no"]: s for s in sections}
    for asset in assets:
        if not storage.is_image(asset["file_name"]):
            continue
        name = asset["file_name"]
        pattern = re.compile(r"\{\{IMAGE:" + re.escape(name) + r"(?:\|([^}]*))?\}\}")
        draft_caption = ""
        found_in = None
        for s in sections:
            match = pattern.search(s["text"])
            if match:
                draft_caption, found_in = match.group(1) or "", s
                break
        caption = asset["caption"] or draft_caption or name
        token = f"{{{{IMAGE:{name}|{caption}}}}}"
        target = by_no.get(asset["target_section"] or "")
        if found_in is not None and (target is None or target is found_in):
            found_in["text"] = pattern.sub(lambda _: token, found_in["text"], count=1)
            continue
        if found_in is not None:
            found_in["text"] = re.sub(r"\n{3,}", "\n\n", pattern.sub("", found_in["text"], count=1)).strip("\n")
        target = target or by_no.get(LAST_SECTION) or sections[-1]
        target["text"] = (target["text"].rstrip("\n") + f"\n\n{token}").strip("\n")


def generate(manual_id: str) -> None:
    """초안을 만들어 manual.content_md와 manual_section에 저장한다."""
    manual = db.get_manual(manual_id)
    assets = db.list_assets(manual_id)
    meta, body = manual_md.split_frontmatter(_mock_markdown(manual, assets))
    sections = manual_md.split_sections(body)
    _place_images(sections, assets)

    title = meta.get("title", "업무처리매뉴얼")
    task_name = manual["task_name"] or title.replace("업무처리매뉴얼", "").strip()
    version = 1
    asis = read_existing(manual)
    if asis and (manual["job_type"] == "갱신" or (manual["job_type"] == "추가" and asis.get("format") == "docx")):
        version = asis["version"] + 1   # Word는 문서 전체에 버전이 하나. 엑셀 추가는 새 시트라 v1
    meta = {"title": title, "dept": meta.get("dept", ""), "version": version}
    db.save_draft(manual_id, task_name=task_name, dept=meta["dept"], version=version,
                  content_md=manual_md.join_sections(meta, sections), sections=sections)


ASIS_FILE = "asis.json"


def read_existing(manual) -> dict | None:
    """기존 매뉴얼을 읽어 As-Is로 저장한다. Word는 문서 전체, 엑셀은 고른 시트 하나."""
    if not manual["source_file"]:
        return None
    folder = storage.upload_dir(manual["manual_id"])
    source = folder / manual["source_file"]
    if manual["source_format"] == "docx":
        asis = word_parser.parse_docx(source, folder)
    elif manual["job_type"] == "추가":
        # 엑셀에 업무 추가: 기존 시트는 건드리지 않으므로 시트 목록만 있으면 된다.
        asis = {"title": manual["source_file"], "version": 0, "history": [], "sections": [],
                "sheets": excel_parser.sheet_names(source)}
    elif manual["source_sheet"]:
        asis = excel_parser.parse_sheet(source, manual["source_sheet"], folder)
    else:
        return None
    asis["format"] = manual["source_format"]
    _register_for_qa(manual, source, asis)
    (folder / ASIS_FILE).write_text(json.dumps(asis, ensure_ascii=False), encoding="utf-8")
    return asis


def load_existing(manual_id: str) -> dict | None:
    path = storage.upload_dir(manual_id) / ASIS_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def task_label(title: str) -> str:
    """'변액보험 펀드변경 업무처리매뉴얼' → '변액보험 펀드변경'."""
    return re.sub(r"\s*업무(처리)?매뉴얼.*$", "", title).strip() or title


def _register_for_qa(manual, source, asis) -> None:
    """올린 기존 매뉴얼을 Q&A 자료로 등록한다. 엑셀은 갱신 대상이 아니어도 시트 전부(PRD 4장 3)."""
    if manual["source_format"] == "docx":
        db.register_uploaded(task_name=task_label(asis["title"]), title=asis["title"], version=asis["version"],
                             source_format="docx", source_file=manual["source_file"], source_sheet=None,
                             sections=asis["sections"])
        return
    folder = storage.upload_dir(manual["manual_id"])
    for sheet in excel_parser.sheet_names(source):
        parsed = excel_parser.parse_sheet(source, sheet, folder, prefix=f"qa_{sheet}_")
        if parsed["sections"]:
            db.register_uploaded(task_name=task_label(parsed["title"]), title=parsed["title"],
                                 version=parsed["version"], source_format="xlsx", source_file=manual["source_file"],
                                 source_sheet=sheet, sections=parsed["sections"])
