"""기존 엑셀 매뉴얼(자유 배치형) 시트 하나 → 중간 형식(섹션별 마크다운). PRD 6장 6.

① 값이 있는 셀(행·열·텍스트·굵기)과 그림을 모은다.
② 그림 영역: 시작은 anchor._from, 끝 행은 TwoCellAnchor면 anchor.to.row,
   OneCellAnchor면 시작행 + 그림높이(px) ÷ 20.
③ 굵은 글씨이거나 '1.'로 시작하면 섹션 제목, ①②③으로 시작하면 절차 단계.
④ 그림 설명: (a) 그림 행 범위 안 + 그림 오른쪽·왼쪽 열 → 옆 설명,
   (b) 그림 끝 행 아래 2행 이내 → 아래 설명, (c) 그림 시작 행 바로 위 1행 → 그 그림의 단계 문장.
   두 그림에 다 해당하면 가장 가까운 그림에 붙인다.
⑤ 위→아래, 왼쪽→오른쪽으로 마크다운을 만든다.
한계: 텍스트 상자·말풍선(도형) 속 글자는 읽지 않는다.
"""
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl

PX_PER_ROW = 20
PX_PER_COL = 64
EMU_PER_PX = 9525
SECTION_RE = re.compile(r"^(\d+(?:-\d+)*)\.\s*(.+)$")
STEP_RE = re.compile(r"^[①-⑳]")
ARROW_RE = re.compile(r"^[←→↑↓]\s*")
SQL_RE = re.compile(r"^\s*(SELECT|WITH|UPDATE|INSERT|DELETE)\b", re.I)
META_DATE_RE = re.compile(r"(\d{4}\.\d{2}\.\d{2})")
AUTHOR_RE = re.compile(r"작성[:\s]\s*([^/]+)")
VERSION_RE = re.compile(r"버전\s*(\d+)")
HISTORY_RE = re.compile(r"v(\d+)\s+(\d{4}\.\d{2}\.\d{2})\s+(.+)")


QUERY_FILL = "F2F2F2"


@dataclass
class Cell:
    row: int
    col: int
    text: str
    bold: bool
    fill: str = ""


@dataclass
class Picture:
    row: int
    col: int
    end_row: int
    end_col: int
    name: str
    side: list = field(default_factory=list)
    below: list = field(default_factory=list)


def _picture_box(img) -> tuple[int, int, int, int]:
    anchor = img.anchor
    row, col = anchor._from.row + 1, anchor._from.col + 1
    if hasattr(anchor, "to") and anchor.to is not None:
        return row, col, anchor.to.row + 1, anchor.to.col + 1
    width = anchor.ext.width / EMU_PER_PX if getattr(anchor, "ext", None) else img.width
    height = anchor.ext.height / EMU_PER_PX if getattr(anchor, "ext", None) else img.height
    # 끝 행·열은 그림이 실제로 덮는 마지막 칸
    return row, col, row + max(math.ceil(height / PX_PER_ROW), 1) - 1, col + max(math.ceil(width / PX_PER_COL), 1) - 1


def _distance(cell: Cell, pic: Picture) -> int | None:
    """셀이 이 그림의 설명 후보면 거리(행), 아니면 None."""
    if pic.row <= cell.row <= pic.end_row and (cell.col > pic.end_col or cell.col < pic.col):
        return 0                                   # (a) 옆 설명
    if pic.end_row < cell.row <= pic.end_row + 2 and pic.col <= cell.col <= pic.end_col:
        return cell.row - pic.end_row              # (b) 아래 설명
    if cell.row == pic.row - 1:
        return 1                                   # (c) 바로 위 단계 문장
    return None


def parse_sheet(path: Path, sheet_name: str, image_dir: Path, prefix: str = "asis_") -> dict:
    wb = openpyxl.load_workbook(path)
    ws = wb[sheet_name]
    cells = [Cell(c.row, c.column, str(c.value).rstrip(), bool(c.font and c.font.b),
                  c.fill.fgColor.rgb[-6:] if c.fill.fill_type == "solid" and isinstance(c.fill.fgColor.rgb, str) else "")
             for row in ws.iter_rows() for c in row if c.value is not None and str(c.value).strip()]
    # 굵은 번호 제목이 있는 시트는 굵은 것만 제목으로 본다('1. …' 절차 문장과 구분).
    bold_headings = any(c.bold and SECTION_RE.match(c.text.strip()) for c in cells)

    def is_heading(c: Cell) -> bool:
        return bool(SECTION_RE.match(c.text.strip())) and (c.bold or not bold_headings)

    pictures = []
    for i, img in enumerate(sorted(ws._images, key=lambda im: (im.anchor._from.row, im.anchor._from.col)), 1):
        name = f"{prefix}{i}.png"
        (image_dir / name).write_bytes(img._data())
        pictures.append(Picture(*_picture_box(img), name=name))

    # 표지: 첫 섹션 제목 전의 셀
    first_section = next((c.row for c in cells if is_heading(c)), None)
    cover = [c for c in cells if first_section is None or c.row < first_section]
    body = [c for c in cells if c not in cover]
    title = next((c.text for c in cover if c.bold), cover[0].text if cover else sheet_name)
    meta_text = " ".join(c.text for c in cover if c.text != title)

    # ④ 설명을 가장 가까운 그림에 붙인다. 제목·절차 단계는 설명이 아니다.
    captions = set()
    for c in body:
        text = c.text.strip()
        if SECTION_RE.match(text) or STEP_RE.match(text) or c.bold or c.fill == QUERY_FILL:
            continue
        candidates = [(d, abs(c.row - p.row), p) for p in pictures if (d := _distance(c, p)) is not None]
        if not candidates:
            continue
        d, _, pic = min(candidates, key=lambda x: (x[0], x[1]))
        if d == 1 and c.row == pic.row - 1:
            continue                               # 단계 문장은 본문에 그대로 둔다
        (pic.side if d == 0 else pic.below).append(ARROW_RE.sub("", c.text))
        captions.add(id(c))

    # ⑤ 읽기 순서대로 섹션을 만든다. 그림은 시작 행 위치에 끼운다.
    #    같은 행에 칸이 여럿이면 표의 한 줄, 회색 칸이 이어지면 쿼리 블록으로 묶는다.
    by_row: dict[int, list[Cell]] = {}
    for c in body:
        if id(c) not in captions:
            by_row.setdefault(c.row, []).append(c)
    events = [(r, 0, "row", sorted(cs, key=lambda c: c.col)) for r, cs in by_row.items()]
    events += [(p.row, 1, "pic", p) for p in pictures]
    sections, current = [], None
    code, table = [], []

    def flush():
        if current is None:
            code.clear(); table.clear()
            return
        if code:
            current["lines"].append("```sql\n" + "\n".join(code) + "\n```")
            code.clear()
        if table:
            width = max(len(r) for r in table)
            rows = [r + [""] * (width - len(r)) for r in table]
            current["lines"].append("\n".join(["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
                                              + ["| " + " | ".join(r) + " |" for r in rows[1:]]))
            table.clear()

    for _, _, kind, obj in sorted(events, key=lambda x: (x[0], x[1])):
        if kind == "pic":
            flush()
            if current is not None:
                current["lines"].append(f"{{{{IMAGE:{obj.name}|{' / '.join(obj.side + obj.below)}}}}}")
            continue
        row = obj
        if len(row) == 1 and is_heading(row[0]):
            flush()
            m = SECTION_RE.match(row[0].text.strip())
            current = {"no": m.group(1), "title": m.group(2), "level": 1 if "-" not in m.group(1) else 2, "lines": []}
            sections.append(current)
            continue
        if row[0].fill == QUERY_FILL:
            if table:
                flush()
            code.append(row[0].text)
            continue
        if len(row) > 1:
            if code:
                flush()
            table.append([c.text.strip() for c in row])
            continue
        flush()
        if current is not None:
            text = row[0].text.strip()
            current["lines"].append(f"```sql\n{text}\n```" if SQL_RE.match(text) else text)
    flush()
    for s in sections:
        s["text"] = "\n\n".join(s.pop("lines"))

    # 버전·개정이력: 우리 출력 형식('개정이력: v1 … → v2 …')이 있으면 읽고, 없으면 작성일을 v1로 본다.
    history = []
    hist_line = next((c.text for c in cover if c.text.startswith("개정이력")), "")
    for part in hist_line.removeprefix("개정이력:").split("→"):
        if (m := HISTORY_RE.search(part.strip())):
            history.append((m.group(1), m.group(2), m.group(3).strip(), "", ""))
    if not history:
        date = META_DATE_RE.search(meta_text)
        author = AUTHOR_RE.search(meta_text)
        history = [("1", date.group(1) if date else "", "최초 작성",
                    author.group(1).strip() if author else "", "")]
    m = VERSION_RE.search(meta_text)
    version = int(m.group(1)) if m else max(int(h[0]) for h in history)
    return {"title": title, "dept": "", "version": version, "history": history, "sections": sections,
            "sheet": sheet_name, "pictures": len(pictures)}
