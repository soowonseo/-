"""기존 Word 매뉴얼 → 중간 형식(섹션별 마크다운). PRD 6장 5.

양식마다 제목 방식이 달라서 두 단계로 자른다.
① 제목 스타일(Heading 1/2/3)이면서 '1.' '4-1.'처럼 번호로 시작하는 문단
② ①이 하나도 없으면, 번호로 시작하는 굵은 문단
이미지는 파일로 저장해 {{IMAGE:}}로, 1칸짜리 표(쿼리 박스)는 ```sql 블록으로 바꾼다.
"""
import re
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

HEADING_NO_RE = re.compile(r"^(\d+(?:-\d+)*)\.\s*(.+)$")
BLIP = qn("a:blip")
EMBED = qn("r:embed")


def _heading(p: Paragraph, use_bold: bool):
    text = p.text.strip()
    m = HEADING_NO_RE.match(text)
    if not m:
        return None
    if use_bold:
        is_heading = any(r.bold for r in p.runs if r.text.strip())
    else:
        is_heading = p.style.name.startswith("Heading")
    return (m.group(1), m.group(2).strip()) if is_heading else None


def _is_revision_table(t: Table) -> bool:
    head = [c.text.strip() for c in t.rows[0].cells]
    return "버전" in head and "개정일" in head


def _table_md(t: Table) -> str:
    if len(t.rows) == 1 and len(t.columns) == 1:
        return "```sql\n" + t.rows[0].cells[0].text.strip("\n") + "\n```"
    rows = [[c.text.strip().replace("|", "/").replace("\n", " ") for c in r.cells] for r in t.rows]
    lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * len(rows[0])]
    lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(lines)


def parse_docx(path: Path, image_dir: Path, prefix: str = "asis_") -> dict:
    doc = Document(path)
    body = list(doc.element.body.iterchildren())
    paragraphs = [Paragraph(el, doc) for el in body if el.tag == qn("w:p")]
    use_bold = not any(_heading(p, use_bold=False) for p in paragraphs)

    title = next((p.text.strip() for p in paragraphs if p.style.name == "Title"), "")
    info = next((p.text for p in paragraphs if "버전" in p.text), "")
    m = re.search(r"버전\s*(\d+)", info)
    version = int(m.group(1)) if m else 0
    dept = info.split("|")[0].strip() if "|" in info else ""

    history, sections = [], []
    current = None
    image_count = 0
    skip_next_caption = False
    for el in body:
        if el.tag == qn("w:tbl"):
            t = Table(el, doc)
            if _is_revision_table(t):
                history = [tuple(c.text.strip() for c in r.cells) for r in t.rows[1:]]
            elif current is not None:
                current["lines"].append(_table_md(t))
            continue
        if el.tag != qn("w:p"):
            continue
        p = Paragraph(el, doc)
        head = _heading(p, use_bold)
        if head:
            no, sec_title = head
            current = {"no": no, "title": sec_title, "level": 1 if "-" not in no else 2, "lines": []}
            sections.append(current)
            continue
        if current is None:
            continue
        text = p.text.strip()
        if skip_next_caption and text.startswith("[그림]"):
            # 바로 앞 그림의 캡션 문단은 이미 {{IMAGE:…|설명}}에 넣었다.
            skip_next_caption = False
            continue
        for blip in el.iter(BLIP):
            part = doc.part.related_parts[blip.get(EMBED)]
            image_count += 1
            name = f"{prefix}{image_count}{Path(part.partname).suffix}"
            (image_dir / name).write_bytes(part.blob)
            caption = ""
            nxt = p._p.getnext()
            if nxt is not None and nxt.tag == qn("w:p"):
                nxt_text = Paragraph(nxt, doc).text.strip()
                if nxt_text.startswith("[그림]"):
                    caption = nxt_text.removeprefix("[그림]").strip()
                    skip_next_caption = True
            current["lines"].append(f"{{{{IMAGE:{name}|{caption}}}}}")
        if text:
            current["lines"].append(("- " + text) if p.style.name.startswith("List Bullet") else text)

    for s in sections:
        s["text"] = "\n\n".join(s.pop("lines"))
    if not version and history:
        version = max(int(h[0]) for h in history if h and h[0].isdigit())
    return {"title": title, "dept": dept, "version": version, "history": history, "sections": sections}
